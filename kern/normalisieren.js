// Rohdatensätze -> einheitliche Zeilen {id, kurs, datum, position, thema, hausaufgabe}.
// Übernommen aus smsync.py (text_saeubern, normalisieren, zusammenfuehren).
// Abweichung zum Prototyp: Kursalias wird hier NICHT angewandt, sondern erst beim Anzeigen,
// damit eine Umbenennung die Historie nicht zerreißt. Nur date/subject/Textfeld werden
// übernommen, alle anderen Rohfelder fallen weg.

import { DATUM_RE, flach, wert } from "./erkennen.js";

/** \r\n -> \n, Zeilen trimmen, Leerzeilen raus, Umbrüche innerhalb bleiben. */
export function textSaeubern(text) {
  const t = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return t.split("\n").map((z) => z.trim()).filter(Boolean).join("\n").trim();
}

export function eintragId(kurs, datum, position) {
  return `${kurs}|${datum}|${position}`;
}

/**
 * Rohdatensätze einer Liste in Zeilen umwandeln. Ohne Stundennummer in der Quelle bekommt
 * jeder Eintrag eine laufende Nummer je (Kurs, Datum) in Lieferreihenfolge, gezählt nur
 * über nicht-leere Einträge. Die Nummer ist interner Schlüsselteil, keine Unterrichtsstunde.
 */
export function normalisieren(records, mapping) {
  const zaehler = new Map();
  const zeilen = [];
  for (const r of records) {
    const f = flach(r);
    const datum = wert(f, mapping.datum).slice(0, 10);
    if (!DATUM_RE.test(datum)) continue;
    const thema = textSaeubern(wert(f, mapping.thema));
    const hausaufgabe = textSaeubern(wert(f, mapping.hausaufgabe));
    if (!thema && !hausaufgabe) continue; // leere Stunde, nichts eingetragen
    const kurs = wert(f, mapping.kurs) || "Ohne Kurs";
    const k = `${kurs}|${datum}`;
    const position = (zaehler.get(k) || 0) + 1;
    zaehler.set(k, position);
    zeilen.push({ id: eintragId(kurs, datum, position), kurs, datum, position, thema, hausaufgabe });
  }
  return zeilen;
}

/**
 * Führt Inhalte und Hausaufgaben desselben Kurses am selben Tag zusammen. Die Listen kommen
 * getrennt, tragen aber denselben Schlüssel (Kurs + Datum + laufende Nummer). Was
 * zusammengehört, landet in einer Zeile; erste Gruppe gewinnt, Lücken werden aufgefüllt.
 */
export function zusammenfuehren(zeilengruppen) {
  const index = new Map();
  for (const zeilen of zeilengruppen) {
    for (const z of zeilen) {
      const vorhanden = index.get(z.id);
      if (!vorhanden) { index.set(z.id, { ...z }); continue; }
      if (z.thema && !vorhanden.thema) vorhanden.thema = z.thema;
      if (z.hausaufgabe && !vorhanden.hausaufgabe) vorhanden.hausaufgabe = z.hausaufgabe;
    }
  }
  return [...index.values()].sort((a, b) =>
    (a.kurs < b.kurs ? -1 : a.kurs > b.kurs ? 1 : 0) ||
    a.datum.localeCompare(b.datum) ||
    a.position - b.position);
}
