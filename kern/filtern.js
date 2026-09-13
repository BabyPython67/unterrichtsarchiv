// Filter, Gruppierung und Anzeige-Helfer. Reine Funktionen, kein DOM.
// Kursalias wird ausschließlich hier (beim Anzeigen) angewandt, nie in den Daten.

export const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"];
export const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function anzeigename(kurs, kursAlias = {}) {
  const a = kursAlias[kurs];
  return typeof a === "string" && a.trim() ? a.trim() : kurs;
}

/**
 * filter: { kurs, abDatum, suche, nurHausaufgabe, seitKlausur }
 * klausurschnitt: { [kursRoh]: "YYYY-MM-DD" }
 * "seitKlausur" wirkt je Kurs ab dessen Klausurdatum (einschließlich); Kurse ohne Datum
 * bleiben vollständig. Mit gewähltem Kurs ist das dasselbe wie abDatum = dessen Schnitt.
 */
export function filtern(eintraege, filter = {}, klausurschnitt = {}) {
  const { kurs = null, abDatum = "", suche = "", nurHausaufgabe = false, seitKlausur = false } = filter;
  const begriff = String(suche || "").trim().toLowerCase();
  return eintraege.filter((e) => {
    if (kurs && e.kurs !== kurs) return false;
    if (abDatum && e.datum < abDatum) return false;
    if (nurHausaufgabe && !e.hausaufgabe) return false;
    if (seitKlausur) {
      const schnitt = klausurschnitt[e.kurs];
      if (schnitt && e.datum < schnitt) return false;
    }
    if (begriff &&
        !e.thema.toLowerCase().includes(begriff) &&
        !e.hausaufgabe.toLowerCase().includes(begriff)) return false;
    return true;
  });
}

export function kurseZaehlen(eintraege) {
  const z = {};
  for (const e of eintraege) z[e.kurs] = (z[e.kurs] || 0) + 1;
  return z;
}

export function kurseSortiert(kurse, kursAlias = {}) {
  return [...kurse].sort((a, b) =>
    anzeigename(a, kursAlias).localeCompare(anzeigename(b, kursAlias), "de"));
}

export function monatsSchluessel(iso) { return iso.slice(0, 7); }

export function monatsName(schluessel) {
  const [j, m] = schluessel.split("-");
  return `${MONATE[Number(m) - 1]} ${j}`;
}

export const anzahlText = (n) => `${n} ${n === 1 ? "Eintrag" : "Einträge"}`;

/**
 * Nach Kurs (sortiert nach Anzeigename), darin mit Monatsblöcken, neueste zuerst. Mehrere
 * Einträge eines Tages bleiben in Lieferreihenfolge.
 */
export function gruppieren(eintraege, kursAlias = {}) {
  const nachKurs = new Map();
  for (const e of eintraege) {
    if (!nachKurs.has(e.kurs)) nachKurs.set(e.kurs, []);
    nachKurs.get(e.kurs).push(e);
  }
  return kurseSortiert(nachKurs.keys(), kursAlias).map((kurs) => {
    const liste = [...nachKurs.get(kurs)].sort((a, b) =>
      b.datum.localeCompare(a.datum) || a.position - b.position);
    const monate = [];
    for (const e of liste) {
      const s = monatsSchluessel(e.datum);
      if (!monate.length || monate[monate.length - 1].schluessel !== s) {
        monate.push({ schluessel: s, name: monatsName(s), eintraege: [] });
      }
      monate[monate.length - 1].eintraege.push(e);
    }
    return {
      kurs, name: anzeigename(kurs, kursAlias), anzahl: liste.length,
      von: liste[liste.length - 1].datum, bis: liste[0].datum, monate,
    };
  });
}

/** Archiv-Übersicht: je Kurs Anzahl und letzter Eintrag, sortiert nach Anzeigename. */
export function kursListe(eintraege, kursAlias = {}) {
  const je = new Map();
  for (const e of eintraege) {
    const k = je.get(e.kurs) || { anzahl: 0, zuletzt: "" };
    k.anzahl += 1;
    if (e.datum > k.zuletzt) k.zuletzt = e.datum;
    je.set(e.kurs, k);
  }
  return kurseSortiert(je.keys(), kursAlias).map((kurs) => {
    const { anzahl, zuletzt } = je.get(kurs);
    return { kurs, name: anzeigename(kurs, kursAlias), anzahl, zuletzt, text: `${anzahlText(anzahl)} · zuletzt ${wochentag(zuletzt)}` };
  });
}

/** Kopfzeile über Such- und Filterergebnissen aus allen Kursen, z. B. "12 Einträge in 4 Kursen". */
export function trefferZeile(gruppen) {
  const n = gruppen.reduce((s, g) => s + g.anzahl, 0);
  return `${anzahlText(n)} in ${gruppen.length} ${gruppen.length === 1 ? "Kurs" : "Kursen"}`;
}

/**
 * Grenzen Suche oder Zeitraum die Liste ein? Dann sind alle Monate offen, sonst nur der neueste.
 * "Mit Hausaufgabe" allein zählt nicht, das bleibt über das ganze Jahr lang. "Seit Klausur"
 * zählt nur, wenn ein Klausurdatum wirkt: mit Kurs dessen Datum, sonst irgendeins.
 */
export function eingegrenzt(filter = {}, klausurschnitt = {}) {
  const { kurs = null, suche = "", seitKlausur = false, abDatum = "" } = filter;
  if (String(suche || "").trim() || abDatum) return true;
  if (!seitKlausur) return false;
  return kurs ? Boolean(klausurschnitt[kurs]) : Object.values(klausurschnitt).some(Boolean);
}

/** Text in Segmente zerlegen: [{text, treffer}] — für die Hervorhebung ohne innerHTML. */
export function zerlegen(text, suchbegriff) {
  const b = String(suchbegriff || "").trim();
  const t = String(text ?? "");
  if (!b) return [{ text: t, treffer: false }];
  const bl = b.toLowerCase();
  const teile = [];
  let rest = t;
  let i;
  while ((i = rest.toLowerCase().indexOf(bl)) !== -1) {
    if (i > 0) teile.push({ text: rest.slice(0, i), treffer: false });
    teile.push({ text: rest.slice(i, i + b.length), treffer: true });
    rest = rest.slice(i + b.length);
  }
  if (rest) teile.push({ text: rest, treffer: false });
  return teile;
}

export function wochentag(iso) {
  const d = new Date(iso + "T12:00:00");
  const wt = (d.getDay() + 6) % 7;
  return `${WOCHENTAGE[wt]} ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
}

export function datumLesbar(iso) {
  if (!iso) return "";
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${t}.${m}.${j}`;
}
