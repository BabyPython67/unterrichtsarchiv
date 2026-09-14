// Merge neuer Zeilen in den Bestand nach Dispatch §6. Entspricht speichern() im Prototyp.
//
//   ID unbekannt                      -> einfügen, ersterfasst = heute
//   ID bekannt, Text identisch        -> nichts
//   ID bekannt, Text abweichend       -> Text ersetzen, geaendert = heute
//   ID bekannt, Hausaufgabe neu dazu  -> Feld ergänzen, geaendert = heute
//   ID im Bestand, fehlt in Antwort   -> behalten (Archiv schrumpft nie)
//
// Zusatzregel im selben Geist: ein LEERES Feld in der neuen Antwort überschreibt nie einen
// vorhandenen Text. Sonst würde eine halb fehlgeschlagene Antwort (z. B. nur Hausaufgaben,
// Inhalte-Teilanfrage mit Fehler) gespeicherte Themen löschen.
// Reine Funktionen: Eingaben werden nicht verändert.
//
// Eigene Einträge: Hausaufgaben, die jemand selbst einträgt, weil sie nicht im Schulmanager stehen.
// Das sind normale Einträge mit position ab EIGENE_POSITION_AB. Der Schulmanager zählt je Kurs und
// Tag ab 1, ein Abruf trifft deshalb nie ihre ID, und sie stehen unter den Einträgen der Lehrkraft.
// Einzige Ausnahme von „Archiv schrumpft nie“: eigene Einträge lassen sich ändern und löschen,
// alle anderen nicht.

export function mergen(bestand, zeilen, heute) {
  const index = new Map(bestand.map((e) => [e.id, { ...e }]));
  let neu = 0, geaendert = 0, unveraendert = 0;
  for (const z of zeilen) {
    const thema = z.thema || "";
    const hausaufgabe = z.hausaufgabe || "";
    const alt = index.get(z.id);
    if (!alt) {
      index.set(z.id, {
        id: z.id, kurs: z.kurs, datum: z.datum, thema, hausaufgabe, position: z.position,
        ersterfasst: z.ersterfasst || heute,
        geaendert: z.geaendert || null,
        ...(z.geaendertUm ? { geaendertUm: z.geaendertUm } : {}),
        ...(istEigen(z) && bisGueltig(z.datum, z.bis) ? { bis: z.bis } : {}),
      });
      neu++;
      continue;
    }
    const neuesThema = thema && thema !== alt.thema ? thema : alt.thema;
    const neueHa = hausaufgabe && hausaufgabe !== alt.hausaufgabe ? hausaufgabe : alt.hausaufgabe;
    if (neuesThema !== alt.thema || neueHa !== alt.hausaufgabe) {
      alt.thema = neuesThema;
      alt.hausaufgabe = neueHa;
      alt.geaendert = heute;
      geaendert++;
    } else {
      unveraendert++;
    }
  }
  return { eintraege: [...index.values()], neu, geaendert, unveraendert };
}

// ---------------------------------------------------------------------------
// Eigene Einträge
// ---------------------------------------------------------------------------

export const EIGENE_POSITION_AB = 1001;

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

export const istEigen = (e) => !!e && Number.isInteger(e.position) && e.position >= EIGENE_POSITION_AB;

/** Abgabedatum („bis“) eines eigenen Eintrags: gültiges Datum nach dem Tag des Aufgebens. */
export const bisGueltig = (datum, bis) => typeof bis === "string" && DATUM.test(bis) && bis > datum;

function eigeneFelder({ kurs, datum, hausaufgabe, bis } = {}) {
  const text = typeof hausaufgabe === "string" ? hausaufgabe.trim() : "";
  if (typeof kurs !== "string" || !kurs) throw new Error("Kurs fehlt.");
  if (!DATUM.test(datum || "")) throw new Error("Datum fehlt.");
  if (!text) throw new Error("Hausaufgabe fehlt.");
  if (bis && !bisGueltig(datum, bis)) throw new Error("Abgabe muss nach dem Aufgabetag liegen.");
  return { kurs, datum, hausaufgabe: text, bis: bis || "" };
}

/** Eintrag mit dem Abgabedatum aus den Feldern; leeres bis entfernt das Feld. */
function mitBis(eintrag, bis) {
  const { bis: _alt, ...rest } = eintrag;
  return bis ? { ...rest, bis } : rest;
}

// Mit jetzt (ISO-Zeitstempel) wird die Position aus den Millisekunden gebildet, damit zwei Geräte
// beim Abgleich nie dieselbe ID vergeben. Ohne jetzt wird je Kurs und Tag ab 1001 gezählt.
function naechstePosition(eintraege, kurs, datum, jetzt) {
  let p = EIGENE_POSITION_AB - 1;
  for (const e of eintraege) if (e.kurs === kurs && e.datum === datum && istEigen(e)) p = Math.max(p, e.position);
  const ms = jetzt ? Date.parse(jetzt) : NaN;
  return Number.isSafeInteger(ms) ? Math.max(p + 1, ms) : p + 1;
}

/** → { eintraege, eintrag }. Wirft bei fehlendem Kurs, Datum oder Text. */
export function eigenenEintragAnlegen(eintraege, felder, heute, jetzt) {
  const f = eigeneFelder(felder);
  const position = naechstePosition(eintraege, f.kurs, f.datum, jetzt);
  const eintrag = mitBis({
    id: `${f.kurs}|${f.datum}|${position}`, kurs: f.kurs, datum: f.datum, thema: "", hausaufgabe: f.hausaufgabe,
    position, ersterfasst: heute, geaendert: null,
  }, f.bis);
  return { eintraege: [...eintraege, eintrag], eintrag };
}

/**
 * → { eintraege, eintrag }. Gleicher Kurs und Tag: Text ersetzen. Sonst zieht der Eintrag unter
 * einen neuen Schlüssel um, ersterfasst bleibt. Wirft, wenn die ID fehlt oder nicht eigen ist.
 */
export function eigenenEintragAendern(eintraege, id, felder, heute, jetzt) {
  const alt = eintraege.find((e) => e.id === id);
  if (!istEigen(alt)) throw new Error("Nur selbst eingetragene Einträge lassen sich ändern.");
  const f = eigeneFelder(felder);
  if (f.kurs === alt.kurs && f.datum === alt.datum) {
    if (f.hausaufgabe === alt.hausaufgabe && f.bis === (alt.bis || "")) return { eintraege, eintrag: alt };
    const eintrag = mitBis({ ...alt, hausaufgabe: f.hausaufgabe, geaendert: heute }, f.bis);
    return { eintraege: eintraege.map((e) => (e.id === id ? eintrag : e)), eintrag };
  }
  const rest = eintraege.filter((e) => e.id !== id);
  const position = naechstePosition(rest, f.kurs, f.datum, jetzt);
  const eintrag = mitBis({
    ...alt, id: `${f.kurs}|${f.datum}|${position}`, kurs: f.kurs, datum: f.datum, hausaufgabe: f.hausaufgabe,
    position, geaendert: heute,
  }, f.bis);
  return { eintraege: [...rest, eintrag], eintrag };
}

/** Entfernt den Eintrag nur, wenn er selbst eingetragen ist. */
export function eigenenEintragLoeschen(eintraege, id) {
  return eintraege.filter((e) => e.id !== id || !istEigen(e));
}

/** Nur die eigenen, neuestes Datum zuerst, am selben Tag der zuletzt angelegte zuerst. */
export function eigeneEintraege(eintraege) {
  return eintraege.filter(istEigen).sort((a, b) => b.datum.localeCompare(a.datum) || b.position - a.position);
}
