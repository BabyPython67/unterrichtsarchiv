import { test } from "node:test";
import assert from "node:assert/strict";
import { leererBestand, lesen, schreiben, loeschen, pruefeBestand, exportText, exportDateiname, istExportDatei, defektSichern, SPEICHER_KEY, DEFEKT_KEY } from "../kern/speicher.js";
import { speicherStub } from "./hilfen.js";

test("leererBestand hat das Schema aus Dispatch §5", () => {
  assert.deepEqual(leererBestand(), { schemaVersion: 1, letzterAbruf: null, kursAlias: {}, klausurschnitt: {}, eintraege: [] });
});

test("lesen: leer -> leerer Bestand ohne Fehler; schreiben/lesen ist verlustfrei", () => {
  const s = speicherStub();
  assert.deepEqual(lesen(s), { bestand: leererBestand(), fehler: null });
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
  assert.deepEqual(JSON.parse(text), b);
  assert.equal(exportDateiname("2026-09-10"), "unterrichtsarchiv-export-2026-09-10.json");
  assert.equal(istExportDatei({ results: [] }), false);
});
