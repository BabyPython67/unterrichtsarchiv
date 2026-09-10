import { test } from "node:test";
import assert from "node:assert/strict";
import { mappingBauen } from "../kern/erkennen.js";
import { textSaeubern, normalisieren, zusammenfuehren, eintragId } from "../kern/normalisieren.js";
import { inhalte, hausaufgaben } from "./hilfen.js";

const M = { kurs: "subject", datum: "date", thema: "topic", hausaufgabe: "homework" };

test("textSaeubern: CRLF, Trim je Zeile, Leerzeilen raus, Umbrüche bleiben", () => {
  assert.equal(textSaeubern("a \r\n\r\n  b\r\nc  "), "a\nb\nc");
  assert.equal(textSaeubern("\n\n"), "");
  assert.equal(textSaeubern(null), "");
  assert.equal(textSaeubern("Describing  8 photos"), "Describing  8 photos");
});

test("normalisieren: echte Inhalte-Antwort -> 27 Zeilen, mehrzeilige Texte sauber", () => {
  const z = normalisieren(inhalte().results[0].data, mappingBauen(inhalte().results[0].data));
  assert.equal(z.length, 27);
  const eng = z.find((x) => x.kurs === "Englisch" && x.datum === "2026-09-03");
  assert.equal(eng.thema,
    "Merkblatt SoMi-Noten, Grundlagen der Leistungsbewertung, Klausurtermine\n" +
    "Thema 1. Hj.: Vision of the future\n" +
    "Intro: Describing  8 photos, PA: Your ideal world of the future (the rest is homework)");
  const kunst = z.find((x) => x.kurs === "Kunst" && x.datum === "2026-09-03");
  assert.equal(kunst.thema, "Organisatorisches\nWarm Up\nReaktivierung Ausstellung William kentridge");
  assert.equal(eng.id, "Englisch|2026-09-03|1");
  assert.equal(eng.hausaufgabe, "");
});

test("normalisieren: derselbe Kurs zweimal am selben Tag -> Position 1 und 2, andere IDs", () => {
  const z = normalisieren([
    { date: "2026-09-03", subject: "Mathematik", topic: "Erste Stunde" },
    { date: "2026-09-03", subject: "Englisch", topic: "Dazwischen" },
    { date: "2026-09-03", subject: "Mathematik", topic: "Zweite Stunde" },
  ], M);
  const mathe = z.filter((x) => x.kurs === "Mathematik");
  assert.deepEqual(mathe.map((x) => x.position), [1, 2]);
  assert.deepEqual(mathe.map((x) => x.id), ["Mathematik|2026-09-03|1", "Mathematik|2026-09-03|2"]);
  assert.equal(z.find((x) => x.kurs === "Englisch").position, 1);
});

test("normalisieren: leere Einträge zählen nicht mit, ungültiges Datum fliegt, Kurs fehlt -> Ohne Kurs", () => {
  const z = normalisieren([
    { date: "2026-09-03", subject: "Mathematik", topic: "  \n " },
    { date: "2026-09-03", subject: "Mathematik", topic: "Echt" },
    { date: "kein Datum", subject: "Mathematik", topic: "weg" },
    { date: "2026-09-04T00:00:00", subject: "", topic: "ohne Fach" },
  ], M);
  assert.equal(z.length, 2);
  assert.equal(z[0].position, 1);
  assert.equal(z[1].kurs, "Ohne Kurs");
  assert.equal(z[1].datum, "2026-09-04");
});

test("normalisieren: Fremdfelder (Lehrkraft, Noten, Namen) landen nicht in der Zeile", () => {
  const z = normalisieren([{
    date: "2026-09-03", subject: "Mathematik", topic: "x",
    teacher: { lastname: "Weber" }, students: [{ firstname: "A" }], grade: 13, absent: true,
  }], M);
  assert.deepEqual(Object.keys(z[0]).sort(), ["datum", "hausaufgabe", "id", "kurs", "position", "thema"]);
});

test("zusammenfuehren: Inhalte + Hausaufgaben -> 27 Zeilen, 4 davon mit Hausaufgabe", () => {
  const a = inhalte().results[0].data, b = hausaufgaben().results[0].data;
  const z = zusammenfuehren([normalisieren(a, mappingBauen(a)), normalisieren(b, mappingBauen(b))]);
  assert.equal(z.length, 27);
  const mitHa = z.filter((x) => x.hausaufgabe);
  assert.deepEqual(mitHa.map((x) => x.id).sort(),
    ["Englisch|2026-09-03|1", "Englisch|2026-09-04|1", "Englisch|2026-09-10|1", "PsG1|2026-09-09|1"]);
  const eng = z.find((x) => x.id === "Englisch|2026-09-03|1");
  assert.ok(eng.thema.startsWith("Merkblatt"));
  assert.equal(eng.hausaufgabe, "Ex. 2c)");
});

test("zusammenfuehren: Hausaufgabe ohne Inhalt ergibt Zeile mit leerem Thema", () => {
  const z = zusammenfuehren([
    normalisieren([{ date: "2026-09-03", subject: "Mathematik", topic: "x" }], M),
    normalisieren([{ date: "2026-09-05", subject: "Chemie", homework: "S. 10" }], M),
  ]);
  const chemie = z.find((x) => x.kurs === "Chemie");
  assert.equal(chemie.thema, "");
  assert.equal(chemie.hausaufgabe, "S. 10");
  assert.equal(chemie.id, eintragId("Chemie", "2026-09-05", 1));
});

test("zusammenfuehren: Positionen werden je Liste gezählt, Hausaufgabe hängt am ersten Eintrag", () => {
  const z = zusammenfuehren([
    normalisieren([
      { date: "2026-09-03", subject: "Mathematik", topic: "A" },
      { date: "2026-09-03", subject: "Mathematik", topic: "B" },
    ], M),
    normalisieren([{ date: "2026-09-03", subject: "Mathematik", homework: "H" }], M),
  ]);
  assert.equal(z.length, 2);
  assert.equal(z[0].thema, "A"); assert.equal(z[0].hausaufgabe, "H");
  assert.equal(z[1].thema, "B"); assert.equal(z[1].hausaufgabe, "");
});
