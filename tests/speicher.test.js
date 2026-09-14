import { test } from "node:test";
import assert from "node:assert/strict";
import { leererBestand, lesen, schreiben, loeschen, pruefeBestand, exportText, exportDateiname, istExportDatei, defektSichern, SPEICHER_KEY, DEFEKT_KEY } from "../kern/speicher.js";
import { speicherStub } from "./hilfen.js";

test("leererBestand hat das Schema aus Dispatch §5 plus die v3-Felder aus §4", () => {
  assert.deepEqual(leererBestand(), {
    schemaVersion: 2, letzterAbruf: null, kursAlias: {}, klausurschnitt: {}, eintraege: [],
    stundenplan: { abgerufenAm: null, fenster: { von: null, bis: null }, tage: {} },
    kurszuordnung: {},
    sync: { letzterLauf: null, letzterErfolg: null, letzterFehler: null, quelle: null },
    einstellungen: {
      wochenplan: { fensterTage: 56, overrides: {} }, freieTage: [], schulbeginn: "08:00",
      altSchwelleTage: 21, stundenplanStaleTage: 7, startReiter: "archiv", syncWarnungNachTagen: 3,
    },
    geloescht: {},
    staende: {},
  });
});

test("lesen: Schema 1 wird migriert und als migriert gemeldet, Schema 2 nicht", () => {
  const s = speicherStub();
  s.setItem(SPEICHER_KEY, JSON.stringify({ schemaVersion: 1, letzterAbruf: null, kursAlias: {}, klausurschnitt: {},
    eintraege: [{ kurs: "Mathematik", datum: "2026-09-03", thema: "x", position: 1 }] }));
  const r = lesen(s);
  assert.equal(r.fehler, null);
  assert.equal(r.migriert, true);
  assert.equal(r.bestand.schemaVersion, 2);
  assert.equal(r.bestand.eintraege.length, 1);
  schreiben(s, r.bestand);
  assert.equal(lesen(s).migriert, false);
});

test("pruefeBestand: v3-Felder werden bereinigt, Lehrkraft im Stundenplan fliegt raus", () => {
  const b = pruefeBestand({ schemaVersion: 2, eintraege: [],
    stundenplan: { abgerufenAm: "2026-09-13T18:00:00.000Z", fenster: { von: "2026-09-14", bis: "2026-09-18" }, tage: {
      "2026-09-14": [{ stunde: 1, fach: "M LK", lehrer: "Name", raum: "A12", status: "entfall" }, { stunde: "2", fach: "E", status: "egal" }, { fach: "" }, null],
      "kein-datum": [], "2026-09-15": "text",
    } },
    kurszuordnung: { "M LK": { kurs: "Mathematik", quelle: "manuell", bestaetigt: true }, "E": { kurs: "" }, "D": { kurs: "Deutsch" }, "PH": { kurs: null, quelle: "auto" }, "X": { kurs: 5 } },
    sync: { letzterErfolg: "2026-09-10T06:00:00.000Z", letzterFehler: { zeit: "2026-09-11T06:00:00.000Z", art: 5 }, quelle: "fremd" },
    einstellungen: { wochenplan: { fensterTage: 0, overrides: { Mo: { A: "fix", B: "weg" }, Xx: { A: "aus" } } },
      freieTage: ["2026-10-12..2026-10-24", "kaputt", { von: "2026-11-02", bis: "2026-11-02" }, "2026-10-12..2026-10-24"],
      schulbeginn: "7:45", altSchwelleTage: 30, startReiter: "vorschau" },
  });
  assert.deepEqual(b.stundenplan.tage, { "2026-09-14": [
    { stunde: 1, fach: "M LK", raum: "A12", status: "entfall" },
    { stunde: 0, fach: "E", raum: "", status: "normal" },
  ] });
  assert.deepEqual(b.stundenplan.fenster, { von: "2026-09-14", bis: "2026-09-18" });
  assert.deepEqual(b.kurszuordnung, {
    "M LK": { kurs: "Mathematik", quelle: "manuell", bestaetigt: true },
    "D": { kurs: "Deutsch", quelle: "auto", bestaetigt: false },
    "PH": { kurs: null, quelle: "manuell", bestaetigt: true },       // „nicht anzeigen“ ist immer eine bewusste Entscheidung
  });
  assert.deepEqual(b.sync, { letzterLauf: null, letzterErfolg: "2026-09-10T06:00:00.000Z", letzterFehler: { zeit: "2026-09-11T06:00:00.000Z", art: "unbekannt", text: "" }, quelle: null });
  assert.deepEqual(b.einstellungen.wochenplan, { fensterTage: 56, overrides: { Mo: { A: "fix" } } });
  assert.deepEqual(b.einstellungen.freieTage, ["2026-10-12..2026-10-24", "2026-11-02"]);
  assert.equal(b.einstellungen.schulbeginn, "08:00");
  assert.equal(b.einstellungen.altSchwelleTage, 30);
  assert.equal(b.einstellungen.startReiter, "vorschau");
});

test("lesen: leer -> leerer Bestand ohne Fehler; schreiben/lesen ist verlustfrei", () => {
  const s = speicherStub();
  assert.deepEqual(lesen(s), { bestand: leererBestand(), fehler: null, migriert: false });
  const b = { ...leererBestand(), letzterAbruf: "2026-09-10T18:04:00.000Z", kursAlias: { PsG1: "Psychologie" }, klausurschnitt: { Mathematik: "2026-09-07" },
    eintraege: [{ id: "Mathematik|2026-09-03|1", kurs: "Mathematik", datum: "2026-09-03", thema: "x", hausaufgabe: "", position: 1, ersterfasst: "2026-09-10", geaendert: null }] };
  schreiben(s, b);
  assert.deepEqual(lesen(s).bestand, b);
  loeschen(s);
  assert.equal(s.getItem(SPEICHER_KEY), null);
});

test("lesen: kaputtes JSON oder fremdes Schema -> leerer Bestand plus Fehlertext, nichts überschrieben", () => {
  const s = speicherStub();
  s.setItem(SPEICHER_KEY, "{kaputt");
  const r = lesen(s);
  assert.deepEqual(r.bestand, leererBestand());
  assert.match(r.fehler, /unlesbar/);
  assert.equal(s.getItem(SPEICHER_KEY), "{kaputt");
  defektSichern(s);
  assert.equal(s.getItem(DEFEKT_KEY), "{kaputt");
  s.setItem(SPEICHER_KEY, JSON.stringify({ schemaVersion: 7, eintraege: [] }));
  assert.match(lesen(s).fehler, /Schema-Version 7/);
  const kaputt = { getItem() { throw new Error("blocked"); } };
  assert.match(lesen(kaputt).fehler, /nicht verfügbar/);
});

test("pruefeBestand: Müll-Einträge fliegen, ID wird neu berechnet, Alias nur Strings", () => {
  const b = pruefeBestand({ schemaVersion: 1, letzterAbruf: 5, kursAlias: { A: "B", C: 3 }, klausurschnitt: null, eintraege: [
    { id: "falsch", kurs: "Mathematik", datum: "2026-09-03", thema: "x", hausaufgabe: "", position: 2 },
    { kurs: "Mathematik", datum: "2026-09-03", thema: "dup", position: 2 },
    { kurs: "", datum: "2026-09-03", thema: "x" },
    { kurs: "Mathematik", datum: "3.9.2026", thema: "x" },
    { kurs: "Mathematik", datum: "2026-09-04", thema: "", hausaufgabe: "" },
    { kurs: "Mathematik", datum: "2026-09-05", thema: "ok" },
    null, "text",
  ] });
  assert.equal(b.letzterAbruf, null);
  assert.deepEqual(b.kursAlias, { A: "B" });
  assert.deepEqual(b.klausurschnitt, {});
  assert.deepEqual(b.eintraege.map((e) => e.id), ["Mathematik|2026-09-03|2", "Mathematik|2026-09-05|1"]);
  assert.equal(b.eintraege[1].ersterfasst, null);
  assert.throws(() => pruefeBestand({ schemaVersion: 1 }), /eintraege/);
  assert.throws(() => pruefeBestand(null), /Archiv/);
});

test("exportText ist wieder importierbar, Dateiname trägt das Datum", () => {
  const b = leererBestand();
  const text = exportText(b);
  assert.ok(istExportDatei(JSON.parse(text)));
  const { stundenplan, sync, ...ohneCache } = b;
  assert.deepEqual(JSON.parse(text), ohneCache);
  assert.deepEqual(pruefeBestand(JSON.parse(text)), b);
  assert.ok(istExportDatei({ schemaVersion: 1, eintraege: [] }));
  assert.equal(exportDateiname("2026-09-10"), "unterrichtsarchiv-export-2026-09-10.json");
  assert.equal(istExportDatei({ results: [] }), false);
});

test("Migration: letzterAbruf aus Schema 1 wird zum letzten Sync-Erfolg, Schema 2 bleibt unangetastet", () => {
  const v1 = pruefeBestand({ schemaVersion: 1, letzterAbruf: "2026-09-10T18:04:00.000Z", eintraege: [] });
  assert.equal(v1.sync.letzterErfolg, "2026-09-10T18:04:00.000Z");
  const v2 = pruefeBestand({ schemaVersion: 2, letzterAbruf: "2026-09-10T18:04:00.000Z", eintraege: [] });
  assert.equal(v2.sync.letzterErfolg, null);
});

test("pruefeBestand und Export behalten selbst eingetragene Einträge (position ab 1001) unverändert", () => {
  const b = leererBestand();
  b.eintraege = [{ id: "Chemie|2026-09-14|1001", kurs: "Chemie", datum: "2026-09-14", thema: "", hausaufgabe: "S. 45", position: 1001, ersterfasst: "2026-09-14", geaendert: null }];
  assert.deepEqual(pruefeBestand(JSON.parse(exportText(b))).eintraege, b.eintraege);
});
