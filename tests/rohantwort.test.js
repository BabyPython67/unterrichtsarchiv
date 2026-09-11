import { test } from "node:test";
import assert from "node:assert/strict";
import { pruefeTeilantworten, zeilenAusRohantwort, entpacken, istRohdatenHuelle, HUELLE_TYP } from "../kern/rohantwort.js";
import { importieren } from "../kern/importieren.js";
import { leererBestand } from "../kern/speicher.js";
import { inhalte, hausaufgaben, kombiniert } from "./hilfen.js";

const huelle = (roh, extra = {}) => ({
  typ: HUELLE_TYP, version: 1, abgerufen: "2026-09-10T18:04:00.000Z",
  endpoints: ["get-topics", "get-homework"], roh, ...extra,
});

test("pruefeTeilantworten: Status ungleich 200 wird mit Endpoint-Name gemeldet", () => {
  const antwort = { results: [{ status: 404, data: null }, { status: 200, data: [] }] };
  const w = pruefeTeilantworten(antwort, ["get-topics", "get-homework"]);
  assert.equal(w.length, 1);
  assert.equal(w[0].index, 0); assert.equal(w[0].status, 404); assert.equal(w[0].endpoint, "get-topics");
  assert.match(w[0].text, /get-topics/); assert.match(w[0].text, /endpointName/);
  assert.deepEqual(pruefeTeilantworten(kombiniert()), []);
  assert.deepEqual(pruefeTeilantworten(null), []);
  assert.deepEqual(pruefeTeilantworten({ results: "x" }), []);
});

test("zeilenAusRohantwort: kombinierte Antwort -> 27 Zeilen, zwei Berichte", () => {
  const { zeilen, berichte } = zeilenAusRohantwort(kombiniert());
  assert.equal(zeilen.length, 27);
  assert.deepEqual(berichte.map((b) => b.art), ["Inhalte", "Hausaufgaben"]);
  assert.deepEqual(berichte.map((b) => b.anzahl), [27, 4]);
  assert.equal(berichte[1].text, "$.results[1].data: 4 Einträge (Hausaufgaben)");
});

test("zeilenAusRohantwort: einzelne Antworten funktionieren ebenso", () => {
  assert.equal(zeilenAusRohantwort(inhalte()).zeilen.length, 27);
  const ha = zeilenAusRohantwort(hausaufgaben()).zeilen;
  assert.equal(ha.length, 4);
  assert.ok(ha.every((z) => z.thema === "" && z.hausaufgabe));
});

test("entpacken / istRohdatenHuelle", () => {
  const h = huelle(kombiniert());
  assert.equal(istRohdatenHuelle(h), true);
  assert.equal(istRohdatenHuelle(kombiniert()), false);
  assert.equal(entpacken(h), h.roh);
  assert.equal(entpacken(kombiniert()).results.length, 2);
});

test("importieren: Hülle in leeren Bestand -> 27 neu, letzterAbruf aus der Hülle", () => {
  const r = importieren(leererBestand(), huelle(kombiniert()), "2026-09-10", "2026-09-10T20:00:00.000Z");
  assert.equal(r.art, "rohdaten");
  assert.deepEqual([r.ergebnis.neu, r.ergebnis.geaendert, r.ergebnis.unveraendert], [27, 0, 0]);
  assert.equal(r.bestand.letzterAbruf, "2026-09-10T18:04:00.000Z");
  assert.equal(r.bestand.eintraege.length, 27);
  assert.equal(r.warnungen.length, 0);
  const r2 = importieren(r.bestand, kombiniert(), "2026-09-11", "2026-09-11T20:00:00.000Z");
  assert.deepEqual([r2.ergebnis.neu, r2.ergebnis.unveraendert], [0, 27]);
  assert.equal(r2.bestand.letzterAbruf, "2026-09-11T20:00:00.000Z"); // nackte Antwort -> jetzt
});

test("importieren: Teilanfrage fehlgeschlagen -> Warnung, Rest wird verarbeitet, Themen bleiben", () => {
  const voll = importieren(leererBestand(), huelle(kombiniert()), "2026-09-10", "x").bestand;
  const kaputt = huelle({ results: [{ status: 500, data: null }, hausaufgaben().results[0]] });
  const r = importieren(voll, kaputt, "2026-09-12", "x");
  assert.equal(r.warnungen.length, 1);
  assert.match(r.warnungen[0].text, /get-topics/);
  assert.deepEqual([r.ergebnis.neu, r.ergebnis.geaendert, r.ergebnis.unveraendert], [0, 0, 4]);
  assert.ok(r.bestand.eintraege.find((e) => e.id === "Englisch|2026-09-03|1").thema.startsWith("Merkblatt"));
});

test("importieren: Export-Datei -> Einträge gemergt, lokaler Alias gewinnt, fremder füllt auf", () => {
  const lokal = { ...leererBestand(), kursAlias: { PsG1: "Psycho" }, klausurschnitt: {} };
  const ex = importieren(leererBestand(), huelle(kombiniert()), "2026-08-01", "x").bestand;
  ex.kursAlias = { PsG1: "Psychologie", SwZ6: "Sowi" };
  ex.klausurschnitt = { Mathematik: "2026-09-07" };
  const r = importieren(lokal, JSON.parse(JSON.stringify(ex)), "2026-09-10", "x");
  assert.equal(r.art, "export");
  assert.equal(r.ergebnis.neu, 27);
  assert.ok(r.bestand.eintraege.every((e) => e.ersterfasst === "2026-08-01"));
  assert.deepEqual(r.bestand.kursAlias, { PsG1: "Psycho", SwZ6: "Sowi" });
  assert.deepEqual(r.bestand.klausurschnitt, { Mathematik: "2026-09-07" });
  assert.equal(r.bestand.letzterAbruf, "2026-09-10T18:04:00.000Z");
});

test("importieren: falsche Schema-Version und Müll werden abgewiesen", () => {
  assert.throws(() => importieren(leererBestand(), { schemaVersion: 9, eintraege: [] }, "x", "x"), /Keine Unterrichtsdaten/);
  assert.throws(() => importieren(leererBestand(), { foo: "bar" }, "x", "x"), /Keine Unterrichtsdaten/);
  assert.throws(() => importieren(leererBestand(), huelle({ results: [{ status: 404, data: null }] }), "x", "x"), /get-topics/);
});
