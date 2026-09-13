import { test } from "node:test";
import assert from "node:assert/strict";
import { pruefeTeilantworten, zeilenAusRohantwort, entpacken, istRohdatenHuelle, HUELLE_TYP } from "../kern/rohantwort.js";
import { importieren } from "../kern/importieren.js";
import { leererBestand, pruefeBestand } from "../kern/speicher.js";
import { leererStundenplan } from "../kern/logik.js";
import { inhalte, hausaufgaben, kombiniert, kombiniert3, stundenplan } from "./hilfen.js";

const huelle = (roh, extra = {}) => ({
  typ: HUELLE_TYP, version: 1, abgerufen: "2026-09-10T18:04:00.000Z",
  endpoints: ["get-topics", "get-homework"], roh, ...extra,
});

/** Hülle, wie das Lesezeichen sie seit v3 schickt: drei Teilanfragen und das angefragte Fenster. */
const huelle3 = (roh, extra = {}) => huelle(roh, {
  endpoints: ["get-topics", "get-homework", "get-actual-lessons"],
  fenster: { von: "2026-09-07", bis: "2026-09-20" }, ...extra,
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

test("importieren: Hülle mit Stundenplan -> Einträge, Cache im angefragten Fenster, Kurse automatisch zugeordnet", () => {
  const r = importieren(leererBestand(), huelle3(kombiniert3()), "2026-09-10", "x");
  assert.equal(r.ergebnis.neu, 27);
  assert.equal(r.warnungen.length, 0);
  assert.deepEqual(r.stundenplan, { von: "2026-09-07", bis: "2026-09-20", tage: 5 });
  assert.deepEqual(r.bestand.stundenplan.fenster, { von: "2026-09-07", bis: "2026-09-20" });
  assert.equal(r.bestand.stundenplan.abgerufenAm, "2026-09-10T18:04:00.000Z");
  assert.deepEqual(r.berichte.map((b) => b.art), ["Inhalte", "Hausaufgaben", "stundenplan"]);
  assert.equal(r.berichte[2].text, "Stundenplan 2026-09-07 bis 2026-09-20: 5 Tage");
  const zu = r.bestand.kurszuordnung;
  assert.equal(zu.Mathematik.kurs, "Mathematik");
  assert.deepEqual(zu.PsG1, { kurs: "PsG1", quelle: "auto", bestaetigt: false });
  assert.equal(zu.Biologie, undefined);                       // kein Kurs dieses Namens im Archiv
  assert.deepEqual(pruefeBestand(JSON.parse(JSON.stringify(r.bestand))).kurszuordnung, zu);
});

test("importieren: Stundenplan-Teil fehlgeschlagen -> Warnung, Einträge kommen trotzdem, Cache bleibt leer", () => {
  const roh = { results: [inhalte().results[0], hausaufgaben().results[0], { status: 404, data: null }] };
  const r = importieren(leererBestand(), huelle3(roh), "2026-09-10", "x");
  assert.equal(r.ergebnis.neu, 27);
  assert.equal(r.warnungen.length, 1);
  assert.match(r.warnungen[0].text, /get-actual-lessons/);
  assert.equal(r.stundenplan, null);
  assert.deepEqual(r.bestand.stundenplan, leererStundenplan());
});

test("importieren: nackte Antwort mit Stundenplan wird am Inhalt erkannt; nur Stundenplan wirft nicht", () => {
  const r = importieren(leererBestand(), kombiniert3(), "2026-09-12", "2026-09-12T08:00:00.000Z");
  assert.equal(r.ergebnis.neu, 27);
  assert.deepEqual(r.stundenplan, { von: "2026-09-14", bis: "2026-09-18", tage: 5 });   // Fenster aus den Daten
  const nurPlan = huelle({ results: [stundenplan().results[0]] }, { endpoints: ["get-actual-lessons"] });
  const r2 = importieren(leererBestand(), nurPlan, "2026-09-12", "x");
  assert.equal(r2.ergebnis.neu, 0);
  assert.equal(r2.stundenplan.tage, 5);
});

test("importieren: Stundenplan leer geliefert -> Cache bleibt, Bericht sagt es", () => {
  const voll = importieren(leererBestand(), huelle3(kombiniert3()), "2026-09-10", "x").bestand;
  const roh = { results: [inhalte().results[0], hausaufgaben().results[0], { status: 200, data: [] }] };
  const r = importieren(voll, huelle3(roh, { fenster: { von: "2026-10-05", bis: "2026-10-18" } }), "2026-09-11", "x");
  assert.equal(r.ergebnis.unveraendert, 27);
  assert.equal(r.stundenplan, null);
  assert.equal(Object.keys(r.bestand.stundenplan.tage).length, 5);
  assert.match(r.berichte[2].text, /nichts im Zeitraum/);
});

test("importieren: falsche Schema-Version und Müll werden abgewiesen", () => {
  assert.throws(() => importieren(leererBestand(), { schemaVersion: 9, eintraege: [] }, "x", "x"), /Keine Unterrichtsdaten/);
  assert.throws(() => importieren(leererBestand(), { foo: "bar" }, "x", "x"), /Keine Unterrichtsdaten/);
  assert.throws(() => importieren(leererBestand(), huelle({ results: [{ status: 404, data: null }] }), "x", "x"), /get-topics/);
});
