import { test } from "node:test";
import assert from "node:assert/strict";
import { flach, listenFinden, istHuelle, alleStundenlisten, stundenlisteFinden, treffer, mappingBauen, wert } from "../kern/erkennen.js";
import { inhalte, hausaufgaben, kombiniert } from "./hilfen.js";

const verschachtelt = {
  date: "2026-09-01", classHour: { number: "3" },
  subject: { name: "Mathematik LK", abbreviation: "M" },
  teachers: [{ lastName: "Weber" }], tags: ["a", "b"], leer: [],
  subjectContent: "Kettenregel", homework: "S. 42 Nr. 3-7",
};

test("flach: verschachtelt, Listen von Strings, erstes Objekt einer Liste, leere Listen weg", () => {
  const f = flach(verschachtelt);
  assert.equal(f["subject.name"], "Mathematik LK");
  assert.equal(f["classHour.number"], "3");
  assert.equal(f["teachers.lastName"], "Weber");
  assert.equal(f.tags, "a, b");
  assert.equal("leer" in f, false);
  assert.equal(f.subjectContent, "Kettenregel");
});

test("listenFinden: Hülle results und Datenliste werden beide gefunden", () => {
  const pfade = [...listenFinden(inhalte())].map((x) => x.pfad);
  assert.ok(pfade.includes("$.results"));
  assert.ok(pfade.includes("$.results[0].data"));
  assert.ok(pfade.includes("$.systemStatusMessages"));
});

test("istHuelle: results ist Hülle, data nicht", () => {
  const a = inhalte();
  assert.equal(istHuelle(a.results), true);
  assert.equal(istHuelle(a.results[0].data), false);
});

test("alleStundenlisten: nur die Datenliste, nicht results und nicht systemStatusMessages", () => {
  const alle = alleStundenlisten(inhalte());
  assert.equal(alle.length, 1);
  assert.equal(alle[0].pfad, "$.results[0].data");
  assert.equal(alle[0].liste.length, 27);
  assert.equal(stundenlisteFinden(inhalte()).pfad, "$.results[0].data");
});

test("alleStundenlisten: kombinierte Antwort liefert beide Teillisten", () => {
  const alle = alleStundenlisten(kombiniert());
  assert.deepEqual(alle.map((x) => x.pfad).sort(), ["$.results[0].data", "$.results[1].data"]);
});

test("treffer: exakt vor Endung vor Teilstring, deterministisch", () => {
  const s = new Set(["subject.name", "subject", "xsubjectx"]);
  assert.equal(treffer(s, "subject"), "subject");        // exakt
  assert.equal(treffer(s, "name"), "subject.name");      // Endung
  assert.equal(treffer(s, "ubjec"), "subject");          // Teilstring, alphabetisch erster
  assert.equal(treffer(s, "xyz"), null);
  // wie im Prototyp: "endswith(muster)" ohne Punkt zählt auch -> "mysubjectname" vor "subject.name"
  assert.equal(treffer(new Set(["subject.name", "mysubjectname"]), "name"), "mysubjectname");
});

test("mappingBauen: Inhalte-Liste -> subject/date/topic, keine Hausaufgabe", () => {
  assert.deepEqual(mappingBauen(inhalte().results[0].data),
    { kurs: "subject", datum: "date", thema: "topic", hausaufgabe: null });
});

test("mappingBauen: Hausaufgaben-Liste -> subject/date/homework, kein Thema", () => {
  assert.deepEqual(mappingBauen(hausaufgaben().results[0].data),
    { kurs: "subject", datum: "date", thema: null, hausaufgabe: "homework" });
});

test("mappingBauen: verschachtelte Struktur wie im Prototyp-Selbsttest", () => {
  const m = mappingBauen([verschachtelt]);
  assert.equal(m.kurs, "subject.name");
  assert.equal(m.datum, "date");
  assert.equal(m.thema, "subjectcontent");
  assert.equal(m.hausaufgabe, "homework");
});

test("mappingBauen: Schlüssel, der nie gefüllt ist, wird nicht gewählt; override greift", () => {
  const m = mappingBauen([{ date: "2026-09-01", subject: "M", topic: "", content: "x" }]);
  assert.equal(m.thema, "content");
  assert.equal(mappingBauen([{ date: "2026-09-01", subject: "M", topic: "x" }], { thema: "egal" }).thema, "egal");
});

test("wert: Groß/Klein egal, null/false leer, getrimmt", () => {
  const f = { Subject: "  Mathe ", x: null, y: false, z: 0 };
  assert.equal(wert(f, "subject"), "Mathe");
  assert.equal(wert(f, "x"), "");
  assert.equal(wert(f, "y"), "");
  assert.equal(wert(f, "z"), "0");
  assert.equal(wert(f, null), "");
  assert.equal(wert(f, "fehlt"), "");
});
