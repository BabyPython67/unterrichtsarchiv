import { test } from "node:test";
import assert from "node:assert/strict";
import { zusammenfuehren, aenderungenStempeln, stabil } from "../kern/abgleich.js";
import { leererBestand, pruefeBestand } from "../kern/speicher.js";
import { eigenenEintragAnlegen, eigenenEintragAendern, eigenenEintragLoeschen } from "../kern/mergen.js";

const JETZT = "2026-09-14T15:00:00.000Z";
const T1 = "2026-09-14T08:00:00.000Z";
const T2 = "2026-09-14T09:00:00.000Z";
const T3 = "2026-09-14T10:00:00.000Z";
const T4 = "2026-09-14T11:00:00.000Z";

const bestand = (teile = {}) => pruefeBestand({ ...leererBestand(), ...teile });
const lehrkraft = (kurs, datum, thema, hausaufgabe = "", geaendert = null) =>
  ({ id: `${kurs}|${datum}|1`, kurs, datum, thema, hausaufgabe, position: 1, ersterfasst: datum, geaendert });
const eigen = (kurs, datum, position, hausaufgabe, geaendertUm) =>
  ({ id: `${kurs}|${datum}|${position}`, kurs, datum, thema: "", hausaufgabe, position, ersterfasst: datum, geaendert: null, ...(geaendertUm ? { geaendertUm } : {}) });
const stunde = (fach, status = "normal") => ({ stunde: 1, fach, raum: "", status });

/** Führt in beide Richtungen zusammen und verlangt dasselbe Ergebnis. */
function beide(a, b, jetzt = JETZT) {
  const x = zusammenfuehren(a, b, jetzt).bestand;
  assert.equal(stabil(x), stabil(zusammenfuehren(b, a, jetzt).bestand), "Ergebnis hängt von der Reihenfolge ab");
  return x;
}

test("abgleich: Einträge beider Geräte werden vereinigt, neu zählt nur Fremdes", () => {
  const ms = Date.parse(T1);
  const a = bestand({ eintraege: [lehrkraft("Mathematik", "2026-09-10", "Ableitungen")] });
  const b = bestand({ eintraege: [lehrkraft("Deutsch", "2026-09-11", "Faust"), eigen("Chemie", "2026-09-14", ms, "S. 45", T1)] });
  const r = beide(a, b);
  assert.deepEqual(r.eintraege.map((e) => e.id), ["Mathematik|2026-09-10|1", "Deutsch|2026-09-11|1", `Chemie|2026-09-14|${ms}`]);
  assert.equal(zusammenfuehren(a, b, JETZT).neu, 2);
  assert.equal(zusammenfuehren(r, b, JETZT).neu, 0);
  assert.equal(r.eintraege[2].geaendertUm, T1);
});

test("abgleich: Schulmanager-Einträge — leeres Feld überschreibt nie, abweichender Text vom jüngeren geaendert", () => {
  const a = bestand({ eintraege: [lehrkraft("Mathematik", "2026-09-10", "Alt"), lehrkraft("Physik", "2026-09-10", "Optik")] });
  const b = bestand({ eintraege: [lehrkraft("Mathematik", "2026-09-10", "Neu", "S. 3", "2026-09-12"), lehrkraft("Physik", "2026-09-10", "", "S. 4")] });
  const r = beide(a, b);
  const m = r.eintraege.find((e) => e.kurs === "Mathematik");
  assert.deepEqual([m.thema, m.hausaufgabe, m.geaendert, m.ersterfasst], ["Neu", "S. 3", "2026-09-12", "2026-09-10"]);
  const p = r.eintraege.find((e) => e.kurs === "Physik");
  assert.deepEqual([p.thema, p.hausaufgabe], ["Optik", "S. 4"]);
});

test("abgleich: eigene Einträge — jüngeres geaendertUm gewinnt, Grabstein schlägt älteren Stand, jüngerer Stand schlägt Grabstein", () => {
  const ms = Date.parse(T1);
  const id = `Chemie|2026-09-14|${ms}`;
  const alt = bestand({ eintraege: [eigen("Chemie", "2026-09-14", ms, "S. 45", T1)] });
  const neu = bestand({ eintraege: [eigen("Chemie", "2026-09-14", ms, "S. 46", T2)] });
  assert.equal(beide(alt, neu).eintraege[0].hausaufgabe, "S. 46");

  const geloescht = bestand({ geloescht: { [id]: T3 } });
  const r = beide(geloescht, neu);
  assert.equal(r.eintraege.length, 0);
  assert.deepEqual(r.geloescht, { [id]: T3 });

  const spaeterGeaendert = bestand({ eintraege: [eigen("Chemie", "2026-09-14", ms, "S. 47", T4)] });
  assert.deepEqual(beide(geloescht, spaeterGeaendert).eintraege.map((e) => e.hausaufgabe), ["S. 47"]);
});

test("abgleich: Einträge aus dem Schulmanager bleiben trotz Grabstein (Archiv schrumpft nie)", () => {
  const a = bestand({ eintraege: [lehrkraft("Mathematik", "2026-09-10", "Ableitungen")] });
  const b = bestand({ geloescht: { "Mathematik|2026-09-10|1": T3 } });
  assert.equal(beide(a, b).eintraege.length, 1);
});

test("abgleich: zwei Geräte tragen für denselben Kurs und Tag ein — beide Einträge bleiben", () => {
  const f = { kurs: "Chemie", datum: "2026-09-14" };
  const ipad = eigenenEintragAnlegen([], { ...f, hausaufgabe: "S. 45" }, "2026-09-14", T1).eintraege;
  const handy = eigenenEintragAnlegen([], { ...f, hausaufgabe: "Protokoll" }, "2026-09-14", T2).eintraege;
  assert.equal(beide(bestand({ eintraege: ipad }), bestand({ eintraege: handy })).eintraege.length, 2);

  // Alte Einträge von vor dem Abgleich: beide mit 1001, verschiedener Text.
  const a = bestand({ eintraege: [eigen("Chemie", "2026-09-14", 1001, "S. 45")] });
  const b = bestand({ eintraege: [eigen("Chemie", "2026-09-14", 1001, "Protokoll")] });
  const r = beide(a, b);
  assert.deepEqual(r.eintraege.map((e) => [e.position, e.hausaufgabe]), [[1001, "Protokoll"], [1002, "S. 45"]]);
  assert.equal(stabil(beide(r, a)), stabil(r), "nochmal abgleichen erzeugt keine Dublette");
  assert.equal(stabil(beide(r, b)), stabil(r));
});

test("abgleich: Stundenplan — Fenster des jüngeren Abrufs ersetzt, ältere Tage außerhalb bleiben", () => {
  const a = bestand({ stundenplan: { abgerufenAm: "2026-09-07T18:00:00.000Z", fenster: { von: "2026-09-07", bis: "2026-09-20" },
    tage: { "2026-09-08": [stunde("M")], "2026-09-15": [stunde("D")] } } });
  const b = bestand({ stundenplan: { abgerufenAm: "2026-09-14T06:00:00.000Z", fenster: { von: "2026-09-14", bis: "2026-09-27" },
    tage: { "2026-09-15": [stunde("D", "entfall")] } } });
  const r = beide(a, b);
  assert.equal(r.stundenplan.abgerufenAm, "2026-09-14T06:00:00.000Z");
  assert.deepEqual(r.stundenplan.fenster, { von: "2026-09-07", bis: "2026-09-27" });
  assert.deepEqual(r.stundenplan.tage, { "2026-09-08": [stunde("M")], "2026-09-15": [stunde("D", "entfall")] });
  assert.equal(stabil(beide(a, bestand())), stabil(beide(bestand(), a)));
  assert.deepEqual(beide(a, bestand()).stundenplan.tage, a.stundenplan.tage, "Gerät ohne Stundenplan löscht nichts");
});

test("abgleich: Blöcke — jüngerer Stempel gewinnt ganz, ohne Stempel werden Schlüssel vereinigt", () => {
  const a = bestand({ kursAlias: { PsG1: "Psychologie" }, staende: { kursAlias: T2 } });
  const b = bestand({ kursAlias: { X: "Y" }, staende: { kursAlias: T1 } });
  const r = beide(a, b);
  assert.deepEqual(r.kursAlias, { PsG1: "Psychologie" });
  assert.deepEqual(r.staende, { kursAlias: T2 });

  assert.deepEqual(beide(bestand({ klausurschnitt: { A: "2026-09-01" } }), bestand({ klausurschnitt: { B: "2026-09-02" } })).klausurschnitt,
    { A: "2026-09-01", B: "2026-09-02" });

  const e1 = bestand({ einstellungen: { schulbeginn: "07:45" }, staende: { einstellungen: T1 } });
  const e2 = bestand({ einstellungen: { schulbeginn: "08:15" }, staende: { einstellungen: T2 } });
  assert.equal(beide(e1, e2).einstellungen.schulbeginn, "08:15");
});

test("abgleich: Kurszuordnung je Fach — manuell schlägt automatisch, Fächer beider Seiten bleiben", () => {
  const a = bestand({ kurszuordnung: { "M LK": { kurs: "Mathe", quelle: "manuell", bestaetigt: true } }, staende: { kurszuordnung: T1 } });
  const b = bestand({ kurszuordnung: { "M LK": { kurs: "Mathematik", quelle: "auto", bestaetigt: false }, D: { kurs: "Deutsch", quelle: "auto", bestaetigt: false } },
    staende: { kurszuordnung: T2 } });
  assert.deepEqual(beide(a, b).kurszuordnung, {
    "M LK": { kurs: "Mathe", quelle: "manuell", bestaetigt: true },
    D: { kurs: "Deutsch", quelle: "auto", bestaetigt: false },
  });
});

test("abgleich: sync und letzterAbruf jeweils der jüngste, alter Fehler verschwindet nach späterem Erfolg", () => {
  const a = bestand({ letzterAbruf: T1, sync: { letzterLauf: T3, letzterErfolg: T1, letzterFehler: { zeit: T3, art: "netz", text: "weg" }, quelle: "bookmarklet" } });
  const b = bestand({ letzterAbruf: T2, sync: { letzterLauf: T2, letzterErfolg: T2, letzterFehler: null, quelle: "bookmarklet" } });
  const r = beide(a, b);
  assert.equal(r.letzterAbruf, T2);
  assert.deepEqual(r.sync, { letzterLauf: T3, letzterErfolg: T2, letzterFehler: { zeit: T3, art: "netz", text: "weg" }, quelle: "bookmarklet" });
  const c = bestand({ sync: { letzterLauf: T4, letzterErfolg: T4, letzterFehler: null, quelle: "bookmarklet" } });
  assert.equal(beide(r, c).sync.letzterFehler, null);
});

test("abgleich: Grabsteine älter als 180 Tage fallen weg", () => {
  const a = bestand({ geloescht: { "A|2026-01-01|1001": "2026-01-02T08:00:00.000Z", "B|2026-09-01|1001": "2026-09-01T08:00:00.000Z" } });
  assert.deepEqual(Object.keys(beide(a, bestand()).geloescht), ["B|2026-09-01|1001"]);
});

test("aenderungenStempeln: neu, geändert, umgezogen, gelöscht und geänderte Blöcke", () => {
  const v0 = bestand({ eintraege: [lehrkraft("Chemie", "2026-09-14", "Säuren")] });
  assert.equal(aenderungenStempeln(null, v0, T1), v0);

  const r1 = eigenenEintragAnlegen(v0.eintraege, { kurs: "Chemie", datum: "2026-09-14", hausaufgabe: "S. 45" }, "2026-09-14", T1);
  const s1 = aenderungenStempeln(v0, { ...v0, eintraege: r1.eintraege }, T1);
  assert.equal(s1.eintraege.find((e) => e.id === r1.eintrag.id).geaendertUm, T1);
  assert.equal(s1.eintraege[0].geaendertUm, undefined, "Schulmanager-Einträge bekommen keinen Stempel");
  assert.deepEqual([s1.geloescht, s1.staende], [{}, {}]);

  const unveraendert = aenderungenStempeln(s1, { ...s1 }, T2);
  assert.equal(unveraendert.eintraege.find((e) => e.id === r1.eintrag.id).geaendertUm, T1);

  const r2 = eigenenEintragAendern(s1.eintraege, r1.eintrag.id, { kurs: "Chemie", datum: "2026-09-14", hausaufgabe: "S. 46" }, "2026-09-14", T2);
  const s2 = aenderungenStempeln(s1, { ...s1, eintraege: r2.eintraege }, T2);
  assert.equal(s2.eintraege.find((e) => e.id === r1.eintrag.id).geaendertUm, T2);

  const r3 = eigenenEintragAendern(s2.eintraege, r1.eintrag.id, { kurs: "Chemie", datum: "2026-09-15", hausaufgabe: "S. 46" }, "2026-09-15", T3);
  const s3 = aenderungenStempeln(s2, { ...s2, eintraege: r3.eintraege }, T3);
  assert.equal(s3.eintraege.find((e) => e.id === r3.eintrag.id).geaendertUm, T3);
  assert.deepEqual(s3.geloescht, { [r1.eintrag.id]: T3 });

  const s4 = aenderungenStempeln(s3, { ...s3, eintraege: eigenenEintragLoeschen(s3.eintraege, r3.eintrag.id), kursAlias: { Chemie: "Ch" } }, T4);
  assert.deepEqual(s4.geloescht, { [r1.eintrag.id]: T3, [r3.eintrag.id]: T4 });
  assert.deepEqual(s4.staende, { kursAlias: T4 });
});

test("abgleich: iPad trägt ein, Handy übernimmt, Handy löscht, iPad übernimmt das Löschen", () => {
  let ablage = null;
  const hochladen = (lokal, jetzt) => {
    const r = ablage ? zusammenfuehren(lokal, ablage, jetzt).bestand : lokal;
    ablage = r;
    return r;
  };
  const felder = { kurs: "Chemie", datum: "2026-09-14", hausaufgabe: "S. 45" };

  let ipad = bestand();
  const angelegt = eigenenEintragAnlegen(ipad.eintraege, felder, "2026-09-14", T1);
  ipad = hochladen(aenderungenStempeln(ipad, { ...ipad, eintraege: angelegt.eintraege }, T1), T1);

  let handy = hochladen(bestand(), T2);
  assert.deepEqual(handy.eintraege.map((e) => e.hausaufgabe), ["S. 45"]);

  handy = hochladen(aenderungenStempeln(handy, { ...handy, eintraege: eigenenEintragLoeschen(handy.eintraege, angelegt.eintrag.id) }, T3), T3);
  assert.equal(handy.eintraege.length, 0);

  ipad = hochladen(ipad, T4);
  assert.equal(ipad.eintraege.length, 0, "Löschen kommt auf dem iPad an");
});

test("pruefeBestand behält geaendertUm, Grabsteine und Stempel, Müll fliegt", () => {
  const ms = Date.parse(T1);
  const b = pruefeBestand({ ...leererBestand(),
    eintraege: [eigen("Chemie", "2026-09-14", ms, "S. 45", T1), { ...eigen("Chemie", "2026-09-15", 1001, "x"), geaendertUm: "gestern" }],
    geloescht: { "A|2026-09-01|1001": T1, kaputt: 5, alt: "2026-09-01" },
    staende: { kursAlias: T1, fremd: T1, einstellungen: 3 } });
  assert.equal(b.eintraege[0].geaendertUm, T1);
  assert.equal("geaendertUm" in b.eintraege[1], false);
  assert.deepEqual(b.geloescht, { "A|2026-09-01|1001": T1 });
  assert.deepEqual(b.staende, { kursAlias: T1 });
  const alt = pruefeBestand({ schemaVersion: 2, eintraege: [] });
  assert.deepEqual([alt.geloescht, alt.staende], [{}, {}]);
});
