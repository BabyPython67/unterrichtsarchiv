import { test } from "node:test";
import assert from "node:assert/strict";
import { mergen } from "../kern/mergen.js";
import {
  abrufBericht, berichtAnsicht, planAenderungen, pruefeBericht, eintragMarke, neuJeKurs, zeitKurz, NEU_LISTE_MAX,
} from "../kern/neuigkeiten.js";

const HEUTE = "2026-09-15";   // Dienstag
const zeile = (kurs, datum, position, thema = "", hausaufgabe = "") => ({ id: `${kurs}|${datum}|${position}`, kurs, datum, position, thema, hausaufgabe });
const plan = (tage) => ({ abgerufenAm: null, fenster: { von: "2026-09-14", bis: "2026-09-27" }, tage });
const bestand = (eintraege, extra = {}) => ({
  eintraege, kursAlias: {}, kurszuordnung: {}, stundenplan: { abgerufenAm: null, fenster: null, tage: {} },
  letzterAbruf: null, sync: {}, ...extra,
});

/** Abruf wie in importieren: mergen, neuer Bestand, Bericht. */
function abruf(vorher, zeilen, extra = {}) {
  const ergebnis = mergen(vorher.eintraege, zeilen, HEUTE);
  const nachher = { ...vorher, eintraege: ergebnis.eintraege, letzterAbruf: "2026-09-15T16:00:00.000Z", ...extra };
  return { nachher, bericht: abrufBericht({ vorher, nachher, ergebnis, heute: HEUTE }) };
}

test("zeitKurz: Wochentag, Datum und Uhrzeit in Ortszeit", () => {
  assert.equal(zeitKurz(new Date(2026, 8, 10, 18, 0).toISOString()), "Do 10.09., 18:00");
  assert.equal(zeitKurz("2026-09-10"), "Do 10.09.");
  assert.equal(zeitKurz("kaputt"), "");
  assert.equal(zeitKurz(null), "");
});

test("mergen: IDs für neu, geändert und nachgereichte Hausaufgabe", () => {
  const alt = [zeile("Mathematik", "2026-09-14", 1, "Ableitungen"), zeile("Deutsch", "2026-09-14", 1, "Novelle", "S. 3"), zeile("Latein", "2026-09-14", 1, "Lektion 11")];
  const r = mergen(alt, [
    zeile("Mathematik", "2026-09-14", 1, "Ableitungen", "S. 42"),
    zeile("Deutsch", "2026-09-14", 1, "Novelle, Merkmale", "S. 3"),
    zeile("Latein", "2026-09-14", 1, "Lektion 11, Vokabeln"),   // nur der Inhalt, weiter ohne Hausaufgabe
    zeile("Chemie", "2026-09-15", 1, "Redox"),
  ], HEUTE);
  assert.deepEqual(r.neueIds, ["Chemie|2026-09-15|1"]);
  assert.deepEqual(r.hausaufgabeNeuIds, ["Mathematik|2026-09-14|1"]);
  assert.deepEqual(r.geaenderteIds, ["Deutsch|2026-09-14|1", "Latein|2026-09-14|1"]);
  assert.equal(r.geaendert, 3);
});

test("erster Abruf: Archiv angelegt, keine Liste, keine Marken", () => {
  const vorher = bestand([]);
  const { nachher, bericht } = abruf(vorher, [zeile("Mathematik", "2026-09-14", 1, "A", "S. 1"), zeile("Mathematik", "2026-09-15", 1, "B"), zeile("Latein", "2026-09-15", 1, "C")],
    { stundenplan: plan({ "2026-09-21": [{ stunde: 1, fach: "Englisch", raum: "", status: "entfall" }] }) });
  assert.equal(bericht.erst, true);
  assert.deepEqual([bericht.neu, bericht.plan], [[], []]);
  assert.equal(bericht.planBis, "2026-09-27");
  const v = berichtAnsicht(bericht, nachher);
  assert.equal(v.art, "erst");
  assert.equal(v.titel, "Archiv angelegt");
  assert.equal(v.text, "3 Einträge aus 2 Kursen, Stundenplan bis So 27.09.");
  assert.equal(eintragMarke(bericht, "Mathematik|2026-09-14|1"), null);
  assert.equal(neuJeKurs(bericht, nachher.eintraege).size, 0);
});

test("erster Abruf zählt auch, wenn vorher nur selbst eingetragene Einträge da waren", () => {
  const eigen = { ...zeile("Mathematik", "2026-09-14", 1001, "", "Heft"), ersterfasst: HEUTE, geaendert: null };
  const { nachher, bericht } = abruf(bestand([eigen]), [zeile("Mathematik", "2026-09-14", 1, "A")]);
  assert.equal(bericht.erst, true);
  assert.equal(berichtAnsicht(bericht, nachher).text, "2 Einträge aus 1 Kurs.");
});

test("normaler Abruf: Hausaufgaben zuerst, dann Inhalte, Titel mit dem vorigen Abruf", () => {
  const seit = new Date(2026, 8, 10, 18, 0).toISOString();
  const vorher = bestand([zeile("Mathematik", "2026-09-10", 1, "Ableitungen"), zeile("Deutsch", "2026-09-10", 1, "Novelle", "S. 3")], { letzterAbruf: seit });
  const { nachher, bericht } = abruf(vorher, [
    zeile("Mathematik", "2026-09-10", 1, "Ableitungen", "S. 42 Nr. 3"),
    zeile("Deutsch", "2026-09-10", 1, "Novelle, Merkmale", "S. 3"),
    zeile("Chemie", "2026-09-14", 1, "Redox", "Versuch auswerten"),
    zeile("Englisch", "2026-09-14", 1, "Vocabulary"),
  ]);
  const v = berichtAnsicht(bericht, nachher);
  assert.equal(v.art, "liste");
  assert.equal(v.titel, "Neu seit Do 10.09., 18:00");
  assert.equal(v.zusammenfassung, "4 Einträge");
  assert.deepEqual(v.hausaufgaben.map((e) => [e.kurs, e.marke]), [["Chemie", "neu"], ["Mathematik", "Hausaufgabe neu"]]);
  assert.deepEqual(v.inhalte.map((e) => [e.kurs, e.marke]), [["Englisch", "neu"], ["Deutsch", "geändert"]]);
  assert.equal(eintragMarke(bericht, "Mathematik|2026-09-10|1"), "neu");
  assert.equal(eintragMarke(bericht, "Deutsch|2026-09-10|1"), "geändert");
  assert.equal(neuJeKurs(bericht, nachher.eintraege).get("Deutsch"), "1 geändert");
});

test("nichts Neues: Ansicht leer", () => {
  const vorher = bestand([zeile("Mathematik", "2026-09-10", 1, "A")]);
  const { nachher, bericht } = abruf(vorher, [zeile("Mathematik", "2026-09-10", 1, "A")]);
  assert.equal(berichtAnsicht(bericht, nachher).art, "leer");
});

test("viel Neues: Hausaufgaben einzeln, der Rest je Kurs gezählt", () => {
  const vorher = bestand([zeile("Mathematik", "2026-08-27", 1, "alt")], { letzterAbruf: "2026-08-28T10:00:00.000Z" });
  const neue = [
    zeile("Mathematik", "2026-09-14", 1, "a", "S. 42"), zeile("Mathematik", "2026-09-10", 1, "b"), zeile("Mathematik", "2026-09-08", 1, "c"),
    zeile("Deutsch", "2026-09-14", 1, "d"), zeile("Deutsch", "2026-09-08", 1, "e"),
    zeile("Latein", "2026-09-11", 1, "f", "Lektion 12"), zeile("Chemie", "2026-09-11", 1, "g"), zeile("Physik", "2026-09-09", 1, "h"),
  ];
  assert.ok(neue.length > NEU_LISTE_MAX);
  const { nachher, bericht } = abruf(vorher, neue);
  const v = berichtAnsicht(bericht, nachher);
  assert.equal(v.art, "kompakt");
  assert.deepEqual(v.hausaufgaben.map((e) => e.kurs), ["Mathematik", "Latein"]);
  assert.equal(v.weitereHausaufgaben, 0);
  assert.deepEqual(v.kurse.map((k) => [k.name, k.text]), [["Mathematik", "3 neu"], ["Deutsch", "2 neu"], ["Chemie", "1 neu"]]);
  assert.deepEqual(v.rest, { anzahl: 2, text: "2 neu" });
});

test("planAenderungen: nur neuer Entfall und neue Vertretung ab heute, Doppelstunde einmal", () => {
  const alt = plan({
    "2026-09-14": [{ stunde: 1, fach: "Latein", status: "normal" }],
    "2026-09-21": [{ stunde: 1, fach: "Englisch", status: "entfall" }, { stunde: 3, fach: "Mathematik", status: "normal" }],
  });
  const neu = plan({
    "2026-09-14": [{ stunde: 1, fach: "Latein", status: "entfall" }],
    "2026-09-21": [
      { stunde: 1, fach: "Englisch", status: "entfall" },
      { stunde: 3, fach: "Mathematik", status: "entfall" }, { stunde: 4, fach: "Mathematik", status: "entfall" },
    ],
    "2026-09-22": [{ stunde: 2, fach: "Chemie", status: "vertretung" }],
  });
  assert.deepEqual(planAenderungen(alt, neu, HEUTE), [
    { datum: "2026-09-21", fach: "Mathematik", status: "entfall" },
    { datum: "2026-09-22", fach: "Chemie", status: "vertretung" },
  ]);
  assert.deepEqual(planAenderungen(plan({}), neu, HEUTE), [], "erster Stundenplan: nichts neu");
  assert.deepEqual(planAenderungen(alt, alt, HEUTE), [], "kein Stundenplan geliefert");
});

test("Stundenplan in der Box: Kursname aus der Zuordnung, „Nicht anzeigen“ fällt weg", () => {
  const alt = plan({ "2026-09-16": [{ stunde: 1, fach: "Sport", status: "normal" }] });
  const vorher = bestand([zeile("Englisch LK", "2026-09-10", 1, "A")], {
    stundenplan: alt, letzterAbruf: "2026-09-10T16:00:00.000Z",
    kurszuordnung: { Englisch: { kurs: "Englisch LK", quelle: "auto", bestaetigt: false }, Sport: { kurs: null, quelle: "manuell", bestaetigt: true } },
  });
  const neu = plan({
    "2026-09-16": [{ stunde: 1, fach: "Sport", status: "entfall" }],
    "2026-09-21": [{ stunde: 1, fach: "Englisch", status: "entfall" }, { stunde: 2, fach: "Kunst", status: "vertretung" }],
  });
  const { nachher, bericht } = abruf(vorher, [zeile("Englisch LK", "2026-09-10", 1, "A")], { stundenplan: neu });
  const v = berichtAnsicht(bericht, nachher);
  assert.equal(v.art, "liste");
  assert.deepEqual(v.plan.map((p) => p.text), ["Englisch LK am Mo 21.09. entfällt", "Kunst am Mo 21.09. mit Vertretung"]);
  assert.deepEqual(v.plan.map((p) => p.kurs), ["Englisch LK", null]);
  assert.equal(v.zusammenfassung, "2 im Stundenplan");
});

test("Einträge, die es nicht mehr gibt, fallen aus der Box", () => {
  const vorher = bestand([zeile("Mathematik", "2026-09-10", 1, "A")]);
  const { nachher, bericht } = abruf(vorher, [zeile("Mathematik", "2026-09-10", 1, "A"), zeile("Latein", "2026-09-14", 1, "B")]);
  assert.equal(berichtAnsicht(bericht, { ...nachher, eintraege: vorher.eintraege }).art, "leer");
});

test("pruefeBericht: nimmt nur Brauchbares aus dem Speicher", () => {
  assert.equal(pruefeBericht(null), null);
  assert.equal(pruefeBericht({ neu: "x" }), null);
  const b = pruefeBericht({ neu: ["a"], geaendert: [], hausaufgabeNeu: [], plan: [{ datum: "2026-09-21", fach: "Englisch", status: "entfall" }, { datum: "x" }], offen: true, warnungen: ["w", 3] });
  assert.deepEqual(b.plan, [{ datum: "2026-09-21", fach: "Englisch", status: "entfall" }]);
  assert.deepEqual(b.warnungen, ["w"]);
  assert.equal(b.offen, true);
  assert.equal(b.erst, false);
});
