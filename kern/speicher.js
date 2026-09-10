// Bestand im localStorage (ein Key, JSON). Storage wird übergeben, damit die Logik ohne
// Browser testbar bleibt. Nutzerdaten liegen nur hier, nie in einem Cache oder auf einem Server.

export const SPEICHER_KEY = "unterrichtsarchiv:v1";
export const DEFEKT_KEY = "unterrichtsarchiv:v1:defekt";
export const SCHEMA_VERSION = 1;
const DATUM_GENAU = /^\d{4}-\d{2}-\d{2}$/;

export function leererBestand() {
  return { schemaVersion: SCHEMA_VERSION, letzterAbruf: null, kursAlias: {}, klausurschnitt: {}, eintraege: [] };
}

export function istExportDatei(obj) {
  return !!obj && typeof obj === "object" && obj.schemaVersion === SCHEMA_VERSION && Array.isArray(obj.eintraege);
}

function nurStrings(o) {
  if (!o || typeof o !== "object") return {};
  return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === "string"));
}

/** Prüft ein gelesenes Objekt und liefert einen sauberen Bestand; wirft bei falschem Schema. */
export function pruefeBestand(obj) {
  if (!obj || typeof obj !== "object") throw new Error("Kein Archiv-Objekt.");
  if (obj.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unbekannte Schema-Version ${obj.schemaVersion}, erwartet ${SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(obj.eintraege)) throw new Error("Feld eintraege fehlt.");
  const eintraege = [];
  const gesehen = new Set();
  for (const e of obj.eintraege) {
    if (!e || typeof e !== "object") continue;
    if (typeof e.kurs !== "string" || !e.kurs || !DATUM_GENAU.test(e.datum || "")) continue;
    const position = Number.isInteger(e.position) && e.position > 0 ? e.position : 1;
    const thema = typeof e.thema === "string" ? e.thema : "";
    const hausaufgabe = typeof e.hausaufgabe === "string" ? e.hausaufgabe : "";
    if (!thema && !hausaufgabe) continue;
    const id = `${e.kurs}|${e.datum}|${position}`;
    if (gesehen.has(id)) continue;
    gesehen.add(id);
    eintraege.push({
      id, kurs: e.kurs, datum: e.datum, thema, hausaufgabe, position,
      ersterfasst: typeof e.ersterfasst === "string" ? e.ersterfasst : null,
      geaendert: typeof e.geaendert === "string" ? e.geaendert : null,
    });
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    letzterAbruf: typeof obj.letzterAbruf === "string" ? obj.letzterAbruf : null,
    kursAlias: nurStrings(obj.kursAlias),
    klausurschnitt: nurStrings(obj.klausurschnitt),
    eintraege,
  };
}

/** Liest den Bestand; bei Problemen leerer Bestand plus Fehlertext (nichts wird überschrieben). */
export function lesen(storage) {
  let roh = null;
  try {
    roh = storage.getItem(SPEICHER_KEY);
  } catch {
    return { bestand: leererBestand(), fehler: "Der Browser-Speicher ist nicht verfügbar." };
  }
  if (!roh) return { bestand: leererBestand(), fehler: null };
  try {
    return { bestand: pruefeBestand(JSON.parse(roh)), fehler: null };
  } catch (e) {
    return { bestand: leererBestand(), fehler: `Gespeichertes Archiv unlesbar: ${e.message}` };
  }
}

/** Sichert einen unlesbaren Rohwert unter einem zweiten Key, bevor er überschrieben würde. */
export function defektSichern(storage) {
  try {
    const roh = storage.getItem(SPEICHER_KEY);
    if (roh) storage.setItem(DEFEKT_KEY, roh);
  } catch { /* ohne Speicher gibt es nichts zu sichern */ }
}

export function schreiben(storage, bestand) {
  storage.setItem(SPEICHER_KEY, JSON.stringify(bestand));
}

export function loeschen(storage) {
  storage.removeItem(SPEICHER_KEY);
}

export function exportText(bestand) {
  return JSON.stringify(bestand, null, 2);
}

export function exportDateiname(datumIso) {
  return `unterrichtsarchiv-export-${datumIso}.json`;
}
