// Bestand im localStorage (ein Key, JSON). Storage wird übergeben, damit die Logik ohne
// Browser testbar bleibt. Nutzerdaten liegen nur hier, nie in einem Cache oder auf einem Server.
//
// Schema 2 (Dispatch v3): zusätzlich stundenplan (Cache), kurszuordnung, sync und einstellungen.
// Schema 1 wird beim Lesen migriert: fehlende Felder bekommen Defaults, Einträge bleiben wie sie sind.

import { WOCHENTAGE } from "./filtern.js";
import { EINSTELLUNGEN_STANDARD, leererStundenplan } from "./logik.js";

export const SPEICHER_KEY = "unterrichtsarchiv:v1";   // Key bleibt, die Schema-Version steht im Objekt
export const DEFEKT_KEY = "unterrichtsarchiv:v1:defekt";
export const SCHEMA_VERSION = 2;
const LESBARE_SCHEMATA = [1, 2];
const DATUM_GENAU = /^\d{4}-\d{2}-\d{2}$/;
const DATUM_BEREICH = /^\d{4}-\d{2}-\d{2}(\.\.\d{4}-\d{2}-\d{2})?$/;
const UHRZEIT = /^\d{2}:\d{2}$/;
const STUNDEN_STATUS = ["normal", "entfall", "vertretung", "verlegt"];
const REITER = ["archiv", "vorschau"];
const OVERRIDE_ARTEN = ["fix", "aus"];
const SYNC_QUELLEN = ["bookmarklet", "script-ios", "script-android", "userscript"];

export function leererSync() {
  return { letzterLauf: null, letzterErfolg: null, letzterFehler: null, quelle: null };
}

export function standardEinstellungen() {
  return JSON.parse(JSON.stringify(EINSTELLUNGEN_STANDARD));
}

export function leererBestand() {
  return {
    schemaVersion: SCHEMA_VERSION,
    letzterAbruf: null,
    kursAlias: {},
    klausurschnitt: {},
    eintraege: [],
    stundenplan: leererStundenplan(),
    kurszuordnung: {},
    sync: leererSync(),
    einstellungen: standardEinstellungen(),
  };
}

export function istExportDatei(obj) {
  return !!obj && typeof obj === "object" && LESBARE_SCHEMATA.includes(obj.schemaVersion) && Array.isArray(obj.eintraege);
}

function nurStrings(o) {
  if (!o || typeof o !== "object") return {};
  return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === "string"));
}

const str = (v, sonst = null) => (typeof v === "string" ? v : sonst);
const zahl = (v, sonst) => (Number.isInteger(v) && v >= 0 ? v : sonst);

/** Stundenplan-Cache: nur Stunde, Fach, Raum, Status. Lehrkraft wird verworfen (Regel: keine Namen). */
function pruefeStundenplan(o) {
  const leer = leererStundenplan();
  if (!o || typeof o !== "object") return leer;
  const f = o.fenster && typeof o.fenster === "object" ? o.fenster : {};
  const von = DATUM_GENAU.test(f.von || "") ? f.von : null;
  const bis = DATUM_GENAU.test(f.bis || "") ? f.bis : null;
  const tage = {};
  for (const [datum, liste] of Object.entries(o.tage && typeof o.tage === "object" ? o.tage : {})) {
    if (!DATUM_GENAU.test(datum) || !Array.isArray(liste)) continue;
    tage[datum] = liste
      .filter((s) => s && typeof s === "object" && typeof s.fach === "string" && s.fach)
      .map((s) => ({
        stunde: zahl(s.stunde, 0),
        fach: s.fach,
        raum: str(s.raum, ""),
        status: STUNDEN_STATUS.includes(s.status) ? s.status : "normal",
      }));
  }
  return { abgerufenAm: str(o.abgerufenAm), fenster: von && bis && von <= bis ? { von, bis } : leer.fenster, tage };
}

function pruefeKurszuordnung(o) {
  const z = {};
  if (!o || typeof o !== "object") return z;
  for (const [fach, v] of Object.entries(o)) {
    if (!fach || !v || typeof v !== "object") continue;
    // kurs: null heißt „nicht anzeigen“ — eine bewusste Entscheidung, deshalb immer manuell und bestätigt.
    if (v.kurs === null) { z[fach] = { kurs: null, quelle: "manuell", bestaetigt: true }; continue; }
    if (typeof v.kurs !== "string" || !v.kurs) continue;
    z[fach] = { kurs: v.kurs, quelle: v.quelle === "manuell" ? "manuell" : "auto", bestaetigt: v.bestaetigt === true };
  }
  return z;
}

function pruefeSync(o, letzterAbruf = null) {
  const s = leererSync();
  // Schema 1 kannte nur letzterAbruf: als letzten Erfolg übernehmen, sonst warnt die Vorschau grundlos.
  s.letzterErfolg = letzterAbruf;
  if (!o || typeof o !== "object") return s;
  s.letzterLauf = str(o.letzterLauf);
  s.letzterErfolg = str(o.letzterErfolg) || letzterAbruf;
  if (o.letzterFehler && typeof o.letzterFehler === "object" && typeof o.letzterFehler.zeit === "string") {
    s.letzterFehler = { zeit: o.letzterFehler.zeit, art: str(o.letzterFehler.art, "unbekannt"), text: str(o.letzterFehler.text, "") };
  }
  s.quelle = SYNC_QUELLEN.includes(o.quelle) ? o.quelle : null;
  return s;
}

function pruefeEinstellungen(o) {
  const e = standardEinstellungen();
  if (!o || typeof o !== "object") return e;
  const w = o.wochenplan && typeof o.wochenplan === "object" ? o.wochenplan : {};
  if (Number.isInteger(w.fensterTage) && w.fensterTage > 0) e.wochenplan.fensterTage = w.fensterTage;
  for (const [tag, kurse] of Object.entries(w.overrides && typeof w.overrides === "object" ? w.overrides : {})) {
    if (!WOCHENTAGE.includes(tag) || !kurse || typeof kurse !== "object") continue;
    const sauber = Object.fromEntries(Object.entries(kurse).filter(([k, art]) => k && OVERRIDE_ARTEN.includes(art)));
    if (Object.keys(sauber).length) e.wochenplan.overrides[tag] = sauber;
  }
  if (Array.isArray(o.freieTage)) {
    e.freieTage = [...new Set(o.freieTage
      .map((f) => (f && typeof f === "object" && f.von ? (f.bis && f.bis !== f.von ? `${f.von}..${f.bis}` : f.von) : f))
      .filter((f) => typeof f === "string" && DATUM_BEREICH.test(f)))].sort();
  }
  if (UHRZEIT.test(o.schulbeginn || "")) e.schulbeginn = o.schulbeginn;
  e.altSchwelleTage = zahl(o.altSchwelleTage, e.altSchwelleTage);
  e.stundenplanStaleTage = zahl(o.stundenplanStaleTage, e.stundenplanStaleTage);
  e.syncWarnungNachTagen = zahl(o.syncWarnungNachTagen, e.syncWarnungNachTagen);
  if (REITER.includes(o.startReiter)) e.startReiter = o.startReiter;
  return e;
}

/** Prüft ein gelesenes Objekt und liefert einen sauberen Bestand im aktuellen Schema; wirft bei fremdem Schema. */
export function pruefeBestand(obj) {
  if (!obj || typeof obj !== "object") throw new Error("Kein Archiv-Objekt.");
  if (!LESBARE_SCHEMATA.includes(obj.schemaVersion)) {
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
    stundenplan: pruefeStundenplan(obj.stundenplan),
    kurszuordnung: pruefeKurszuordnung(obj.kurszuordnung),
    sync: pruefeSync(obj.sync, obj.schemaVersion === 1 && typeof obj.letzterAbruf === "string" ? obj.letzterAbruf : null),
    einstellungen: pruefeEinstellungen(obj.einstellungen),
  };
}

/**
 * Liest den Bestand; bei Problemen leerer Bestand plus Fehlertext (nichts wird überschrieben).
 * migriert = true, wenn ein älteres Schema gelesen wurde; der Aufrufer schreibt dann einmal zurück.
 */
export function lesen(storage) {
  let roh = null;
  try {
    roh = storage.getItem(SPEICHER_KEY);
  } catch {
    return { bestand: leererBestand(), fehler: "Der Browser-Speicher ist nicht verfügbar.", migriert: false };
  }
  if (!roh) return { bestand: leererBestand(), fehler: null, migriert: false };
  try {
    const obj = JSON.parse(roh);
    const bestand = pruefeBestand(obj);
    return { bestand, fehler: null, migriert: obj.schemaVersion !== SCHEMA_VERSION };
  } catch (e) {
    return { bestand: leererBestand(), fehler: `Gespeichertes Archiv unlesbar: ${e.message}`, migriert: false };
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

/** Export ohne Stundenplan-Cache und Sync-Status: beides ist neu abrufbar, die Kurszuordnung nicht. */
export function exportBestand(bestand) {
  const { stundenplan, sync, ...rest } = bestand;
  return rest;
}

export function exportText(bestand) {
  return JSON.stringify(exportBestand(bestand), null, 2);
}

export function exportDateiname(datumIso) {
  return `unterrichtsarchiv-export-${datumIso}.json`;
}
