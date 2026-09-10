import { test } from "node:test";
import assert from "node:assert/strict";
import { mergen } from "../kern/mergen.js";
import { zeilenAusRohantwort } from "../kern/rohantwort.js";
import { kombiniert } from "./hilfen.js";

const zeilen = () => zeilenAusRohantwort(kombiniert()).zeilen;

test("mergen: zweifacher Import derselben Antwort erzeugt keine Dubletten", () => {
  const e1 = mergen([], zeilen(), "2026-09-10");
  assert.equal(e1.neu, 27); assert.equal(e1.geaendert, 0); assert.equal(e1.unveraendert, 0);
  assert.ok(e1.eintraege.every((e) => e.ersterfasst === "2026-09-10" && e.geaendert === null));
  const e2 = mergen(e1.eintraege, zeilen(), "2026-09-11");
  assert.equal(e2.eintraege.length, 27);
  assert.deepEqual([e2.neu, e2.geaendert, e2.unveraendert], [0, 0, 27]);
  assert.ok(e2.eintraege.every((e) => e.ersterfasst === "2026-09-10"));
});

test("mergen: nachträglich geänderter Text wird ersetzt, geaendert gesetzt, ersterfasst bleibt", () => {
  const e1 = mergen([], zeilen(), "2026-09-10");
  const z = zeilen();
  const m = z.find((x) => x.id === "Mathematik|2026-09-03|1");
  m.thema = "Wiederholung: Ableitungsregeln und Umkehrfunktion";
  const e2 = mergen(e1.eintraege, z, "2026-09-12");
  assert.deepEqual([e2.neu, e2.geaendert, e2.unveraendert], [0, 1, 26]);
  const g = e2.eintraege.find((x) => x.id === "Mathematik|2026-09-03|1");
  assert.equal(g.thema, "Wiederholung: Ableitungsregeln und Umkehrfunktion");
  assert.equal(g.geaendert, "2026-09-12");
  assert.equal(g.ersterfasst, "2026-09-10");
});

test("mergen: Hausaufgabe kommt später dazu -> Feld ergänzt, geaendert gesetzt", () => {
  const e1 = mergen([], [{ id: "Physik|2026-09-08|1", kurs: "Physik", datum: "2026-09-08", position: 1, thema: "Wdh", hausaufgabe: "" }], "2026-09-08");
  const e2 = mergen(e1.eintraege, [{ id: "Physik|2026-09-08|1", kurs: "Physik", datum: "2026-09-08", position: 1, thema: "Wdh", hausaufgabe: "S. 5" }], "2026-09-09");
  assert.equal(e2.geaendert, 1);
  assert.equal(e2.eintraege[0].hausaufgabe, "S. 5");
  assert.equal(e2.eintraege[0].geaendert, "2026-09-09");
});

test("mergen: Eintrag fehlt in neuer Antwort -> bleibt erhalten", () => {
  const e1 = mergen([], zeilen(), "2026-09-10");
  const e2 = mergen(e1.eintraege, zeilen().slice(0, 5), "2026-09-11");
  assert.equal(e2.eintraege.length, 27);
  assert.deepEqual([e2.neu, e2.geaendert, e2.unveraendert], [0, 0, 5]);
});

test("mergen: leeres Feld in der neuen Antwort löscht keinen gespeicherten Text", () => {
  const alt = [{ id: "Mathematik|2026-09-03|1", kurs: "Mathematik", datum: "2026-09-03", position: 1, thema: "Ableitungen", hausaufgabe: "", ersterfasst: "2026-09-03", geaendert: null }];
  const e = mergen(alt, [{ id: "Mathematik|2026-09-03|1", kurs: "Mathematik", datum: "2026-09-03", position: 1, thema: "", hausaufgabe: "S. 3" }], "2026-09-10");
  assert.equal(e.geaendert, 1);
  assert.equal(e.eintraege[0].thema, "Ableitungen");
  assert.equal(e.eintraege[0].hausaufgabe, "S. 3");
});

test("mergen: verändert die Eingaben nicht", () => {
  const alt = [{ id: "A|2026-09-01|1", kurs: "A", datum: "2026-09-01", position: 1, thema: "x", hausaufgabe: "", ersterfasst: "2026-09-01", geaendert: null }];
  const kopie = JSON.stringify(alt);
  mergen(alt, [{ id: "A|2026-09-01|1", kurs: "A", datum: "2026-09-01", position: 1, thema: "y", hausaufgabe: "" }], "2026-09-02");
  assert.equal(JSON.stringify(alt), kopie);
});

test("mergen: mitgebrachtes ersterfasst (Export-Wiederherstellung) bleibt erhalten", () => {
  const e = mergen([], [{ id: "A|2026-09-01|1", kurs: "A", datum: "2026-09-01", position: 1, thema: "x", hausaufgabe: "", ersterfasst: "2026-05-01", geaendert: "2026-06-01" }], "2026-09-10");
  assert.equal(e.eintraege[0].ersterfasst, "2026-05-01");
  assert.equal(e.eintraege[0].geaendert, "2026-06-01");
});
