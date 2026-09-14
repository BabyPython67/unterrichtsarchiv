import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergen, EIGENE_POSITION_AB, istEigen, eigenenEintragAnlegen, eigenenEintragAendern, eigenenEintragLoeschen, eigeneEintraege,
} from "../kern/mergen.js";
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

// Eigene Einträge ---------------------------------------------------------

const lehrkraft = (kurs, datum, position = 1, hausaufgabe = "") =>
  ({ id: `${kurs}|${datum}|${position}`, kurs, datum, thema: "Thema", hausaufgabe, position, ersterfasst: "2026-09-14", geaendert: null });
const felder = (kurs, datum, hausaufgabe) => ({ kurs, datum, hausaufgabe });

test("eigene Einträge: anlegen ab Position 1001 je Kurs und Tag, Text getrimmt, Eingabe unverändert", () => {
  const alt = [lehrkraft("Chemie", "2026-09-14")];
  const kopie = JSON.stringify(alt);
  const a = eigenenEintragAnlegen(alt, felder("Chemie", "2026-09-14", "  S. 45 Nr. 3 \n"), "2026-09-14");
  assert.equal(JSON.stringify(alt), kopie);
  assert.deepEqual(a.eintrag, {
    id: "Chemie|2026-09-14|1001", kurs: "Chemie", datum: "2026-09-14", thema: "", hausaufgabe: "S. 45 Nr. 3",
    position: 1001, ersterfasst: "2026-09-14", geaendert: null,
  });
  const b = eigenenEintragAnlegen(a.eintraege, felder("Chemie", "2026-09-14", "Protokoll"), "2026-09-14");
  assert.equal(b.eintrag.position, 1002);
  const c = eigenenEintragAnlegen(b.eintraege, felder("Physik", "2026-09-14", "x"), "2026-09-14");
  assert.equal(c.eintrag.position, EIGENE_POSITION_AB);
  assert.deepEqual(c.eintraege.map(istEigen), [false, true, true, true]);
});

test("eigene Einträge: ohne Kurs, Datum oder Text wird nichts angelegt", () => {
  assert.throws(() => eigenenEintragAnlegen([], felder("", "2026-09-14", "x"), "2026-09-14"), /Kurs/);
  assert.throws(() => eigenenEintragAnlegen([], felder("Chemie", "14.09.2026", "x"), "2026-09-14"), /Datum/);
  assert.throws(() => eigenenEintragAnlegen([], felder("Chemie", "2026-09-14", " \n "), "2026-09-14"), /Hausaufgabe/);
});

test("eigene Einträge: ein späterer Abruf lässt sie unberührt, auch mit Einträgen am selben Tag", () => {
  const { eintraege } = eigenenEintragAnlegen([], felder("Chemie", "2026-09-14", "S. 45"), "2026-09-14");
  const abruf = [
    { id: "Chemie|2026-09-14|1", kurs: "Chemie", datum: "2026-09-14", position: 1, thema: "Säuren", hausaufgabe: "S. 45 Nr. 3" },
    { id: "Chemie|2026-09-14|2", kurs: "Chemie", datum: "2026-09-14", position: 2, thema: "Basen", hausaufgabe: "" },
  ];
  const r = mergen(eintraege, abruf, "2026-09-15");
  assert.deepEqual([r.neu, r.geaendert, r.unveraendert], [2, 0, 0]);
  assert.deepEqual(r.eintraege.find((e) => e.id === "Chemie|2026-09-14|1001"), eintraege[0]);
  const nochmal = mergen(r.eintraege, eintraege, "2026-09-16");   // Export-Datei mit dem eigenen Eintrag erneut importiert
  assert.deepEqual([nochmal.neu, nochmal.geaendert, nochmal.eintraege.length], [0, 0, 3]);
});

test("eigene Einträge ändern: Text setzt geaendert; anderer Kurs oder Tag bekommt neuen Schlüssel, ersterfasst bleibt", () => {
  const a = eigenenEintragAnlegen([lehrkraft("Physik", "2026-09-15")], felder("Chemie", "2026-09-14", "S. 45"), "2026-09-14");
  const text = eigenenEintragAendern(a.eintraege, a.eintrag.id, felder("Chemie", "2026-09-14", "S. 46"), "2026-09-15");
  assert.equal(text.eintrag.id, "Chemie|2026-09-14|1001");
  assert.equal(text.eintrag.hausaufgabe, "S. 46");
  assert.equal(text.eintrag.geaendert, "2026-09-15");
  assert.equal(text.eintraege.length, 2);
  const gleich = eigenenEintragAendern(text.eintraege, text.eintrag.id, felder("Chemie", "2026-09-14", " S. 46 "), "2026-09-16");
  assert.equal(gleich.eintraege, text.eintraege, "gleicher Text: nichts geändert");
  const um = eigenenEintragAendern(text.eintraege, text.eintrag.id, felder("Physik", "2026-09-15", "S. 46"), "2026-09-16");
  assert.deepEqual(um.eintrag, {
    id: "Physik|2026-09-15|1001", kurs: "Physik", datum: "2026-09-15", thema: "", hausaufgabe: "S. 46",
    position: 1001, ersterfasst: "2026-09-14", geaendert: "2026-09-16",
  });
  assert.deepEqual(um.eintraege.map((e) => e.id), ["Physik|2026-09-15|1", "Physik|2026-09-15|1001"]);
});

test("eigene Einträge: Einträge aus dem Schulmanager lassen sich weder ändern noch löschen", () => {
  const alt = [lehrkraft("Chemie", "2026-09-14")];
  assert.throws(() => eigenenEintragAendern(alt, "Chemie|2026-09-14|1", felder("Chemie", "2026-09-14", "x"), "2026-09-15"), /selbst eingetragen/);
  assert.throws(() => eigenenEintragAendern(alt, "gibt|es|nicht", felder("Chemie", "2026-09-14", "x"), "2026-09-15"), /selbst eingetragen/);
  assert.deepEqual(eigenenEintragLoeschen(alt, "Chemie|2026-09-14|1"), alt);
});

test("eigene Einträge mit Uhrzeit: Position aus Millisekunden, zwei Geräte vergeben verschiedene IDs", () => {
  const t = "2026-09-14T08:00:00.000Z";
  const a = eigenenEintragAnlegen([], felder("Chemie", "2026-09-14", "S. 45"), "2026-09-14", t);
  assert.equal(a.eintrag.position, Date.parse(t));
  assert.ok(istEigen(a.eintrag));
  const b = eigenenEintragAnlegen([], felder("Chemie", "2026-09-14", "S. 46"), "2026-09-14", "2026-09-14T08:00:00.001Z");
  assert.notEqual(a.eintrag.id, b.eintrag.id);
  const c = eigenenEintragAnlegen(a.eintraege, felder("Chemie", "2026-09-14", "x"), "2026-09-14", t);
  assert.equal(c.eintrag.position, a.eintrag.position + 1, "gleiche Millisekunde: trotzdem eindeutig");
  const um = eigenenEintragAendern(a.eintraege, a.eintrag.id, felder("Physik", "2026-09-15", "S. 45"), "2026-09-15", "2026-09-15T09:00:00.000Z");
  assert.equal(um.eintrag.position, Date.parse("2026-09-15T09:00:00.000Z"));
  const gemergt = mergen([], [{ ...a.eintrag, geaendertUm: t }], "2026-09-14").eintraege[0];
  assert.equal(gemergt.geaendertUm, t, "Import aus Export-Datei behält geaendertUm");
});

test("eigene Einträge mit Abgabedatum: anlegen, nur bis ändern, entfernen, umziehen; ungültiges bis wirft", () => {
  const a = eigenenEintragAnlegen([], { ...felder("Deutsch", "2026-09-14", "Aufsatz"), bis: "2026-09-18" }, "2026-09-14");
  assert.equal(a.eintrag.bis, "2026-09-18");
  const ohne = eigenenEintragAnlegen([], { ...felder("Deutsch", "2026-09-14", "x"), bis: "" }, "2026-09-14");
  assert.equal("bis" in ohne.eintrag, false, "leeres bis legt kein Feld an");
  assert.throws(() => eigenenEintragAnlegen([], { ...felder("Deutsch", "2026-09-14", "x"), bis: "2026-09-14" }, "2026-09-14"), /Abgabe/);
  assert.throws(() => eigenenEintragAnlegen([], { ...felder("Deutsch", "2026-09-14", "x"), bis: "18.09.2026" }, "2026-09-14"), /Abgabe/);

  const gleich = eigenenEintragAendern(a.eintraege, a.eintrag.id, { ...felder("Deutsch", "2026-09-14", "Aufsatz"), bis: "2026-09-18" }, "2026-09-15");
  assert.equal(gleich.eintraege, a.eintraege, "gleicher Text und gleiches bis: nichts geändert");
  const spaeter = eigenenEintragAendern(a.eintraege, a.eintrag.id, { ...felder("Deutsch", "2026-09-14", "Aufsatz"), bis: "2026-09-21" }, "2026-09-15");
  assert.deepEqual([spaeter.eintrag.bis, spaeter.eintrag.geaendert], ["2026-09-21", "2026-09-15"]);
  const weg = eigenenEintragAendern(spaeter.eintraege, a.eintrag.id, felder("Deutsch", "2026-09-14", "Aufsatz"), "2026-09-16");
  assert.equal("bis" in weg.eintrag, false);
  const um = eigenenEintragAendern(a.eintraege, a.eintrag.id, { ...felder("Deutsch", "2026-09-16", "Aufsatz"), bis: "2026-09-18" }, "2026-09-16");
  assert.deepEqual([um.eintrag.id, um.eintrag.bis], ["Deutsch|2026-09-16|1001", "2026-09-18"]);
  assert.throws(() => eigenenEintragAendern(a.eintraege, a.eintrag.id, { ...felder("Deutsch", "2026-09-18", "Aufsatz"), bis: "2026-09-18" }, "2026-09-16"), /Abgabe/);
});

test("mergen: Import behält bis nur bei eigenen Einträgen mit gültigem Datum", () => {
  const eigen = { id: "Deutsch|2026-09-14|1001", kurs: "Deutsch", datum: "2026-09-14", position: 1001, thema: "", hausaufgabe: "Aufsatz", bis: "2026-09-18" };
  const lehrer = { id: "Deutsch|2026-09-14|1", kurs: "Deutsch", datum: "2026-09-14", position: 1, thema: "x", hausaufgabe: "y", bis: "2026-09-18" };
  const kaputt = { ...eigen, id: "Deutsch|2026-09-14|1002", position: 1002, bis: "2026-09-13" };
  const r = mergen([], [eigen, lehrer, kaputt], "2026-09-15").eintraege;
  assert.deepEqual(r.map((e) => e.bis), ["2026-09-18", undefined, undefined]);
});

test("eigene Einträge: löschen entfernt nur den einen; eigeneEintraege neuestes Datum zuerst", () => {
  let r = eigenenEintragAnlegen([lehrkraft("Chemie", "2026-09-14")], felder("Chemie", "2026-09-11", "a"), "2026-09-11");
  r = eigenenEintragAnlegen(r.eintraege, felder("Chemie", "2026-09-14", "b"), "2026-09-14");
  r = eigenenEintragAnlegen(r.eintraege, felder("Chemie", "2026-09-14", "c"), "2026-09-14");
  assert.deepEqual(eigeneEintraege(r.eintraege).map((e) => e.hausaufgabe), ["c", "b", "a"]);
  assert.deepEqual(eigenenEintragLoeschen(r.eintraege, "Chemie|2026-09-14|1001").map((e) => e.id),
    ["Chemie|2026-09-14|1", "Chemie|2026-09-11|1001", "Chemie|2026-09-14|1002"]);
});
