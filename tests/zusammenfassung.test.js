import { test } from "node:test";
import assert from "node:assert/strict";
import {
  kurseZusammenfassung, vorschauZusammenfassung, wochenplanZusammenfassung, freieTageZusammenfassung,
  faecherImStundenplan, faecherZusammenfassung, datenZusammenfassung, abgleichZusammenfassung,
} from "../kern/zusammenfassung.js";
import { leererBestand } from "../kern/speicher.js";

test("abgleichZusammenfassung: aus, ein, zuletzt heute/gestern/Datum, wartet, Fehler", () => {
  const jetzt = new Date(2026, 8, 14, 15, 0);
  const iso = (...t) => new Date(...t).toISOString();
  const s = { geheimnis: "x", letzter: null, fehler: null, ausstehend: false };
  assert.equal(abgleichZusammenfassung(null, jetzt), "Aus");
  assert.equal(abgleichZusammenfassung(s, jetzt), "Ein");
  assert.equal(abgleichZusammenfassung({ ...s, ausstehend: true }, jetzt), "Ein · wartet auf Verbindung");
  assert.equal(abgleichZusammenfassung({ ...s, letzter: iso(2026, 8, 14, 14, 2) }, jetzt), "Ein · zuletzt heute 14:02");
  assert.equal(abgleichZusammenfassung({ ...s, letzter: iso(2026, 8, 13, 7, 5) }, jetzt), "Ein · zuletzt gestern 07:05");
  assert.equal(abgleichZusammenfassung({ ...s, letzter: iso(2026, 8, 1, 9, 30), ausstehend: true }, jetzt), "Ein · zuletzt am 01.09. 09:30 · wartet auf Verbindung");
  assert.equal(abgleichZusammenfassung({ ...s, letzter: iso(2026, 8, 14, 14, 2), fehler: { art: "verweigert", text: "x" } }, jetzt), "Letzter Abgleich fehlgeschlagen");
});

const e = (kurs, datum) =>
  ({ id: `${kurs}|${datum}|1`, kurs, datum, thema: "x", hausaufgabe: "", position: 1, ersterfasst: "2026-09-01", geaendert: null });

test("kurseZusammenfassung und datenZusammenfassung zählen nur Kurse mit Einträgen", () => {
  const b = leererBestand();
  assert.equal(kurseZusammenfassung(b), "Noch keine Kurse");
  assert.equal(datenZusammenfassung(b), "Noch keine Einträge");
  b.eintraege = [e("Mathematik", "2026-09-07"), e("Mathematik", "2026-09-10"), e("Kunst", "2026-09-08")];
  b.klausurschnitt = { Mathematik: "2026-09-01", Physik: "2026-08-20" };   // Physik hat keine Einträge
  assert.equal(kurseZusammenfassung(b), "2 Kurse · 1 mit Klausurdatum");
  assert.equal(datenZusammenfassung(b), "3 Einträge");
  b.eintraege = [e("Kunst", "2026-09-08")];
  assert.equal(kurseZusammenfassung(b), "1 Kurs · 0 mit Klausurdatum");
  assert.equal(datenZusammenfassung(b), "1 Eintrag");
});

test("vorschauZusammenfassung: Beginn, Wochenplan-Overrides, freie Zeiträume", () => {
  assert.equal(vorschauZusammenfassung(undefined), "Beginn 08:00 · Wochenplan automatisch");
  const einst = {
    schulbeginn: "07:45", freieTage: ["2026-10-03", "2026-10-12..2026-10-24"],
    wochenplan: { overrides: { Mo: { Mathematik: "fix", Kunst: "aus" }, Di: { Physik: "fix" }, Mi: {} } },
  };
  assert.equal(wochenplanZusammenfassung(einst), "2 fest, 1 aus");
  assert.equal(wochenplanZusammenfassung({ wochenplan: { overrides: { Fr: { Sport: "fix" } } } }), "1 fest");
  assert.equal(freieTageZusammenfassung(einst), "2 freie Zeiträume");
  assert.equal(freieTageZusammenfassung({ freieTage: ["2026-10-03"] }), "1 freier Zeitraum");
  assert.equal(freieTageZusammenfassung({}), "keine");
  assert.equal(vorschauZusammenfassung(einst), "Beginn 07:45 · Wochenplan 2 fest, 1 aus · 2 freie Zeiträume");
});

test("faecherImStundenplan und faecherZusammenfassung: Cache plus bestehende Zuordnungen", () => {
  const b = leererBestand();
  assert.deepEqual(faecherImStundenplan(b), []);
  assert.equal(faecherZusammenfassung(b), "Stundenplan nicht abgerufen");
  b.stundenplan.tage = {
    "2026-09-14": [{ stunde: 1, fach: "Sport", raum: "", status: "normal" }, { stunde: 2, fach: "Biologie", raum: "", status: "entfall" }],
    "2026-09-15": [{ stunde: 1, fach: "Sport", raum: "", status: "normal" }],
  };
  b.kurszuordnung = { Sport: { kurs: "Sport", quelle: "auto", bestaetigt: false }, Chemie: { kurs: null, quelle: "manuell", bestaetigt: true } };
  assert.deepEqual(faecherImStundenplan(b), ["Biologie", "Chemie", "Sport"]);
  assert.equal(faecherZusammenfassung(b), "3 Fächer · 1 nicht zugeordnet");
  b.kurszuordnung.Biologie = { kurs: null, quelle: "manuell", bestaetigt: true };   // „Nicht anzeigen“ ist eine Entscheidung
  assert.equal(faecherZusammenfassung(b), "3 Fächer");
});
