import { test } from "node:test";
import assert from "node:assert/strict";
import { istLektion, istStundenplanListe, fachName, stundenplanAusLektionen, STUNDENPLAN_ENDPOINT, STUNDENPLAN_MODUL } from "../kern/stundenplan.js";
import { pruefeBestand, leererBestand } from "../kern/speicher.js";
import { stundenplanUebernehmen, leererStundenplan } from "../kern/logik.js";
import { stundenplan, inhalte } from "./hilfen.js";

const lektionen = () => stundenplan().results[0].data;
const FENSTER = { von: "2026-09-07", bis: "2026-09-20" };
const ABGERUFEN = "2026-09-12T10:00:00.000Z";

test("Endpunkt-Konstanten: schedules/get-actual-lessons", () => {
  assert.equal(STUNDENPLAN_MODUL, "schedules");
  assert.equal(STUNDENPLAN_ENDPOINT, "get-actual-lessons");
});

test("istStundenplanListe: Stundenplan ja, Klassenbuch nein, leere Liste ja", () => {
  assert.equal(istStundenplanListe(lektionen()), true);
  assert.equal(istStundenplanListe(inhalte().results[0].data), false);
  assert.equal(istStundenplanListe([]), true);
  assert.equal(istStundenplanListe(null), false);
  assert.equal(istLektion({ date: "2026-09-14", classHour: { number: "1" } }), false); // weder actualLesson noch originalLessons
});

test("fachName: subject.name, sonst Kurskürzel, sonst Abkürzung, sonst null", () => {
  const l = (subject, subjectLabel) => ({ date: "2026-09-14", classHour: { number: "1" }, actualLesson: { subject, subjectLabel } });
  assert.equal(fachName(l({ name: "Mathematik", abbreviation: "M" }, "ML2")), "Mathematik");
  assert.equal(fachName(l({ name: null, abbreviation: "PsG" }, "PsG1")), "PsG1");
  assert.equal(fachName(l({ name: "  ", abbreviation: "BI" }, "")), "BI");
  assert.equal(fachName(l({}, "")), null);
});

test("stundenplanAusLektionen: 5 Tage sortiert, je Tag nach Stundennummer, Fach = Name aus dem Klassenbuch", () => {
  const p = stundenplanAusLektionen(lektionen(), FENSTER, ABGERUFEN);
  // 34 Lektionen, davon 2 Klausuren fremder Kurse (PsG3 am 14.09., Biologie am 16.09.)
  assert.deepEqual({ von: p.von, bis: p.bis, abgerufenAm: p.abgerufenAm, anzahl: p.anzahl }, { ...FENSTER, abgerufenAm: ABGERUFEN, anzahl: 32 });
  assert.deepEqual(Object.keys(p.tage), ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"]);
  assert.deepEqual(p.tage["2026-09-14"], [
    { stunde: 2, fach: "Sport", raum: "R13", status: "normal" },
    { stunde: 3, fach: "Mathematik", raum: "R07", status: "normal" },
    { stunde: 4, fach: "Mathematik", raum: "R07", status: "normal" },
    { stunde: 5, fach: "Kunst", raum: "R08", status: "entfall" },
    { stunde: 6, fach: "Kunst", raum: "R08", status: "entfall" },
  ]);
  assert.deepEqual(p.tage["2026-09-17"].map((s) => `${s.stunde} ${s.fach}`),
    ["1 Sport", "2 Sport", "3 Kunst", "4 Mathematik", "5 Englisch", "6 Englisch", "8 SwZ6", "9 SwZ6"]);
  assert.deepEqual(p.tage["2026-09-16"].map((s) => `${s.stunde} ${s.fach}`),
    ["1 Physik", "2 Physik", "3 Deutsch", "4 PsG1", "5 Geschichte", "6 Geschichte"]);
  assert.equal(p.tage["2026-09-15"][0].fach, "Lateinisch, Beginn in Jahrgangsklasse 7");
});

test("stundenplanAusLektionen: Sondertermin einer fremden Lerngruppe fällt weg, der eigenen Gruppe bleibt", () => {
  const l = (number, type, fach, gruppen) => ({ date: "2026-09-14", classHour: { number }, type, actualLesson: { subject: { name: fach }, studentGroups: gruppen.map((id) => ({ id })) } });
  const eingabe = [
    l("1", "regularLesson", "Mathematik", [1]),
    l("2", "specialLesson", "Biologie", [9]),    // Klausur eines anderen Kurses -> weg
    l("3", "specialLesson", "Mathematik", [1]),  // Termin der eigenen Gruppe -> bleibt
    l("4", "specialLesson", "Projekttag", []),   // ohne Gruppe nicht beurteilbar -> bleibt
    { date: "2026-09-14", classHour: { number: "5" }, type: "cancelledLesson", isCancelled: true, originalLessons: [{ subject: { name: "Kunst" }, studentGroups: [{ id: 2 }] }] },
    l("6", "specialLesson", "Kunst", [2, 7]),    // eigene Gruppe nur aus der entfallenden Stunde bekannt -> bleibt
  ];
  assert.deepEqual(stundenplanAusLektionen(eingabe, null, null).tage["2026-09-14"].map((s) => `${s.stunde} ${s.fach}`),
    ["1 Mathematik", "3 Mathematik", "4 Projekttag", "5 Kunst", "6 Kunst"]);
  // Nur Sondertermine, also keine eigenen Gruppen zum Vergleich: nichts wird weggelassen
  assert.equal(stundenplanAusLektionen([l("2", "specialLesson", "Biologie", [9])], null, null).anzahl, 1);
});

test("stundenplanAusLektionen: nur Stunde, Fach, Raum, Status — keine Lehrkraft, keine IDs, kein Kommentar", () => {
  const p = stundenplanAusLektionen(lektionen(), FENSTER, ABGERUFEN);
  for (const liste of Object.values(p.tage)) {
    for (const s of liste) assert.deepEqual(Object.keys(s).sort(), ["fach", "raum", "status", "stunde"]);
  }
  const text = JSON.stringify(p);
  for (const verboten of ["Lehrkraft", "LK1", "Vorname", "teachers", "Examen", "ML2_13", "Q2", "lessonId", "courseId"]) {
    assert.ok(!text.includes(verboten), `${verboten} darf nicht im Cache landen`);
  }
});

test("stundenplanAusLektionen: Vertretung, Entfall per Flag, Stundennummer als Zahl, Fenster aus den Daten", () => {
  const l = (date, number, extra) => ({ date, classHour: { id: 1, number }, ...extra });
  const eingabe = [
    l("2026-09-16", "3", { type: "changedLesson", isSubstitution: true, actualLesson: { subject: { name: "Physik" }, room: { name: "R12" } } }),
    l("2026-09-15", "x", { type: "regularLesson", actualLesson: { subject: { name: "Deutsch" }, room: null } }),
    l("2026-09-15", "1", { isCancelled: true, originalLessons: [{ subject: { name: "Kunst" }, room: { name: "R08" } }] }),
    l("2026-09-15", "2", { type: "regularLesson", actualLesson: { subject: {}, subjectLabel: "" } }), // kein Fach -> weg
    { date: "15.09.2026", classHour: { number: "1" }, actualLesson: { subject: { name: "Sport" } } },   // kein ISO-Datum -> weg
    null, "text",
  ];
  const p = stundenplanAusLektionen(eingabe, null, null);
  assert.deepEqual({ von: p.von, bis: p.bis, abgerufenAm: p.abgerufenAm, anzahl: p.anzahl }, { von: "2026-09-15", bis: "2026-09-16", abgerufenAm: null, anzahl: 3 });
  assert.deepEqual(p.tage["2026-09-15"], [
    { stunde: 0, fach: "Deutsch", raum: "", status: "normal" },
    { stunde: 1, fach: "Kunst", raum: "R08", status: "entfall" },
  ]);
  assert.deepEqual(p.tage["2026-09-16"], [{ stunde: 3, fach: "Physik", raum: "R12", status: "vertretung" }]);
  // Fenster mit bis vor von: bis kommt aus den Daten
  assert.deepEqual([stundenplanAusLektionen(eingabe, { von: "2026-09-14", bis: "2026-09-01" }).von, stundenplanAusLektionen(eingabe, { von: "2026-09-14", bis: "2026-09-01" }).bis], ["2026-09-14", "2026-09-16"]);
});

test("stundenplanAusLektionen: leere oder unbrauchbare Antwort -> null, damit der Cache nicht leer gefegt wird", () => {
  assert.equal(stundenplanAusLektionen([], FENSTER, ABGERUFEN), null);
  assert.equal(stundenplanAusLektionen(null, FENSTER, ABGERUFEN), null);
  assert.equal(stundenplanAusLektionen([{ foo: 1 }], FENSTER, ABGERUFEN), null);
});

test("Lieferung passt in stundenplanUebernehmen und übersteht pruefeBestand unverändert", () => {
  const p = stundenplanAusLektionen(lektionen(), FENSTER, ABGERUFEN);
  const cache = stundenplanUebernehmen(leererStundenplan(), p);
  assert.deepEqual(cache.fenster, FENSTER);
  const b = pruefeBestand({ ...leererBestand(), stundenplan: cache });
  assert.deepEqual(b.stundenplan, cache);
  assert.equal(Object.keys(b.stundenplan.tage).length, 5);
});
