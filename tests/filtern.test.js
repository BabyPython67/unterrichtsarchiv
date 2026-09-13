import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filtern, gruppieren, kursListe, trefferZeile, eingegrenzt, zerlegen, anzeigename, kurseZaehlen, kurseSortiert, wochentag, datumLesbar, monatsName,
} from "../kern/filtern.js";
import { zeilenAusRohantwort } from "../kern/rohantwort.js";
import { kombiniert } from "./hilfen.js";

const alle = zeilenAusRohantwort(kombiniert()).zeilen;

test("filtern: Kurs", () => {
  const z = filtern(alle, { kurs: "Mathematik" });
  assert.equal(z.length, 4);
  assert.ok(z.every((e) => e.kurs === "Mathematik"));
});

test("filtern: Ab-Datum einschließlich", () => {
  const z = filtern(alle, { abDatum: "2026-09-09" });
  assert.ok(z.every((e) => e.datum >= "2026-09-09"));
  assert.ok(z.some((e) => e.datum === "2026-09-09"));
  assert.equal(filtern(alle, { abDatum: "" }).length, 27);
});

test("filtern: Suche ohne Groß/Klein, in Thema und Hausaufgabe", () => {
  assert.equal(filtern(alle, { suche: "ableitung" }).length, 1);
  assert.equal(filtern(alle, { suche: "  EUROPE " }).length, 1); // Thema und Hausaufgabe desselben Eintrags (Englisch 10.09.)
  const nurHa = filtern(alle, { suche: "moodle" });               // steht nur in einer Hausaufgabe (PsG1 09.09.)
  assert.equal(nurHa.length, 1);
  assert.ok(!nurHa[0].thema.toLowerCase().includes("moodle") && nurHa[0].hausaufgabe.includes("Moodle"));
  assert.equal(filtern(alle, { suche: "gibtsnicht" }).length, 0);
});

test("filtern: nur mit Hausaufgabe", () => {
  const z = filtern(alle, { nurHausaufgabe: true });
  assert.equal(z.length, 4);
  assert.ok(z.every((e) => e.hausaufgabe));
});

test("filtern: seit letzter Klausur je Kurs, Kurse ohne Schnitt bleiben komplett", () => {
  const schnitt = { Mathematik: "2026-09-07", Englisch: "2026-09-10" };
  const z = filtern(alle, { seitKlausur: true }, schnitt);
  assert.deepEqual(z.filter((e) => e.kurs === "Mathematik").map((e) => e.datum), ["2026-09-07", "2026-09-10"]);
  assert.deepEqual(z.filter((e) => e.kurs === "Englisch").map((e) => e.datum), ["2026-09-10"]);
  assert.equal(z.filter((e) => e.kurs === "Sport").length, 4);
  // mit gewähltem Kurs dasselbe wie abDatum = Schnitt
  assert.deepEqual(filtern(alle, { kurs: "Mathematik", seitKlausur: true }, schnitt),
    filtern(alle, { kurs: "Mathematik", abDatum: "2026-09-07" }));
  // Schalter aus -> kein Effekt
  assert.equal(filtern(alle, { seitKlausur: false }, schnitt).length, 27);
});

test("filtern: Kombination aller Filter", () => {
  const z = filtern(alle, { kurs: "Englisch", abDatum: "2026-09-04", suche: "vision", nurHausaufgabe: true });
  assert.deepEqual(z.map((e) => e.datum), ["2026-09-04", "2026-09-10"]);
});

test("gruppieren: Kurse nach Anzeigename sortiert, Alias nur beim Anzeigen, Monate getrennt, neueste zuerst", () => {
  const eintraege = [
    { id: "b", kurs: "Lateinisch, Beginn in Jahrgangsklasse 7", datum: "2026-10-02", position: 1, thema: "x", hausaufgabe: "" },
    { id: "a", kurs: "Lateinisch, Beginn in Jahrgangsklasse 7", datum: "2026-09-08", position: 2, thema: "y", hausaufgabe: "" },
    { id: "c", kurs: "Lateinisch, Beginn in Jahrgangsklasse 7", datum: "2026-09-08", position: 1, thema: "z", hausaufgabe: "" },
    { id: "d", kurs: "Mathematik", datum: "2026-09-03", position: 1, thema: "m", hausaufgabe: "" },
  ];
  const g = gruppieren(eintraege, { "Lateinisch, Beginn in Jahrgangsklasse 7": "Latein" });
  assert.deepEqual(g.map((k) => k.name), ["Latein", "Mathematik"]);
  assert.equal(g[0].kurs, "Lateinisch, Beginn in Jahrgangsklasse 7");
  assert.equal(g[0].anzahl, 3);
  assert.deepEqual(g[0].monate.map((m) => m.name), ["Oktober 2026", "September 2026"]);
  assert.deepEqual(g[0].monate[0].eintraege.map((e) => e.id), ["b"]);
  assert.deepEqual(g[0].monate[1].eintraege.map((e) => e.id), ["c", "a"]);   // gleicher Tag: Lieferreihenfolge
  assert.equal(g[0].von, "2026-09-08"); assert.equal(g[0].bis, "2026-10-02");
  // Alias sortiert Mathematik nach vorn -> Reihenfolge folgt dem Anzeigenamen
  assert.deepEqual(gruppieren(eintraege, { Mathematik: "Aaa" }).map((k) => k.name), ["Aaa", "Lateinisch, Beginn in Jahrgangsklasse 7"]);
  // Eingabe unverändert
  assert.equal(eintraege[0].kurs, "Lateinisch, Beginn in Jahrgangsklasse 7");
});

test("gruppieren: echte Daten -> 10 Kurse, 27 Einträge", () => {
  const g = gruppieren(alle);
  assert.equal(g.length, 10);
  assert.equal(g.reduce((s, k) => s + k.anzahl, 0), 27);
  assert.equal(g[0].name, "Deutsch");
});

test("kursListe: je Kurs Anzahl und letzter Eintrag, sortiert nach Anzeigename", () => {
  const l = kursListe(alle);
  assert.equal(l.length, 10);
  assert.equal(l[0].name, "Deutsch");
  const mathe = l.find((k) => k.kurs === "Mathematik");
  assert.deepEqual([mathe.anzahl, mathe.zuletzt, mathe.text], [4, "2026-09-10", "4 Einträge · zuletzt Do 10.09."]);
  assert.deepEqual(kursListe([{ kurs: "PsG1", datum: "2026-09-09" }], { PsG1: "Psychologie" }),
    [{ kurs: "PsG1", name: "Psychologie", anzahl: 1, zuletzt: "2026-09-09", text: "1 Eintrag · zuletzt Mi 09.09." }]);
  assert.deepEqual(kursListe([]), []);
});

test("trefferZeile: Einträge und Kurse, Einzahl", () => {
  assert.equal(trefferZeile([{ anzahl: 1 }]), "1 Eintrag in 1 Kurs");
  assert.equal(trefferZeile([{ anzahl: 3 }, { anzahl: 2 }]), "5 Einträge in 2 Kursen");
});

test("eingegrenzt: Suche und Zeitraum ja, Mit Hausaufgabe allein nein, Seit Klausur nur mit Datum", () => {
  assert.equal(eingegrenzt({}), false);
  assert.equal(eingegrenzt({ suche: "  " }), false);
  assert.equal(eingegrenzt({ suche: "Ableitung" }), true);
  assert.equal(eingegrenzt({ abDatum: "2026-09-01" }), true);
  assert.equal(eingegrenzt({ nurHausaufgabe: true }), false);
  const schnitt = { Mathematik: "2026-09-07" };
  assert.equal(eingegrenzt({ seitKlausur: true }, {}), false);
  assert.equal(eingegrenzt({ seitKlausur: true }, schnitt), true);
  assert.equal(eingegrenzt({ kurs: "Mathematik", seitKlausur: true }, schnitt), true);
  assert.equal(eingegrenzt({ kurs: "Englisch", seitKlausur: true }, schnitt), false);
});

test("zerlegen: Segmente mit Treffern, ohne Groß/Klein", () => {
  assert.deepEqual(zerlegen("Ableitung: Kettenregel, ableitung", "ABLEITUNG"), [
    { text: "Ableitung", treffer: true }, { text: ": Kettenregel, ", treffer: false }, { text: "ableitung", treffer: true },
  ]);
  assert.deepEqual(zerlegen("nix", "abc"), [{ text: "nix", treffer: false }]);
  assert.deepEqual(zerlegen("nix", ""), [{ text: "nix", treffer: false }]);
  assert.deepEqual(zerlegen("", "a"), []);
});

test("anzeigename, kurseZaehlen, kurseSortiert", () => {
  assert.equal(anzeigename("PsG1", { PsG1: "Psychologie" }), "Psychologie");
  assert.equal(anzeigename("PsG1", { PsG1: "   " }), "PsG1");
  assert.equal(anzeigename("PsG1", {}), "PsG1");
  assert.equal(kurseZaehlen(alle).Mathematik, 4);
  assert.deepEqual(kurseSortiert(["Ärger", "Zebra", "Apfel"]), ["Apfel", "Ärger", "Zebra"]);
});

test("wochentag, datumLesbar, monatsName", () => {
  assert.equal(wochentag("2026-09-03"), "Do 03.09.");
  assert.equal(wochentag("2026-09-07"), "Mo 07.09.");
  assert.equal(datumLesbar("2026-09-10T18:04:00.000Z"), "10.09.2026");
  assert.equal(datumLesbar(null), "");
  assert.equal(monatsName("2026-03"), "März 2026");
});
