// Dispatch v3 §10: feste Datums-Fixtures, kein parameterloses new Date().
// Kalender 2026: 07.09. Mo · 10.09. Do · 11.09. Fr · 14.09. Mo · 15.09. Di · 16.09. Mi · 21.09. Mo

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tagesplan, ermittleWochenplan, naechsterSchultag, schultagSuchen, letzteStunde, baueDigest,
  digestKopfzeile, tagesablauf, digestText, stundenplanUebernehmen, leererStundenplan, planFunktion, kurszuordnungErgaenzen,
  istFrei, istWochenende, datumPlus, tageZwischen, wochentagKuerzel, syncStatus, syncZeile, herkunftZeile, mitStandard,
  abrufStand, stundenSeitAbruf, stundenSeitAbrufText, lueckeText, eintragDatum, kurseZumEintragen, kurseOhneHausaufgabe,
} from "../kern/logik.js";
import { leererBestand, pruefeBestand, exportText } from "../kern/speicher.js";
import { importieren } from "../kern/importieren.js";

const e = (kurs, datum, thema = "x", hausaufgabe = "", position = 1) =>
  ({ id: `${kurs}|${datum}|${position}`, kurs, datum, thema, hausaufgabe, position, ersterfasst: "2026-09-01", geaendert: null });

// Acht Montage im 56-Tage-Fenster vor Fr 11.09.2026 (Fenster beginnt 17.07.).
const MONTAGE = ["2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"];
const STICHTAG = "2026-09-11";

const zuordnung = {
  "M LK": { kurs: "Mathematik", quelle: "auto", bestaetigt: true },
  "E": { kurs: "Englisch", quelle: "auto", bestaetigt: true },
  "D": { kurs: "Deutsch", quelle: "manuell", bestaetigt: true },
};

function stundenplanFixture() {
  return {
    abgerufenAm: "2026-09-13T18:00:00.000Z",
    fenster: { von: "2026-09-14", bis: "2026-09-18" },
    tage: {
      "2026-09-14": [{ stunde: 1, fach: "M LK", status: "normal" }],
      "2026-09-15": [
        { stunde: 3, fach: "E", status: "normal" },
        { stunde: 1, fach: "M LK", status: "normal" },
        { stunde: 2, fach: "M LK", status: "normal" },
        { stunde: 5, fach: "PH", status: "normal" },
      ],
      "2026-09-16": [
        { stunde: 1, fach: "D", status: "entfall" },
        { stunde: 2, fach: "E", status: "vertretung" },
      ],
      "2026-09-17": [{ stunde: 1, fach: "D", status: "entfall" }, { stunde: 2, fach: "E", status: "entfall" }],
    },
  };
}

const wochenplanFixture = () => ({
  Mo: [{ kurs: "Mathematik", sicherheit: "sicher" }, { kurs: "Deutsch", sicherheit: "unsicher" }],
  Di: [], Mi: [], Do: [], Fr: [{ kurs: "Englisch", sicherheit: "sicher" }], Sa: [], So: [],
});

// ---------------------------------------------------------------------------
// Datumshelfer
// ---------------------------------------------------------------------------

test("Datumshelfer: Wochentag, Plus, Differenz, Wochenende, freie Tage als Datum oder Bereich", () => {
  assert.equal(wochentagKuerzel("2026-09-11"), "Fr");
  assert.equal(datumPlus("2026-09-11", 3), "2026-09-14");
  assert.equal(datumPlus("2026-09-01", -1), "2026-08-31");
  assert.equal(tageZwischen("2026-09-10", "2026-09-16"), 6);
  assert.equal(istWochenende("2026-09-12"), true);
  assert.equal(istWochenende("2026-09-14"), false);
  const frei = ["2026-10-12..2026-10-24", "2026-11-02", { von: "2026-12-23", bis: "2027-01-06" }];
  assert.equal(istFrei("2026-10-15", frei), true);
  assert.equal(istFrei("2026-10-25", frei), false);
  assert.equal(istFrei("2026-11-02", frei), true);
  assert.equal(istFrei("2026-12-31", frei), true);
});

// ---------------------------------------------------------------------------
// §10 1–5 tagesplan
// ---------------------------------------------------------------------------

test("tagesplan 1: Datum im Fenster -> gemessen, nach Stundennummer, Doppelstunde eine Karte", () => {
  const p = tagesplan("2026-09-15", stundenplanFixture(), wochenplanFixture(), {}, zuordnung);
  assert.equal(p.herkunft, "gemessen");
  assert.deepEqual(p.kurse.map((k) => k.kurs), ["Mathematik", "Englisch", null]);
  assert.deepEqual(p.kurse[0].stunden, [1, 2]);
  assert.deepEqual(p.kurse[1].stunden, [3]);
});

test("tagesplan 2: Datum außerhalb des Fensters -> abgeleitet, obwohl ein Stundenplan existiert", () => {
  const p = tagesplan("2026-09-21", stundenplanFixture(), wochenplanFixture(), {}, zuordnung);
  assert.equal(p.herkunft, "abgeleitet");
  assert.deepEqual(p.kurse.map((k) => k.kurs), ["Deutsch", "Mathematik"]);   // alphabetisch
  assert.equal(p.kurse[1].sicherheit, "sicher");
});

test("tagesplan 3: entfall nicht in kurse, aber in entfallen; Vertretung bleibt markiert", () => {
  const p = tagesplan("2026-09-16", stundenplanFixture(), wochenplanFixture(), {}, zuordnung);
  assert.deepEqual(p.kurse.map((k) => [k.kurs, k.status]), [["Englisch", "vertretung"]]);
  assert.deepEqual(p.entfallen.map((k) => k.kurs), ["Deutsch"]);
});

test("tagesplan: entfallende Doppelstunde steht nur einmal in entfallen, mit beiden Stunden", () => {
  const plan = { fenster: { von: "2026-09-14", bis: "2026-09-14" }, tage: { "2026-09-14": [
    { stunde: 5, fach: "Kunst", status: "entfall" }, { stunde: 3, fach: "M LK", status: "normal" }, { stunde: 6, fach: "Kunst", status: "entfall" },
  ] } };
  const p = tagesplan("2026-09-14", plan, wochenplanFixture(), {}, zuordnung);
  assert.deepEqual(p.entfallen.map((k) => [k.fach, k.stunden]), [["Kunst", [5, 6]]]);
  assert.deepEqual(p.kurse.map((k) => k.kurs), ["Mathematik"]);
  const d = baueDigest(new Date(2026, 8, 13, 20, 0), { eintraege: [], stundenplan: plan, kurszuordnung: zuordnung, datum: "2026-09-14" });
  assert.match(digestText(d), /^Entfällt: Kunst$/m);
  assert.equal(digestKopfzeile(d), "1 Kurs · 0 Hausaufgaben · 1 entfällt");
});

test("tagesplan 4: Override aus schlägt einen gemessenen Kurs, fix ergänzt einen", () => {
  const einst = { wochenplan: { overrides: { Di: { Mathematik: "aus", Geschichte: "fix" } } } };
  const p = tagesplan("2026-09-15", stundenplanFixture(), wochenplanFixture(), einst, zuordnung);
  assert.equal(p.herkunft, "gemessen");
  assert.equal(p.angepasst, true);
  assert.deepEqual(p.kurse.map((k) => k.kurs), ["Englisch", null, "Geschichte"]);
  assert.equal(p.kurse[2].sicherheit, "fest");
});

test("tagesplan 5: Fach ohne Kurszuordnung erscheint mit Zuordnungsflag", () => {
  const p = tagesplan("2026-09-15", stundenplanFixture(), wochenplanFixture(), {}, zuordnung);
  const ph = p.kurse.find((k) => k.fach === "PH");
  assert.deepEqual({ kurs: ph.kurs, zuordnungFehlt: ph.zuordnungFehlt }, { kurs: null, zuordnungFehlt: true });
  assert.equal(p.kurse[0].zuordnungFehlt, false);
});

test("tagesplan: Fach mit kurs null („nicht anzeigen“) fehlt in kurse und in entfallen", () => {
  const zu = { ...zuordnung, PH: { kurs: null, quelle: "manuell", bestaetigt: true }, D: { kurs: null, quelle: "manuell", bestaetigt: true } };
  const di = tagesplan("2026-09-15", stundenplanFixture(), wochenplanFixture(), {}, zu);
  assert.deepEqual(di.kurse.map((k) => k.fach), ["M LK", "E"]);
  const mi = tagesplan("2026-09-16", stundenplanFixture(), wochenplanFixture(), {}, zu);
  assert.deepEqual([mi.kurse.map((k) => k.fach), mi.entfallen], [["E"], []]);
});

test("kurszuordnungErgaenzen: gleichnamiger Archiv-Kurs wird automatisch verbunden, Vorhandenes bleibt, Eingabe unverändert", () => {
  const eintraege = [e("Mathematik", "2026-09-01"), e("englisch", "2026-09-01"), e("Physik", "2026-09-01")];
  const vorher = { "M LK": { kurs: "Mathematik", quelle: "manuell", bestaetigt: true }, E: { kurs: null, quelle: "manuell", bestaetigt: true } };
  const plan = { tage: { "2026-09-14": [{ stunde: 1, fach: "Mathematik" }, { stunde: 2, fach: "ENGLISCH" }, { stunde: 3, fach: "PH" }, { stunde: 4, fach: "E" }], "2026-09-15": [{ stunde: 1, fach: "Mathematik" }] } };
  const z = kurszuordnungErgaenzen(vorher, plan, eintraege);
  assert.deepEqual(z, {
    "M LK": vorher["M LK"], E: vorher.E,                                            // nie überschreiben, auch „nicht anzeigen“ nicht
    Mathematik: { kurs: "Mathematik", quelle: "auto", bestaetigt: false },
    ENGLISCH: { kurs: "englisch", quelle: "auto", bestaetigt: false },              // Groß/Klein egal, Original-Kursname bleibt
  });
  assert.deepEqual(Object.keys(vorher), ["M LK", "E"]);
  assert.deepEqual(kurszuordnungErgaenzen(undefined, null, []), {});
  assert.deepEqual(kurszuordnungErgaenzen({}, leererStundenplan(), eintraege), {});
});

test("baueDigest: gemessener Tag behält die Reihenfolge des Stundenplans, auch wenn nur ein späterer Kurs Hausaufgabe hat", () => {
  const b = leererBestand();
  b.eintraege = [e("Mathematik", "2026-09-08", "Ableitung"), e("Englisch", "2026-09-08", "Text", "Vokabeln lernen")];
  b.stundenplan = stundenplanFixture();
  b.kurszuordnung = zuordnung;
  const d = baueDigest(new Date(2026, 8, 14, 20, 0), b);
  assert.deepEqual([d.datum, d.herkunft], ["2026-09-15", "gemessen"]);
  assert.deepEqual(d.kurse.map((k) => k.name), ["Mathematik", "Englisch", "PH"]);
  assert.equal(d.anzahlHA, 1);
  assert.equal(digestText(d).split("\n")[1], "Englisch: Vokabeln lernen");
});

test("tagesplan: Tag im Fenster ohne Stunden ist gemessen und leer (Ferien), nicht abgeleitet", () => {
  const p = tagesplan("2026-09-18", stundenplanFixture(), wochenplanFixture(), {}, zuordnung);
  assert.equal(p.herkunft, "gemessen");
  assert.deepEqual(p.kurse, []);
});

test("tagesplan: abgeleiteter Tag ohne Muster, nur Override -> herkunft manuell", () => {
  const einst = { wochenplan: { overrides: { Mi: { Kunst: "fix" } } } };
  const p = tagesplan("2026-09-23", leererStundenplan(), wochenplanFixture(), einst, {});
  assert.equal(p.herkunft, "manuell");
  assert.deepEqual(p.kurse.map((k) => k.kurs), ["Kunst"]);
});

// ---------------------------------------------------------------------------
// §10 6–8 ermittleWochenplan
// ---------------------------------------------------------------------------

test("ermittleWochenplan 6: 7/8 sicher, 1/8 raus, 3/8 unsicher, 4/8 sicher", () => {
  const eintraege = [];
  MONTAGE.slice(0, 7).forEach((d) => eintraege.push(e("A", d)));
  eintraege.push(e("B", MONTAGE[0]));
  MONTAGE.slice(5, 8).forEach((d) => eintraege.push(e("C", d)));
  MONTAGE.slice(0, 4).forEach((d) => eintraege.push(e("D", d)));
  const plan = ermittleWochenplan(eintraege, STICHTAG, {});
  assert.deepEqual(plan.Mo, [
    { kurs: "A", sicherheit: "sicher" },
    { kurs: "C", sicherheit: "unsicher" },
    { kurs: "D", sicherheit: "sicher" },
  ]);
  assert.deepEqual(plan.Di, []);
  assert.deepEqual(Object.keys(plan), ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]);
});

test("ermittleWochenplan 7: zwei Ferienwochen im Fenster senken die Quote nicht", () => {
  const schule = MONTAGE.filter((_, i) => i !== 2 && i !== 3);   // 6 Montage mit Unterricht
  const eintraege = schule.map((d) => e("A", d));
  schule.slice(0, 3).forEach((d) => eintraege.push(e("E", d)));   // 3 von 6, nicht 3 von 8
  const plan = ermittleWochenplan(eintraege, STICHTAG, {});
  assert.deepEqual(plan.Mo, [{ kurs: "A", sicherheit: "sicher" }, { kurs: "E", sicherheit: "sicher" }]);
});

test("ermittleWochenplan 8: fix nimmt einen Kurs ohne Treffer auf, aus entfernt einen sicheren", () => {
  const eintraege = MONTAGE.map((d) => e("A", d));
  const einst = { wochenplan: { overrides: { Mo: { A: "aus", Sport: "fix" } } } };
  const plan = ermittleWochenplan(eintraege, STICHTAG, einst);
  assert.deepEqual(plan.Mo, [{ kurs: "Sport", sicherheit: "fest", status: "normal" }]);
});

test("ermittleWochenplan: Einträge außerhalb des Fensters und nach dem Stichtag zählen nicht; kleine Basis -> unsicher", () => {
  const eintraege = [e("A", "2026-07-13"), e("A", "2026-09-14"), e("B", "2026-09-07"), e("B", "2026-08-31")];
  const plan = ermittleWochenplan(eintraege, STICHTAG, {});
  assert.deepEqual(plan.Mo, [{ kurs: "B", sicherheit: "sicher" }]);
  const wenig = ermittleWochenplan([e("K", "2026-09-08")], STICHTAG, {});
  assert.deepEqual(wenig.Di, [{ kurs: "K", sicherheit: "unsicher" }]);
});

// ---------------------------------------------------------------------------
// §10 9–10 naechsterSchultag
// ---------------------------------------------------------------------------

const werktagsPlan = (d) => ({ kurse: istWochenende(d) ? [] : [{ kurs: "A" }] });

test("naechsterSchultag 9: Do 21:00 -> Fr; Fr 21:00 -> Mo; Mo 06:30 -> heute; Mo 09:00 -> Di", () => {
  assert.equal(naechsterSchultag(new Date(2026, 8, 10, 21, 0), werktagsPlan, [], "08:00"), "2026-09-11");
  assert.equal(naechsterSchultag(new Date(2026, 8, 11, 21, 0), werktagsPlan, [], "08:00"), "2026-09-14");
  assert.equal(naechsterSchultag(new Date(2026, 8, 14, 6, 30), werktagsPlan, [], "08:00"), "2026-09-14");
  assert.equal(naechsterSchultag(new Date(2026, 8, 14, 9, 0), werktagsPlan, [], "08:00"), "2026-09-15");
});

test("naechsterSchultag 10: freie Tage übersprungen, Voll-Entfall zählt als Schultag, leerer Plan -> null", () => {
  assert.equal(naechsterSchultag(new Date(2026, 8, 14, 9, 0), werktagsPlan, ["2026-09-15"], "08:00"), "2026-09-16");
  assert.equal(naechsterSchultag(new Date(2026, 8, 14, 9, 0), werktagsPlan, ["2026-09-15..2026-09-25"], "08:00"), "2026-09-28");
  const gemessen = (d) => tagesplan(d, stundenplanFixture(), wochenplanFixture(), {}, zuordnung);
  assert.equal(naechsterSchultag(new Date(2026, 8, 16, 20, 0), gemessen, [], "08:00"), "2026-09-17");   // 17.09. voller Entfall: wird gezeigt
  assert.equal(naechsterSchultag(new Date(2026, 8, 17, 20, 0), gemessen, [], "08:00"), "2026-09-21");   // 18.09. leer, Wochenende
  assert.equal(naechsterSchultag(new Date(2026, 8, 14, 9, 0), () => ({ kurse: [] }), [], "08:00"), null);
  assert.equal(naechsterSchultag(new Date(2026, 8, 14, 9, 0), werktagsPlan, ["2026-09-01..2026-12-31"], "08:00"), null);
});

test("schultagSuchen rückwärts für die Pfeilnavigation", () => {
  assert.equal(schultagSuchen("2026-09-13", -1, werktagsPlan, []), "2026-09-11");
  assert.equal(schultagSuchen("2026-09-11", -1, werktagsPlan, ["2026-09-11"]), "2026-09-10");
});

// ---------------------------------------------------------------------------
// §10 11 letzteStunde
// ---------------------------------------------------------------------------

test("letzteStunde 11: Tag selbst ignoriert, Doppelstunde aufsteigend, ohne Eintrag null, unsortiert egal", () => {
  const eintraege = [
    e("Mathematik", "2026-09-15", "heute"),
    e("Mathematik", "2026-09-10", "zwei", "", 2),
    e("Mathematik", "2026-09-08", "alt"),
    e("Mathematik", "2026-09-10", "eins", "S. 12", 1),
    e("Englisch", "2026-09-14", "text"),
  ];
  const r = letzteStunde(eintraege, "Mathematik", "2026-09-15");
  assert.equal(r.datum, "2026-09-10");
  assert.deepEqual(r.eintraege.map((x) => x.thema), ["eins", "zwei"]);
  assert.equal(letzteStunde(eintraege, "Physik", "2026-09-15"), null);
  assert.equal(letzteStunde(eintraege, "Englisch", "2026-09-14"), null);
});

// ---------------------------------------------------------------------------
// §10 12–15 baueDigest
// ---------------------------------------------------------------------------

function digestDaten() {
  const b = leererBestand();
  b.eintraege = [
    e("Mathematik", "2026-09-01", "Grenzwerte"),
    e("Mathematik", "2026-09-08", "Ableitung", "S. 12 Nr. 3"),
    e("Englisch", "2026-09-01", "Vocabulary"),
    e("Englisch", "2026-09-08", "Reading"),
    e("Geschichte", "2026-08-18", "Weimar", "Quelle lesen"),
  ];
  b.kursAlias = { Mathematik: "Mathe" };
  b.einstellungen.wochenplan.overrides = { Di: { Geschichte: "fix" } };
  return b;
}

test("baueDigest 12/13: HA-Kurse zuerst, anzahlHA zählt nur Kurse mit Hausaufgabe, alt ab altSchwelleTage", () => {
  const d = baueDigest(new Date(2026, 8, 14, 20, 0), digestDaten());
  assert.equal(d.datum, "2026-09-15");
  assert.match(d.label, /^Morgen, Di 15\.09\./);
  assert.equal(d.herkunft, "abgeleitet");
  assert.deepEqual(d.kurse.map((k) => k.name), ["Geschichte", "Mathe", "Englisch"]);
  assert.equal(d.anzahlHA, 2);
  const mathe = d.kurse[1];
  assert.deepEqual({ ha: mathe.hausaufgabe, thema: mathe.thema, datum: mathe.letztesDatum, vor: mathe.vorTagen, alt: mathe.alt },
    { ha: "S. 12 Nr. 3", thema: "Ableitung", datum: "2026-09-08", vor: 6, alt: false });
  assert.equal(d.kurse[0].alt, true);   // Geschichte zuletzt am 18.08., 27 Tage
  assert.equal(d.kurse[2].letztesDatum, "2026-09-08");
  assert.equal(digestKopfzeile(d), "3 Kurse · 2 Hausaufgaben");
});

test("baueDigest 14: kein Schultag -> leere Kursliste, kein Absturz", () => {
  const d = baueDigest(new Date(2026, 8, 14, 20, 0), leererBestand());
  assert.deepEqual({ datum: d.datum, kurse: d.kurse, anzahlHA: d.anzahlHA }, { datum: null, kurse: [], anzahlHA: 0 });
  assert.match(d.label, /Kein Schultag/);
  assert.equal(digestKopfzeile(d), "");
  assert.equal(digestText(d), d.label);
});

test("baueDigest 15: Kopfzeile im Viewer und Text der Mitteilung kommen aus demselben Digest", () => {
  const daten = digestDaten();
  const jetzt = new Date(2026, 8, 14, 20, 0);
  const a = baueDigest(jetzt, daten);
  const b = baueDigest(jetzt, daten);
  assert.deepEqual(a, b);
  const text = digestText(a);
  assert.equal(text.split("\n")[0], `${a.label} · ${digestKopfzeile(a)}`);
  assert.match(text, /Mathe: S\. 12 Nr\. 3/);
  assert.match(text, /Ohne Hausaufgabe: Englisch/);
});

test("baueDigest: heute vor Schulbeginn, festes Datum per Pfeilnavigation, Entfall im Text", () => {
  const daten = digestDaten();
  daten.stundenplan = stundenplanFixture();
  daten.kurszuordnung = zuordnung;
  const heute = baueDigest(new Date(2026, 8, 15, 6, 30), daten);
  assert.match(heute.label, /^Heute, Di 15\.09\./);
  assert.equal(heute.herkunft, "gemessen");
  const fest = baueDigest(new Date(2026, 8, 14, 20, 0), { ...daten, datum: "2026-09-16" });
  assert.equal(fest.datum, "2026-09-16");
  assert.deepEqual(fest.entfallen.map((k) => k.name), ["Deutsch"]);
  assert.match(digestText(fest), /Entfällt: Deutsch/);
  assert.equal(fest.kurse[0].status, "vertretung");
  assert.equal(fest.kurse[0].thema, "Reading");
});

test("tagesablauf: Entfall steht an der Stelle seiner ersten Stunde, fest gesetzte Kurse ohne Stunde am Ende", () => {
  const plan = { abgerufenAm: "2026-09-13T18:00:00.000Z", fenster: { von: "2026-09-14", bis: "2026-09-14" }, tage: { "2026-09-14": [
    { stunde: 1, fach: "D", status: "entfall" },
    { stunde: 2, fach: "M LK", status: "normal" },
    { stunde: 3, fach: "M LK", status: "normal" },
    { stunde: 4, fach: "E", status: "entfall" },
    { stunde: 5, fach: "PH", status: "normal" },
  ] } };
  const einstellungen = { wochenplan: { overrides: { Mo: { Geschichte: "fix" } } } };
  const d = baueDigest(new Date(2026, 8, 13, 20, 0),
    { eintraege: [], stundenplan: plan, kurszuordnung: zuordnung, einstellungen, datum: "2026-09-14" });
  assert.deepEqual(tagesablauf(d).map((x) => [x.art, x.kurs.name]), [
    ["entfall", "Deutsch"], ["kurs", "Mathematik"], ["entfall", "Englisch"], ["kurs", "PH"], ["kurs", "Geschichte"],
  ]);
  assert.equal(digestKopfzeile(d), "3 Kurse · 0 Hausaufgaben · 2 entfallen");
  // Ohne Entfall bleibt die Reihenfolge der Kurse unverändert.
  const ohne = baueDigest(new Date(2026, 8, 14, 20, 0), digestDaten());
  assert.deepEqual(tagesablauf(ohne).map((x) => x.kurs.name), ohne.kurse.map((k) => k.name));
});

test("baueDigest: Tag, an dem alles entfällt, erscheint in der Vorschau; Kopfzeile sagt es", () => {
  const d = baueDigest(new Date(2026, 8, 16, 20, 0),
    { eintraege: [], stundenplan: stundenplanFixture(), kurszuordnung: zuordnung, einstellungen: {} });
  assert.equal(d.datum, "2026-09-17");
  assert.deepEqual(d.kurse, []);
  assert.deepEqual(tagesablauf(d).map((x) => [x.art, x.kurs.name]), [["entfall", "Deutsch"], ["entfall", "Englisch"]]);
  assert.equal(digestKopfzeile(d), "2 Kurse entfallen");
  assert.equal(digestKopfzeile({ ...d, entfallen: d.entfallen.slice(0, 1) }), "1 Kurs entfällt");
});

// ---------------------------------------------------------------------------
// Statuszeilen
// ---------------------------------------------------------------------------

// Lücken. Abruf Mo 14.09. 18:00 (nach Schulbeginn), Stundenplan Mo–Mi. Archiv: Mathe vom 14.09.,
// Englisch nur vom 10.09., Deutsch vom 11.09. Sport ist auf „Nicht anzeigen“ gestellt.
function lueckeDaten(abgerufen = new Date(2026, 8, 14, 18, 0).toISOString()) {
  const b = leererBestand();
  b.kurszuordnung = { ...zuordnung, SP: { kurs: null, quelle: "manuell", bestaetigt: true } };
  b.stundenplan = {
    abgerufenAm: abgerufen,
    fenster: { von: "2026-09-14", bis: "2026-09-20" },
    tage: {
      "2026-09-14": [{ stunde: 1, fach: "M LK", status: "normal" }, { stunde: 2, fach: "E", status: "normal" }],
      "2026-09-15": [{ stunde: 1, fach: "E", status: "normal" }, { stunde: 3, fach: "D", status: "entfall" }, { stunde: 4, fach: "SP", status: "normal" }],
      "2026-09-16": [
        { stunde: 1, fach: "M LK", status: "normal" }, { stunde: 2, fach: "M LK", status: "normal" },
        { stunde: 3, fach: "E", status: "normal" }, { stunde: 4, fach: "D", status: "normal" },
      ],
    },
  };
  b.letzterAbruf = abgerufen;
  b.sync.letzterErfolg = abgerufen;
  b.eintraege = [e("Mathematik", "2026-09-14", "Ableitung"), e("Englisch", "2026-09-10", "Reading"), e("Deutsch", "2026-09-11", "Faust")];
  return b;
}
const luecken = (digest) => Object.fromEntries(digest.kurse.map((k) => [k.kurs, k.luecke]));

test("abrufStand: spätester Zeitstempel in Ortszeit, vor Schulbeginn markiert; reines Datum, Müll, nichts", () => {
  const b = leererBestand();
  assert.equal(abrufStand(b), null);
  b.letzterAbruf = new Date(2026, 8, 12, 7, 30).toISOString();
  b.sync.letzterErfolg = new Date(2026, 8, 11, 19, 0).toISOString();
  b.stundenplan.abgerufenAm = "kaputt";
  assert.deepEqual(abrufStand(b), { tag: "2026-09-12", vorBeginn: true });
  assert.deepEqual(abrufStand(b, "07:00"), { tag: "2026-09-12", vorBeginn: false });
  assert.deepEqual(abrufStand({ letzterAbruf: "2026-09-13" }), { tag: "2026-09-13", vorBeginn: false });
  assert.equal(abrufStand({ letzterAbruf: new Date(2026, 8, 14, 0, 30).toISOString() }).tag, "2026-09-14", "Ortszeit, nicht UTC");
});

test("baueDigest: letzte Stunde laut Stundenplan ohne Eintrag -> luecke; lag sie nach dem Abruf -> Hinweis", () => {
  const d = baueDigest(new Date(2026, 8, 15, 18, 0), lueckeDaten());   // Di 18:00 -> Mi 16.09.
  assert.equal(d.datum, "2026-09-16");
  const l = luecken(d);
  assert.equal(l.Mathematik, null, "Stunde am 14.09. hat einen Eintrag");
  assert.deepEqual(l.Englisch, { datum: "2026-09-15", nachAbruf: true });
  assert.equal(l.Deutsch, null, "am 15.09. entfallen, davor kein Deutsch im Stundenplan");
  assert.deepEqual(d.luecke, { abrufTag: "2026-09-14" });
  assert.equal(lueckeText(d), "Seit dem letzten Abruf am Mo 14.09. war Unterricht.");
});

test("baueDigest: fehlende Stunde vor dem Abruf -> nur luecke, kein Hinweis; Abruf vor Schulbeginn zählt den Tag mit", () => {
  const spaet = baueDigest(new Date(2026, 8, 14, 20, 0), lueckeDaten());   // Mo 20:00 -> Di 15.09.
  assert.equal(spaet.datum, "2026-09-15");
  assert.deepEqual(luecken(spaet).Englisch, { datum: "2026-09-14", nachAbruf: false });
  assert.equal(spaet.luecke, null);
  assert.equal(lueckeText(spaet), null);
  const frueh = baueDigest(new Date(2026, 8, 14, 20, 0), lueckeDaten(new Date(2026, 8, 14, 7, 0).toISOString()));
  assert.deepEqual(luecken(frueh).Englisch, { datum: "2026-09-14", nachAbruf: true });
  assert.deepEqual(frueh.luecke, { abrufTag: "2026-09-14" });
});

test("baueDigest: künftige Stunden und freie Tage erzeugen keine Lücke", () => {
  // Mo 07:00, vor Schulbeginn, per Pfeil auf Mi 16.09.: Englisch am 15.09. kommt erst noch
  const vorher = baueDigest(new Date(2026, 8, 14, 7, 0), { ...lueckeDaten(), datum: "2026-09-16" });
  assert.equal(luecken(vorher).Englisch, null);
  assert.equal(vorher.luecke, null);
  const b = lueckeDaten();
  b.einstellungen.freieTage = ["2026-09-15"];
  const frei = baueDigest(new Date(2026, 8, 15, 18, 0), b);
  assert.deepEqual(luecken(frei).Englisch, { datum: "2026-09-14", nachAbruf: false });
  assert.equal(frei.luecke, null);
});

test("stundenSeitAbruf: gehaltene Schulstunden nach dem Abruf, ohne Entfall, „Nicht anzeigen“ und freie Tage", () => {
  const b = lueckeDaten();
  // Mi 20:00: Di Englisch (1), Mi Mathe-Doppelstunde (2), Englisch (1), Deutsch (1)
  assert.deepEqual(stundenSeitAbruf(new Date(2026, 8, 16, 20, 0), b), { anzahl: 5, mehr: false });
  assert.equal(stundenSeitAbrufText({ anzahl: 5, mehr: false }), "seitdem 5 Schulstunden");
  // Mi 07:00: der Mittwoch zählt noch nicht
  assert.deepEqual(stundenSeitAbruf(new Date(2026, 8, 16, 7, 0), b), { anzahl: 1, mehr: false });
  assert.equal(stundenSeitAbrufText({ anzahl: 1, mehr: false }), "seitdem 1 Schulstunde");
  // Mo 21.09.: der Stundenplan endet am 20.09., es waren wohl mehr
  const spaeter = stundenSeitAbruf(new Date(2026, 8, 21, 9, 0), b);
  assert.deepEqual(spaeter, { anzahl: 5, mehr: true });
  assert.equal(stundenSeitAbrufText(spaeter), "seitdem mehr als 5 Schulstunden");
  // Abend des Abrufs: nichts; Abruf vor Schulbeginn: der Tag zählt
  assert.equal(stundenSeitAbruf(new Date(2026, 8, 14, 20, 0), b), null);
  assert.equal(stundenSeitAbrufText(null), "");
  assert.deepEqual(stundenSeitAbruf(new Date(2026, 8, 14, 20, 0), lueckeDaten(new Date(2026, 8, 14, 7, 0).toISOString())), { anzahl: 2, mehr: false });
  b.einstellungen.freieTage = ["2026-09-15"];
  assert.deepEqual(stundenSeitAbruf(new Date(2026, 8, 16, 20, 0), b), { anzahl: 4, mehr: false });
  assert.equal(stundenSeitAbruf(new Date(2026, 8, 16, 20, 0), leererBestand()), null);
});

test("herkunftZeile und syncStatus liefern Klartext mit Alter", () => {
  const jetzt = new Date(2026, 8, 15, 20, 0);
  const daten = digestDaten();
  daten.stundenplan = stundenplanFixture();
  daten.kurszuordnung = zuordnung;
  const d = baueDigest(jetzt, daten);
  assert.equal(herkunftZeile(d, daten.stundenplan, jetzt, {}), "Stundenplan vom 13.09., abgerufen vor 2 Tagen");
  assert.match(herkunftZeile(d, daten.stundenplan, new Date(2026, 8, 25, 8, 0), {}), /evtl\. veraltet$/);
  assert.equal(herkunftZeile(baueDigest(jetzt, digestDaten()), leererStundenplan(), jetzt, {}), "Aus dem Archiv abgeleitet, Stundenplan nicht abgerufen");
  assert.equal(herkunftZeile(baueDigest(jetzt, { ...daten, datum: "2026-09-21" }), daten.stundenplan, jetzt, {}), "Aus dem Archiv abgeleitet, Stundenplan reicht nur bis 18.09.");
  assert.equal(herkunftZeile(baueDigest(jetzt, { ...daten, datum: "2026-09-11" }), daten.stundenplan, jetzt, {}), "Aus dem Archiv abgeleitet, Stundenplan beginnt erst 14.09.");

  assert.deepEqual(syncStatus(null, jetzt, {}), { art: "nie", text: "Noch kein Abruf" });
  assert.deepEqual(syncStatus({ letzterErfolg: "2026-09-15T06:00:00.000Z" }, jetzt, {}), { art: "ok", text: "Letzter Abruf heute" });
  assert.deepEqual(syncStatus({ letzterErfolg: "2026-09-10T06:00:00.000Z" }, jetzt, {}), { art: "warn", text: "Letzter Abruf vor 5 Tagen, evtl. veraltet" });
  const f = syncStatus({ letzterErfolg: "2026-09-14T06:00:00.000Z", letzterFehler: { zeit: "2026-09-15T06:00:00.000Z", art: "auth", text: "Anmeldung abgelaufen" } }, jetzt, {});
  assert.deepEqual(f, { art: "fehler", text: "Letzter Abruf fehlgeschlagen: Anmeldung abgelaufen" });
  assert.equal(mitStandard(undefined).schulbeginn, "08:00");
});

test("syncZeile: keine zweite Zeile, wenn die Herkunft denselben Abruf nennt; Fehler immer", () => {
  const jetzt = new Date(2026, 8, 15, 20, 0);
  const daten = digestDaten();
  daten.stundenplan = stundenplanFixture();
  daten.kurszuordnung = zuordnung;
  const gemessen = baueDigest(jetzt, daten);
  const abgeleitet = baueDigest(jetzt, digestDaten());
  const am = daten.stundenplan.abgerufenAm;

  assert.equal(syncZeile(gemessen, daten.stundenplan, { letzterErfolg: am }, jetzt, {}), null);
  assert.deepEqual(syncZeile(abgeleitet, leererStundenplan(), { letzterErfolg: am }, jetzt, {}), { art: "ok", text: "Letzter Abruf vor 2 Tagen" });
  // Später erfolgreich abgerufen, aber der Stundenplan-Teil kam nicht mit: beide Zeilen haben eigene Aussagen.
  assert.deepEqual(syncZeile(gemessen, daten.stundenplan, { letzterErfolg: "2026-09-15T06:00:00.000Z" }, jetzt, {}), { art: "ok", text: "Letzter Abruf heute" });
  const fehler = { letzterErfolg: am, letzterFehler: { zeit: "2026-09-15T06:00:00.000Z", text: "Anmeldung abgelaufen" } };
  assert.equal(syncZeile(gemessen, daten.stundenplan, fehler, jetzt, {}).art, "fehler");
  assert.deepEqual(syncZeile(abgeleitet, leererStundenplan(), null, jetzt, {}), { art: "nie", text: "Noch kein Abruf" });
});

// ---------------------------------------------------------------------------
// §10 21–23 Speicher und Migration
// ---------------------------------------------------------------------------

test("stundenplanUebernehmen 21: neues Fenster ersetzt inklusive Löschung, Tage außerhalb bleiben", () => {
  const alt = stundenplanFixture();
  const neu = stundenplanUebernehmen(alt, {
    von: "2026-09-15", bis: "2026-09-19", abgerufenAm: "2026-09-15T05:00:00.000Z",
    tage: { "2026-09-15": [{ stunde: 3, fach: "E", status: "normal" }], "2026-09-16": [{ stunde: 2, fach: "E", status: "normal" }] },
  });
  assert.deepEqual(Object.keys(neu.tage).sort(), ["2026-09-14", "2026-09-15", "2026-09-16"]);
  assert.deepEqual(neu.tage["2026-09-14"], alt.tage["2026-09-14"]);           // außerhalb: unverändert
  assert.deepEqual(neu.tage["2026-09-15"].map((s) => s.fach), ["E"]);           // M LK und PH weg
  assert.equal(neu.tage["2026-09-17"], undefined);                              // Entfall-Tag gelöscht
  assert.deepEqual(neu.fenster, { von: "2026-09-14", bis: "2026-09-19" });
  assert.equal(neu.abgerufenAm, "2026-09-15T05:00:00.000Z");
  const getrennt = stundenplanUebernehmen(alt, { von: "2026-10-05", bis: "2026-10-09", tage: {}, abgerufenAm: "x" });
  assert.deepEqual(getrennt.fenster, { von: "2026-10-05", bis: "2026-10-09" });
  assert.equal(Object.keys(getrennt.tage).length, 4);
});

test("22: Stundenplanabruf ändert die Eintragszahl des Archivs nicht", () => {
  const b = digestDaten();
  const vorher = b.eintraege.length;
  const nachher = { ...b, stundenplan: stundenplanUebernehmen(b.stundenplan, { von: "2026-09-14", bis: "2026-09-18", tage: {}, abgerufenAm: "x" }) };
  assert.equal(pruefeBestand(nachher).eintraege.length, vorher);
  assert.deepEqual(pruefeBestand(nachher).eintraege, b.eintraege);
});

test("23: Migration von Schema 1 legt Defaults an, Einträge unverändert, Export bleibt importierbar", () => {
  const v1 = { schemaVersion: 1, letzterAbruf: "2026-09-10T18:04:00.000Z", kursAlias: { PsG1: "Psychologie" }, klausurschnitt: { Mathematik: "2026-09-07" },
    eintraege: [e("Mathematik", "2026-09-03"), e("PsG1", "2026-09-09", "Freud", "Text lesen")] };
  const b = pruefeBestand(JSON.parse(JSON.stringify(v1)));
  assert.equal(b.schemaVersion, 2);
  assert.equal(b.eintraege.length, 2);
  assert.deepEqual(b.kursAlias, v1.kursAlias);
  assert.deepEqual(b.stundenplan, leererStundenplan());
  assert.deepEqual(b.kurszuordnung, {});
  assert.deepEqual(b.sync, { letzterLauf: null, letzterErfolg: "2026-09-10T18:04:00.000Z", letzterFehler: null, quelle: null });   // letzterAbruf aus v1 wird zum Sync-Erfolg
  assert.deepEqual(b.einstellungen, leererBestand().einstellungen);
  const exportiert = JSON.parse(exportText(b));
  assert.equal("stundenplan" in exportiert, false);
  assert.equal("sync" in exportiert, false);
  assert.deepEqual(exportiert.kurszuordnung, {});
  const r = importieren(leererBestand(), exportiert, "2026-09-11", "x");
  assert.equal(r.art, "export");
  assert.equal(r.bestand.eintraege.length, 2);
});

test("importieren: Export-Datei ergänzt Kurszuordnung und Einstellungen, Lokales gewinnt; Rohdaten setzen sync", () => {
  const lokal = leererBestand();
  lokal.kurszuordnung = { "M LK": { kurs: "Mathematik", quelle: "manuell", bestaetigt: true } };
  lokal.einstellungen.wochenplan.overrides = { Mo: { Sport: "fix" } };
  lokal.einstellungen.freieTage = ["2026-10-12..2026-10-24"];
  lokal.einstellungen.startReiter = "vorschau";
  const fremd = leererBestand();
  fremd.kurszuordnung = { "M LK": { kurs: "Mathe LK", quelle: "auto", bestaetigt: false }, "E": { kurs: "Englisch", quelle: "auto", bestaetigt: true } };
  fremd.einstellungen.wochenplan.overrides = { Mo: { Sport: "aus", Kunst: "fix" }, Di: { Musik: "aus" } };
  fremd.einstellungen.freieTage = ["2026-11-02"];
  fremd.einstellungen.schulbeginn = "07:45";
  const r = importieren(lokal, JSON.parse(exportText(fremd)), "2026-09-11", "x").bestand;
  assert.deepEqual(r.kurszuordnung, { "M LK": lokal.kurszuordnung["M LK"], "E": fremd.kurszuordnung["E"] });
  assert.deepEqual(r.einstellungen.wochenplan.overrides, { Mo: { Sport: "fix", Kunst: "fix" }, Di: { Musik: "aus" } });
  assert.deepEqual(r.einstellungen.freieTage, ["2026-10-12..2026-10-24", "2026-11-02"]);
  assert.equal(r.einstellungen.startReiter, "vorschau");
  assert.equal(r.einstellungen.schulbeginn, "08:00");
});

test("planFunktion bündelt Wochenplan und Stundenplan für die Pfeilnavigation", () => {
  const daten = digestDaten();
  const plan = planFunktion(daten, "2026-09-14");
  assert.deepEqual(plan("2026-09-15").kurse.map((k) => k.kurs), ["Englisch", "Geschichte", "Mathematik"]);
  assert.equal(schultagSuchen("2026-09-16", 1, plan, daten.einstellungen.freieTage), "2026-09-22");
});

// ---------------------------------------------------------------------------
// Selbst eingetragene Hausaufgaben (position ab 1001)
// ---------------------------------------------------------------------------

test("baueDigest: eigener Eintrag zählt als Eintrag und schließt die Lücke; selbst alle, teils, null", () => {
  const b = lueckeDaten();
  b.eintraege.push(e("Englisch", "2026-09-15", "", "Vokabeln Unit 4", 1001), e("Mathematik", "2026-09-14", "", "S. 45 Nr. 3", 1001));
  const d = baueDigest(new Date(2026, 8, 15, 18, 0), b);   // Di 18:00 -> Mi 16.09.
  const k = Object.fromEntries(d.kurse.map((x) => [x.kurs, x]));
  assert.equal(k.Englisch.luecke, null);
  assert.equal(d.luecke, null);
  assert.deepEqual([k.Englisch.selbst, k.Englisch.hausaufgabe, k.Englisch.thema], ["alle", "Vokabeln Unit 4", ""]);
  assert.deepEqual([k.Mathematik.selbst, k.Mathematik.thema, k.Mathematik.hausaufgabe], ["teils", "Ableitung", "S. 45 Nr. 3"]);
  assert.equal(k.Deutsch.selbst, null);
});

test("eintragDatum: letzter Tag mit begonnenem Unterricht, Wochenende und freie Tage übersprungen", () => {
  assert.equal(eintragDatum(new Date(2026, 8, 15, 10, 0), {}), "2026-09-15");
  assert.equal(eintragDatum(new Date(2026, 8, 15, 7, 0), {}), "2026-09-14", "vor Schulbeginn -> Vortag");
  assert.equal(eintragDatum(new Date(2026, 8, 14, 7, 0), {}), "2026-09-11", "Mo früh -> Fr");
  assert.equal(eintragDatum(new Date(2026, 8, 12, 12, 0), {}), "2026-09-11", "Sa -> Fr");
  assert.equal(eintragDatum(new Date(2026, 8, 15, 10, 0), { freieTage: ["2026-09-14..2026-09-15"] }), "2026-09-11");
});

test("kurseZumEintragen: Kurse des Tages in Tagesreihenfolge, dann alle weiteren; Fach ohne Zuordnung wählbar", () => {
  const b = lueckeDaten();
  b.stundenplan.tage["2026-09-16"].push({ stunde: 5, fach: "KU", status: "normal" });
  b.kurszuordnung.PH = { kurs: "Physik", quelle: "manuell", bestaetigt: true };
  b.eintraege.push(e("Chemie", "2026-09-10"));
  b.kursAlias = { Englisch: "Anglistik" };
  const mi = kurseZumEintragen(b, "2026-09-16", "2026-09-15");
  assert.deepEqual(mi.amTag, [
    { kurs: "Mathematik", name: "Mathematik", fach: null },
    { kurs: "Englisch", name: "Anglistik", fach: null },
    { kurs: "Deutsch", name: "Deutsch", fach: null },
    { kurs: "KU", name: "KU", fach: "KU" },
  ]);
  assert.deepEqual(mi.weitere.map((k) => k.kurs), ["Chemie", "Physik"]);
  const di = kurseZumEintragen(b, "2026-09-15", "2026-09-15");
  assert.deepEqual(di.amTag.map((k) => k.kurs), ["Englisch"], "Entfall und „Nicht anzeigen“ fehlen");
  assert.deepEqual(di.weitere.map((k) => [k.kurs, k.fach]), [["Chemie", null], ["Deutsch", null], ["KU", "KU"], ["Mathematik", null], ["Physik", null]]);
  assert.deepEqual(kurseZumEintragen(b, "2026-09-12", "2026-09-15").amTag, [], "Samstag");
  b.einstellungen.freieTage = ["2026-09-16"];
  assert.deepEqual(kurseZumEintragen(b, "2026-09-16", "2026-09-15").amTag, [], "freier Tag");
});

test("kurseOhneHausaufgabe: gehaltene Kurse eines gemessenen Tages ohne Hausaufgabe; abgerufen, wenn der Abruf danach lag", () => {
  const b = lueckeDaten();   // Abruf Mo 14.09. 18:00
  assert.deepEqual(kurseOhneHausaufgabe(new Date(2026, 8, 14, 20, 0), b, "2026-09-14"), {
    datum: "2026-09-14", abgerufen: true,
    kurse: [{ kurs: "Mathematik", name: "Mathematik", fach: null }, { kurs: "Englisch", name: "Englisch", fach: null }],
  });
  b.eintraege.push(e("Mathematik", "2026-09-14", "Ableitung", "S. 12", 2), e("Englisch", "2026-09-14", "", "Vokabeln", 1001));
  assert.deepEqual(kurseOhneHausaufgabe(new Date(2026, 8, 14, 20, 0), b, "2026-09-14").kurse, [], "Hausaufgabe der Lehrkraft oder selbst eingetragen zählt");
  const di = kurseOhneHausaufgabe(new Date(2026, 8, 15, 10, 0), b, "2026-09-15");
  assert.deepEqual([di.abgerufen, di.kurse.map((k) => k.kurs)], [false, ["Englisch"]]);
  assert.equal(kurseOhneHausaufgabe(new Date(2026, 8, 15, 7, 0), b, "2026-09-15"), null, "vor Schulbeginn");
  assert.equal(kurseOhneHausaufgabe(new Date(2026, 8, 15, 10, 0), b, "2026-09-16"), null, "kommt erst");
  assert.equal(kurseOhneHausaufgabe(new Date(2026, 8, 15, 10, 0), b, "2026-09-11"), null, "vor dem Stundenplan-Fenster");
});
