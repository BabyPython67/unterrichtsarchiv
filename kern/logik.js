// Schultag-Vorschau (Dispatch v3 §6): reine Funktionen. Kein Date.now(), kein localStorage,
// kein DOM. Zeitpunkt und Daten werden übergeben, damit Viewer und Automatisierungsskript
// dieselbe Logik einbinden und alles mit festen Datums-Fixtures testbar bleibt.
//
// Datumsformat überall "YYYY-MM-DD" in Ortszeit. Wochentage als Kürzel "Mo" … "So".

import { WOCHENTAGE, anzeigename, kurseSortiert, wochentag as wochentagLesbar } from "./filtern.js";
import { istEigen } from "./mergen.js";

export const EINSTELLUNGEN_STANDARD = Object.freeze({
  wochenplan: { fensterTage: 56, overrides: {} },
  freieTage: [],
  schulbeginn: "08:00",
  erinnerungAb: "15:00",
  altSchwelleTage: 21,
  stundenplanStaleTage: 7,
  startReiter: "archiv",
  syncWarnungNachTagen: 3,
});

export const SCHULTAGE_VORAUS = 14;

// ---------------------------------------------------------------------------
// Datumshelfer (Ortszeit, ohne Bibliothek)
// ---------------------------------------------------------------------------

export function isoDatum(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mittag(iso) { return new Date(iso + "T12:00:00"); }

export function datumPlus(iso, tage) {
  const d = mittag(iso);
  d.setDate(d.getDate() + tage);
  return isoDatum(d);
}

/** Ganze Tage von a bis b (b − a), negativ wenn b vor a liegt. */
export function tageZwischen(a, b) {
  return Math.round((mittag(b) - mittag(a)) / 86400000);
}

export function wochentagKuerzel(iso) {
  return WOCHENTAGE[(mittag(iso).getDay() + 6) % 7];
}

export function istWochenende(iso) {
  const w = wochentagKuerzel(iso);
  return w === "Sa" || w === "So";
}

/** freieTage: "YYYY-MM-DD", "YYYY-MM-DD..YYYY-MM-DD" oder { von, bis }. */
export function istFrei(iso, freieTage = []) {
  for (const f of freieTage) {
    if (typeof f === "string") {
      const [von, bis] = f.split("..");
      if (bis ? iso >= von && iso <= bis : iso === von) return true;
    } else if (f && typeof f === "object" && f.von && f.bis) {
      if (iso >= f.von && iso <= f.bis) return true;
    }
  }
  return false;
}

export function mitStandard(einstellungen) {
  const e = einstellungen && typeof einstellungen === "object" ? einstellungen : {};
  return {
    ...EINSTELLUNGEN_STANDARD,
    ...e,
    wochenplan: { ...EINSTELLUNGEN_STANDARD.wochenplan, ...(e.wochenplan || {}) },
  };
}

// ---------------------------------------------------------------------------
// §6.2 Wochentagsmuster aus dem Archiv
// ---------------------------------------------------------------------------

/**
 * Für jeden Wochentag die Kurse, die dort regelmäßig belegt sind.
 * basis[w] = Anzahl verschiedener Daten mit irgendeinem Eintrag an diesem Wochentag im Fenster
 * (Ferienwochen senken die Quote also nicht). treffer = Daten, an denen der Kurs vorkommt.
 * treffer ≥ 2 und Quote ≥ 0.5 → "sicher"; ≥ 0.25 → "unsicher"; basis ≤ 2 und treffer ≥ 1 →
 * "unsicher"; sonst raus. Overrides ("fix" → "fest", "aus" → weg) zuletzt.
 * → { Mo: [{ kurs, sicherheit }], … So: [] }, je Tag alphabetisch nach Rohname.
 */
export function ermittleWochenplan(eintraege, stichtag, einstellungen) {
  const einst = mitStandard(einstellungen);
  const von = datumPlus(stichtag, -einst.wochenplan.fensterTage);
  const proDatum = new Map();
  for (const e of eintraege) {
    if (e.datum < von || e.datum > stichtag) continue;
    if (!proDatum.has(e.datum)) proDatum.set(e.datum, new Set());
    proDatum.get(e.datum).add(e.kurs);
  }
  const basis = {};
  const treffer = {};
  for (const [datum, kurse] of proDatum) {
    const w = wochentagKuerzel(datum);
    basis[w] = (basis[w] || 0) + 1;
    treffer[w] = treffer[w] || {};
    for (const k of kurse) treffer[w][k] = (treffer[w][k] || 0) + 1;
  }
  const plan = {};
  for (const w of WOCHENTAGE) {
    const liste = [];
    const b = basis[w] || 0;
    for (const [kurs, n] of Object.entries(treffer[w] || {})) {
      const quote = n / b;
      if (n >= 2 && quote >= 0.5) liste.push({ kurs, sicherheit: "sicher" });
      else if (n >= 2 && quote >= 0.25) liste.push({ kurs, sicherheit: "unsicher" });
      else if (b <= 2 && n >= 1) liste.push({ kurs, sicherheit: "unsicher" });
    }
    plan[w] = overridesAnwenden(liste, einst.wochenplan.overrides[w]).liste
      .sort((a, b) => a.kurs.localeCompare(b.kurs, "de"));
  }
  return plan;
}

/** "aus" entfernt, "fix" ergänzt (sicherheit "fest") bzw. stuft hoch. Liefert sortierte Liste. */
function overridesAnwenden(liste, overrides) {
  let angepasst = false;
  let ergebnis = liste.map((k) => ({ ...k }));
  for (const [kurs, art] of Object.entries(overrides || {})) {
    if (art === "aus") {
      const vorher = ergebnis.length;
      ergebnis = ergebnis.filter((k) => k.kurs !== kurs && k.fach !== kurs);
      if (ergebnis.length !== vorher) angepasst = true;
    } else if (art === "fix") {
      const da = ergebnis.find((k) => k.kurs === kurs);
      if (da) { if (da.sicherheit !== "fest") { da.sicherheit = "fest"; angepasst = true; } }
      else { ergebnis.push({ kurs, sicherheit: "fest", status: "normal" }); angepasst = true; }
    }
  }
  return { liste: ergebnis, angepasst };
}

// ---------------------------------------------------------------------------
// §6.1 Tagesplan: gemessen > abgeleitet, Overrides zuletzt
// ---------------------------------------------------------------------------

export function imFenster(stundenplan, datum) {
  const f = stundenplan && stundenplan.fenster;
  return !!(f && f.von && f.bis && datum >= f.von && datum <= f.bis);
}

/**
 * → { datum, wochentag, herkunft: "gemessen"|"abgeleitet"|"manuell", angepasst, kurse, entfallen }
 * kurse: [{ kurs, fach?, stunden?, status, sicherheit?, zuordnungFehlt? }]
 * Gemessen: sortiert nach Stundennummer, direkt aufeinanderfolgende gleiche Fächer werden zu
 * einer Karte (stunden: [n, n+1]). Abgeleitet: alphabetisch nach Rohname, weil `position` aus dem
 * Klassenbuch keine Stundennummer ist. Entfall landet nicht in kurse, sondern in entfallen.
 */
export function tagesplan(datum, stundenplan, wochenplan, einstellungen, kurszuordnung = {}) {
  const einst = mitStandard(einstellungen);
  const w = wochentagKuerzel(datum);
  let herkunft;
  let kurse = [];
  const entfallen = [];

  if (imFenster(stundenplan, datum)) {
    herkunft = "gemessen";
    const stunden = [...((stundenplan.tage && stundenplan.tage[datum]) || [])]
      .filter((s) => s && typeof s.fach === "string")
      .sort((a, b) => (a.stunde || 0) - (b.stunde || 0));
    for (const s of stunden) {
      const zu = kurszuordnung[s.fach];
      if (zu && zu.kurs === null) continue;                       // „Nicht anzeigen“, vom Nutzer gesetzt
      const kurs = zu && typeof zu.kurs === "string" && zu.kurs ? zu.kurs : null;
      const status = s.status || "normal";
      const eintrag = { kurs, fach: s.fach, stunden: [s.stunde], status, zuordnungFehlt: !kurs };
      if (status === "entfall") {
        const gleich = entfallen.find((e) => e.fach === s.fach);     // Doppelstunde nur einmal nennen
        if (gleich) gleich.stunden.push(s.stunde);
        else entfallen.push(eintrag);
        continue;
      }
      const letzte = kurse[kurse.length - 1];
      if (letzte && letzte.fach === s.fach && letzte.status === status) letzte.stunden.push(s.stunde);
      else kurse.push(eintrag);
    }
  } else {
    herkunft = "abgeleitet";
    kurse = ((wochenplan && wochenplan[w]) || []).map((k) => ({ kurs: k.kurs, sicherheit: k.sicherheit, status: "normal" }));
  }

  const leerVorher = kurse.length === 0;
  const r = overridesAnwenden(kurse, einst.wochenplan.overrides[w]);
  kurse = r.liste;
  if (herkunft === "abgeleitet") kurse.sort((a, b) => a.kurs.localeCompare(b.kurs, "de"));
  if (leerVorher && kurse.length && herkunft === "abgeleitet") herkunft = "manuell";
  return { datum, wochentag: w, herkunft, angepasst: r.angepasst, kurse, entfallen };
}

// ---------------------------------------------------------------------------
// §6.3 Nächster Schultag
// ---------------------------------------------------------------------------

/**
 * Sucht ab `start` (einschließlich) in `richtung` (+1/−1) höchstens `maxTage` Tage weit den
 * ersten Tag ohne Wochenende, nicht in freieTage, mit ≥ 1 Kurs oder Entfall. Sonst null.
 * Ein Tag, an dem alles entfällt, zählt mit: Die Vorschau zeigt ihn mit den Entfall-Karten.
 */
export function schultagSuchen(start, richtung, tagesplanFn, freieTage = [], maxTage = SCHULTAGE_VORAUS) {
  for (let i = 0; i < maxTage; i++) {
    const d = datumPlus(start, i * richtung);
    if (istWochenende(d) || istFrei(d, freieTage)) continue;
    const plan = tagesplanFn(d);
    if (plan && (plan.kurse.length || (plan.entfallen && plan.entfallen.length))) return d;
  }
  return null;
}

const uhrzeit = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Heute, wenn vor schulbeginn ("HH:MM"), sonst morgen; dann schultagSuchen vorwärts. */
export function naechsterSchultag(jetzt, tagesplanFn, freieTage = [], schulbeginn = "08:00") {
  const heute = isoDatum(jetzt);
  const start = uhrzeit(jetzt) < schulbeginn ? heute : datumPlus(heute, 1);
  return schultagSuchen(start, 1, tagesplanFn, freieTage);
}

// ---------------------------------------------------------------------------
// §6.4 Letzte Stunde eines Kurses
// ---------------------------------------------------------------------------

/** Jüngstes Datum echt vor vorDatum; alle Positionen aufsteigend. Keins → null. */
export function letzteStunde(eintraege, kurs, vorDatum) {
  let best = null;
  for (const e of eintraege) {
    if (e.kurs !== kurs || e.datum >= vorDatum) continue;
    if (!best || e.datum > best) best = e.datum;
  }
  if (!best) return null;
  const liste = eintraege.filter((e) => e.kurs === kurs && e.datum === best).sort((a, b) => a.position - b.position);
  return { datum: best, eintraege: liste };
}

/**
 * Hausaufgaben eines Kurses für den Tag `datum`. Aus der letzten Stunde alle ohne Abgabedatum und
 * die, deren Abgabe nicht vor diesem Tag liegt. Dazu selbst eingetragene mit Abgabedatum aus
 * früheren Stunden, solange die Abgabe noch kommt (Aufgabetag < datum ≤ bis).
 * → [{ text, bis }]: zuerst die ohne Abgabedatum in Positionsreihenfolge, dann nach Abgabe.
 */
export function hausaufgabenAmTag(eintraege, kurs, datum, letzte = letzteStunde(eintraege, kurs, datum)) {
  const ohne = [];
  const mit = [];
  const ausLetzter = new Set(letzte ? letzte.eintraege.map((e) => e.id) : []);
  for (const e of letzte ? letzte.eintraege : []) {
    if (!e.hausaufgabe) continue;
    if (!e.bis) ohne.push({ text: e.hausaufgabe, bis: null });
    else if (e.bis >= datum) mit.push(e);
  }
  for (const e of eintraege) {
    if (e.kurs !== kurs || !e.bis || !e.hausaufgabe || ausLetzter.has(e.id)) continue;
    if (e.datum < datum && datum <= e.bis) mit.push(e);
  }
  mit.sort((a, b) => a.bis.localeCompare(b.bis) || a.datum.localeCompare(b.datum) || a.position - b.position);
  return [...ohne, ...mit.map((e) => ({ text: e.hausaufgabe, bis: e.bis }))];
}

// ---------------------------------------------------------------------------
// Lücken: Unterricht laut Stundenplan, zu dem das Archiv (noch) keinen Eintrag hat
// ---------------------------------------------------------------------------
//
// Ohne Uhrzeiten der Stunden gilt: Ab Unterrichtsbeginn zählt der ganze heutige Tag als gehalten.
// Grundlage sind nur gemessene Tage (Stundenplan-Fenster), mit Entfall, „Nicht anzeigen“,
// freien Tagen und Overrides so, wie die Vorschau sie zeigt.

/** Letzter Tag, dessen Unterricht schon begonnen hat: heute ab Schulbeginn, sonst gestern. */
function gehaltenBis(jetzt, schulbeginn) {
  const heute = isoDatum(jetzt);
  return uhrzeit(jetzt) < schulbeginn ? datumPlus(heute, -1) : heute;
}

/**
 * Jüngster bekannter Abruf in Ortszeit → { tag, vorBeginn } oder null. Genommen wird der späteste
 * Zeitstempel aus letzterAbruf, sync.letzterErfolg und stundenplan.abgerufenAm. vorBeginn: Der
 * Abruf lag vor Unterrichtsbeginn, der Unterricht dieses Tages kam also erst danach.
 */
export function abrufStand(daten, schulbeginn = "08:00") {
  const zeiten = [daten.letzterAbruf, daten.sync && daten.sync.letzterErfolg, daten.stundenplan && daten.stundenplan.abgerufenAm]
    .filter((x) => typeof x === "string" && x)
    .map((x) => (/^\d{4}-\d{2}-\d{2}$/.test(x) ? mittag(x) : new Date(x)))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (!zeiten.length) return null;
  const d = new Date(Math.max(...zeiten.map((z) => z.getTime())));
  return { tag: isoDatum(d), vorBeginn: uhrzeit(d) < schulbeginn };
}

const nachAbruf = (tag, abruf) => !!abruf && (tag > abruf.tag || (tag === abruf.tag && abruf.vorBeginn));

/** Gemessene Tage aus dem Cache bis einschließlich `bis`, ohne freie Tage, neueste zuerst. */
function gehalteneTage(daten, planFuer, bis, freieTage) {
  return Object.keys((daten.stundenplan && daten.stundenplan.tage) || {})
    .filter((t) => t <= bis && !istFrei(t, freieTage))
    .sort()
    .reverse()
    .map((t) => planFuer(t))
    .filter((p) => p.herkunft === "gemessen");
}

/**
 * Schulstunden laut Stundenplan nach dem letzten Abruf bis jetzt. Entfall und „Nicht anzeigen“
 * zählen nicht, eine Doppelstunde zählt zweimal. → { anzahl, mehr } oder null, wenn keine.
 * mehr: Der Stundenplan reicht nicht bis heute, es waren also vermutlich noch mehr.
 */
export function stundenSeitAbruf(jetzt, daten) {
  const einst = mitStandard(daten.einstellungen);
  const abruf = abrufStand(daten, einst.schulbeginn);
  if (!abruf) return null;
  const r = stundenNachAbruf(daten, einst, abruf, gehaltenBis(jetzt, einst.schulbeginn), isoDatum(jetzt));
  return r.anzahl ? r : null;
}

/** Gehaltene Schulstunden nach dem Abruf bis einschließlich Tag `bis` → { anzahl, mehr }. */
function stundenNachAbruf(daten, einst, abruf, bis, heute) {
  const planFuer = planFunktion(daten, heute);
  let anzahl = 0;
  for (const plan of gehalteneTage(daten, planFuer, bis, einst.freieTage)) {
    if (!nachAbruf(plan.datum, abruf)) continue;
    for (const k of plan.kurse) anzahl += Array.isArray(k.stunden) && k.stunden.length ? k.stunden.length : 1;
  }
  const f = (daten.stundenplan && daten.stundenplan.fenster) || {};
  return { anzahl, mehr: !f.bis || bis > f.bis };
}

/**
 * Erinnerung oben in der App, das Lesezeichen anzutippen → { art: "warn"|"fehler", text } oder null.
 * Rot, solange der letzte Abruf fehlgeschlagen ist. Sonst erst nach Schulschluss: Stunden von heute
 * zählen ab erinnerungAb, frühere Tage immer. Reicht der Stundenplan nicht bis dahin, erinnert sie
 * nach syncWarnungNachTagen Tagen ohne Abruf, nur nicht an freien Tagen.
 */
export function erinnerung(jetzt, daten) {
  const einst = mitStandard(daten.einstellungen);
  const s = syncStatus(daten.sync, jetzt, einst);
  if (s.art === "fehler") return { art: "fehler", text: s.text };
  const abruf = abrufStand(daten, einst.schulbeginn);
  if (!abruf) return null;
  const heute = isoDatum(jetzt);
  const bis = uhrzeit(jetzt) < einst.erinnerungAb ? datumPlus(heute, -1) : heute;
  const r = stundenNachAbruf(daten, einst, abruf, bis, heute);
  if (r.anzahl) {
    const seit = abruf.tag === heute ? "heute vor Unterrichtsbeginn" : `am ${wochentagLesbar(abruf.tag)}`;
    const stunden = `${r.mehr ? "mehr als " : ""}${r.anzahl} ${r.anzahl === 1 ? "Schulstunde" : "Schulstunden"}`;
    return { art: "warn", text: `Seit dem Abruf ${seit} ${r.anzahl === 1 ? "war" : "waren"} ${stunden}.` };
  }
  if (r.mehr && tageZwischen(abruf.tag, bis) > einst.syncWarnungNachTagen && !istFrei(heute, einst.freieTage)) {
    return { art: "warn", text: `Letzter Abruf ${vorTagenText(tageZwischen(abruf.tag, heute))}.` };
  }
  return null;
}

/** "seitdem 5 Schulstunden", "seitdem mehr als 5 Schulstunden"; ohne Wert "". */
export function stundenSeitAbrufText(r) {
  if (!r) return "";
  return `seitdem ${r.mehr ? "mehr als " : ""}${r.anzahl} ${r.anzahl === 1 ? "Schulstunde" : "Schulstunden"}`;
}

// ---------------------------------------------------------------------------
// §6.5 Digest: eine Eingabe, dieselbe Ausgabe für Kopfzeile, Mitteilung und Widget
// ---------------------------------------------------------------------------

/** Tagesplan-Funktion für einen Datenstand; wird von baueDigest und der Pfeilnavigation genutzt. */
export function planFunktion(daten, heute) {
  const einst = mitStandard(daten.einstellungen);
  const wochenplan = ermittleWochenplan(daten.eintraege || [], heute, einst);
  return (d) => tagesplan(d, daten.stundenplan, wochenplan, einst, daten.kurszuordnung || {});
}

export function tagLabel(datum, heute) {
  const diff = tageZwischen(heute, datum);
  const lesbar = wochentagLesbar(datum);
  if (diff === 0) return `Heute, ${lesbar}`;
  if (diff === 1) return `Morgen, ${lesbar}`;
  return lesbar;
}

/**
 * daten: { eintraege, kursAlias, stundenplan, kurszuordnung, einstellungen, datum? }
 * datum erzwingt einen Tag (Pfeilnavigation); sonst naechsterSchultag.
 * → { datum, label, wochentag, herkunft, angepasst, kurse: [{ kurs, name, fach, thema, hausaufgabe,
 *      hausaufgaben, letztesDatum, vorTagen, alt, sicherheit, status, stunden, zuordnungFehlt, luecke, selbst }],
 *    entfallen: [{ kurs, fach, stunden, name }], anzahlHA, luecke }
 * kurse[].hausaufgaben: [{ text, bis }] aus hausaufgabenAmTag, hausaufgabe ist derselbe Text verbunden.
 * Eine selbst eingetragene Hausaufgabe mit Abgabedatum steht so an jedem Tag des Kurses bis zur Abgabe.
 * kurse[].luecke: { datum, nachAbruf } oder null. Die letzte gehaltene Stunde des Kurses laut
 * Stundenplan (datum) hat keinen Eintrag im Archiv; nachAbruf: sie lag nach dem letzten Abruf.
 * Ein selbst eingetragener Eintrag zählt wie jeder andere, schließt also auch die Lücke.
 * kurse[].selbst: "alle", wenn die Einträge der letzten Stunde alle selbst eingetragen sind,
 * "teils" bei gemischten, sonst null.
 * luecke (Digest): { abrufTag }, wenn mindestens ein Kurs eine Lücke nach dem Abruf hat, sonst null.
 * Reihenfolge: gemessen wie im Stundenplan (erste Stunde oben); sonst Kurse mit Hausaufgabe
 * zuerst (stabil). Mitteilung und Viewer zeigen dieselbe Reihenfolge.
 */
export function baueDigest(jetzt, daten) {
  const einst = mitStandard(daten.einstellungen);
  const heute = isoDatum(jetzt);
  const eintraege = daten.eintraege || [];
  const planFuer = planFunktion(daten, heute);
  const datum = daten.datum || naechsterSchultag(jetzt, planFuer, einst.freieTage, einst.schulbeginn);
  if (!datum) {
    return { datum: null, label: `Kein Schultag in den nächsten ${SCHULTAGE_VORAUS} Tagen`, wochentag: null,
      herkunft: null, angepasst: false, kurse: [], entfallen: [], anzahlHA: 0, luecke: null };
  }
  const plan = planFuer(datum);
  const abruf = abrufStand(daten, einst.schulbeginn);
  const zuletztGehalten = new Map();   // Kurs → letzter gehaltener Tag vor dem gezeigten Tag
  for (const p of gehalteneTage(daten, planFuer, gehaltenBis(jetzt, einst.schulbeginn), einst.freieTage)) {
    if (p.datum >= datum) continue;
    for (const k of p.kurse) if (k.kurs && !zuletztGehalten.has(k.kurs)) zuletztGehalten.set(k.kurs, p.datum);
  }
  const kurse = plan.kurse.map((k) => {
    const letzte = k.kurs ? letzteStunde(eintraege, k.kurs, datum) : null;
    const thema = letzte ? letzte.eintraege.map((e) => e.thema).filter(Boolean).join("\n") : "";
    const hausaufgaben = k.kurs ? hausaufgabenAmTag(eintraege, k.kurs, datum, letzte) : [];
    const hausaufgabe = hausaufgaben.map((h) => h.text).join("\n");
    const vorTagen = letzte ? tageZwischen(letzte.datum, heute) : null;
    const gehalten = k.kurs ? zuletztGehalten.get(k.kurs) : undefined;
    const luecke = gehalten && (!letzte || letzte.datum < gehalten) ? { datum: gehalten, nachAbruf: nachAbruf(gehalten, abruf) } : null;
    const eigene = letzte ? letzte.eintraege.filter(istEigen).length : 0;
    return {
      kurs: k.kurs,
      name: k.kurs ? anzeigename(k.kurs, daten.kursAlias || {}) : k.fach,
      fach: k.fach || null,
      stunden: k.stunden || null,
      status: k.status || "normal",
      sicherheit: k.sicherheit || null,
      zuordnungFehlt: !!k.zuordnungFehlt,
      letztesDatum: letzte ? letzte.datum : null,
      vorTagen,
      alt: vorTagen !== null && vorTagen > einst.altSchwelleTage,
      thema,
      hausaufgabe,
      hausaufgaben,
      luecke,
      selbst: !eigene ? null : eigene === letzte.eintraege.length ? "alle" : "teils",
    };
  });
  // Gemessen: Reihenfolge des Stundenplans, erste Stunde oben. Sonst gibt es keine echte
  // Reihenfolge, dann Kurse mit Hausaufgabe zuerst (stabil).
  const mitHa = kurse.filter((k) => k.hausaufgabe);
  const geordnet = plan.herkunft === "gemessen" ? kurse : [...mitHa, ...kurse.filter((k) => !k.hausaufgabe)];
  return {
    datum,
    label: tagLabel(datum, heute),
    wochentag: plan.wochentag,
    herkunft: plan.herkunft,
    angepasst: plan.angepasst,
    kurse: geordnet,
    entfallen: plan.entfallen.map((k) => ({ kurs: k.kurs, fach: k.fach, stunden: k.stunden, name: k.kurs ? anzeigename(k.kurs, daten.kursAlias || {}) : k.fach })),
    anzahlHA: mitHa.length,
    luecke: abruf && kurse.some((k) => k.luecke && k.luecke.nachAbruf) ? { abrufTag: abruf.tag } : null,
  };
}

/** Zweite Zeile unter dem Datum: "5 Kurse · 2 Hausaufgaben", bei Entfall dazu "· 1 entfällt".
 * Entfällt alles: "2 Kurse entfallen". */
export function digestKopfzeile(digest) {
  if (!digest.datum) return "";
  const n = digest.kurse.length;
  const h = digest.anzahlHA;
  const e = digest.entfallen.length;
  if (!n && e) return `${e} ${e === 1 ? "Kurs entfällt" : "Kurse entfallen"}`;
  const teile = [`${n} ${n === 1 ? "Kurs" : "Kurse"}`, `${h} ${h === 1 ? "Hausaufgabe" : "Hausaufgaben"}`];
  if (e) teile.push(`${e} ${e === 1 ? "entfällt" : "entfallen"}`);
  return teile.join(" · ");
}

/**
 * Karten des Tages in Reihenfolge: ein entfallender Kurs steht dort, wo seine erste Stunde gewesen
 * wäre (fällt die erste Stunde aus, steht er oben). Die Nummer selbst wird nie angezeigt. Kurse
 * ohne Stundennummer (fest gesetzt, abgeleitet) zählen als letzte.
 * → [{ art: "kurs" | "entfall", kurs }]
 */
export function tagesablauf(digest) {
  const erste = (k) => (Array.isArray(k.stunden) && k.stunden.length ? Math.min(...k.stunden) : Infinity);
  const liste = digest.kurse.map((k) => ({ art: "kurs", kurs: k }));
  for (const e of digest.entfallen) {
    const i = liste.findIndex((x) => erste(x.kurs) > erste(e));
    liste.splice(i === -1 ? liste.length : i, 0, { art: "entfall", kurs: e });
  }
  return liste;
}

/** Klartext für Mitteilung oder Widget. Identische Quelle wie die Kopfzeile im Viewer. */
export function digestText(digest) {
  if (!digest.datum) return digest.label;
  const zeilen = [`${digest.label} · ${digestKopfzeile(digest)}`];
  for (const k of digest.kurse) {
    const liste = k.hausaufgaben || (k.hausaufgabe ? [{ text: k.hausaufgabe, bis: null }] : []);
    const texte = liste.map((h) => h.text.replace(/\s*\n\s*/g, " / ") + (h.bis ? ` (bis ${wochentagLesbar(h.bis)})` : ""));
    if (texte.length) zeilen.push(`${k.name}: ${texte.join(" / ")}`);
  }
  const ohne = digest.kurse.filter((k) => !k.hausaufgabe).map((k) => k.name);
  if (ohne.length) zeilen.push(`Ohne Hausaufgabe: ${ohne.join(", ")}`);
  if (digest.entfallen.length) zeilen.push(`Entfällt: ${digest.entfallen.map((k) => k.name).join(", ")}`);
  return zeilen.join("\n");
}

/** Satz für den Hinweis in der Vorschau, wenn eine fehlende Stunde nach dem letzten Abruf lag; sonst null. */
export function lueckeText(digest) {
  if (!digest || !digest.luecke) return null;
  return `Seit dem letzten Abruf am ${wochentagLesbar(digest.luecke.abrufTag)} war Unterricht.`;
}

// ---------------------------------------------------------------------------
// Stundenplan-Cache (§4): Fenster ersetzen, Rest behalten. Bewusst anders als das Archiv.
// ---------------------------------------------------------------------------

export function leererStundenplan() {
  return { abgerufenAm: null, fenster: { von: null, bis: null }, tage: {} };
}

/**
 * lieferung: { von, bis, tage: { "YYYY-MM-DD": [stunden] }, abgerufenAm }
 * Alle Tage im Fenster [von, bis] werden ersetzt, auch gelöschte (entfallener Termin muss
 * verschwinden können). Tage außerhalb bleiben stehen. Überlappt oder berührt das neue Fenster
 * das alte, wird das Fenster vereinigt; sonst gilt nur das neue.
 */
export function stundenplanUebernehmen(stundenplan, lieferung) {
  const alt = stundenplan && stundenplan.tage ? stundenplan : leererStundenplan();
  const { von, bis } = lieferung;
  const tage = {};
  for (const [d, s] of Object.entries(alt.tage)) if (d < von || d > bis) tage[d] = s;
  for (const [d, s] of Object.entries(lieferung.tage || {})) if (d >= von && d <= bis) tage[d] = s;
  let fenster = { von, bis };
  const f = alt.fenster;
  if (f && f.von && f.bis && von <= datumPlus(f.bis, 1) && bis >= datumPlus(f.von, -1)) {
    fenster = { von: von < f.von ? von : f.von, bis: bis > f.bis ? bis : f.bis };
  }
  return { abgerufenAm: lieferung.abgerufenAm || null, fenster, tage };
}

/**
 * Fächer aus dem Stundenplan-Cache ohne Zuordnung mit einem gleichnamigen Kurs aus dem Archiv
 * verbinden (Groß/Klein und Randleerzeichen egal). Vorhandene Einträge bleiben unangetastet,
 * auch „nicht anzeigen“ (kurs: null). Passt nichts, bleibt das Fach offen und die Vorschau
 * fragt nach. Reine Funktion.
 */
export function kurszuordnungErgaenzen(kurszuordnung, stundenplan, eintraege) {
  const zu = { ...(kurszuordnung || {}) };
  const kurse = new Map();
  for (const e of eintraege || []) {
    if (!e || typeof e.kurs !== "string" || !e.kurs) continue;
    const k = e.kurs.trim().toLowerCase();
    if (!kurse.has(k)) kurse.set(k, e.kurs);
  }
  const tage = stundenplan && stundenplan.tage ? Object.values(stundenplan.tage) : [];
  for (const liste of tage) {
    for (const s of liste || []) {
      const fach = s && typeof s.fach === "string" ? s.fach : "";
      if (!fach || Object.prototype.hasOwnProperty.call(zu, fach)) continue;
      const kurs = kurse.get(fach.trim().toLowerCase());
      if (kurs) zu[fach] = { kurs, quelle: "auto", bestaetigt: false };
    }
  }
  return zu;
}

// ---------------------------------------------------------------------------
// Eintragen: Datum, Kursauswahl und Vorschläge für selbst eingetragene Hausaufgaben
// ---------------------------------------------------------------------------

/**
 * Vorgeschlagenes Datum für „Aufgegeben am“: der letzte Tag, dessen Unterricht schon begonnen hat
 * (heute ab Schulbeginn), ohne Wochenende und freie Tage. Morgens vor Schulbeginn und am
 * Wochenende also der Schultag davor.
 */
export function eintragDatum(jetzt, einstellungen) {
  const einst = mitStandard(einstellungen);
  let d = gehaltenBis(jetzt, einst.schulbeginn);
  for (let i = 0; i < SCHULTAGE_VORAUS && (istWochenende(d) || istFrei(d, einst.freieTage)); i++) d = datumPlus(d, -1);
  return d;
}

/**
 * Die nächsten Tage nach `nachDatum`, an denen der Kurs laut Tagesplan Unterricht hat, ohne
 * Entfall, Wochenende und freie Tage. Für die Knöpfe beim Abgabedatum. Ein Fach ohne Zuordnung
 * passt über seinen Namen (wie in kurseZumEintragen). → ["YYYY-MM-DD", …], höchstens anzahl
 */
export function naechsteStunden(daten, kurs, nachDatum, heute, anzahl = 3) {
  if (!kurs || !nachDatum) return [];
  const einst = mitStandard(daten.einstellungen);
  const planFuer = planFunktion(daten, heute);
  const tage = [];
  for (let i = 1; i <= SCHULTAGE_VORAUS * 2 && tage.length < anzahl; i++) {
    const d = datumPlus(nachDatum, i);
    if (istWochenende(d) || istFrei(d, einst.freieTage)) continue;
    if (planFuer(d).kurse.some((k) => k.kurs === kurs || (!k.kurs && k.fach === kurs))) tage.push(d);
  }
  return tage;
}

/**
 * Kurse für das Auswahlfeld beim Eintragen.
 * amTag: Kurse des Tages in Tagesreihenfolge, ohne Entfall und „Nicht anzeigen“, leer an freien Tagen.
 * weitere: alle übrigen Kurse aus Archiv, Kurszuordnung und Stundenplan, nach Anzeigename.
 * Ein Fach ohne Zuordnung steht mit kurs = fach und gesetztem fach. Wer es wählt, ordnet das Fach
 * damit dem gleichnamigen Kurs zu; so lässt sich auch ein Kurs ohne jeden Eintrag wählen.
 * → { amTag: [{ kurs, name, fach }], weitere: [{ kurs, name, fach }] }
 */
export function kurseZumEintragen(daten, datum, heute) {
  const einst = mitStandard(daten.einstellungen);
  const alias = daten.kursAlias || {};
  const zuordnung = daten.kurszuordnung || {};
  const offen = new Set();   // Fächer im Stundenplan ohne Zuordnung
  for (const s of Object.values((daten.stundenplan && daten.stundenplan.tage) || {}).flat()) {
    if (s && typeof s.fach === "string" && s.fach && !Object.prototype.hasOwnProperty.call(zuordnung, s.fach)) offen.add(s.fach);
  }
  const eintrag = (kurs) => ({ kurs, name: anzeigename(kurs, alias), fach: offen.has(kurs) ? kurs : null });

  const amTag = [];
  if (datum && !istFrei(datum, einst.freieTage)) {
    for (const k of planFunktion(daten, heute)(datum).kurse) {
      const kurs = k.kurs || k.fach;
      if (kurs && !amTag.some((x) => x.kurs === kurs)) amTag.push(eintrag(kurs));
    }
  }
  const alle = new Set([
    ...(daten.eintraege || []).map((e) => e.kurs),
    ...Object.values(zuordnung).map((z) => z && z.kurs).filter((k) => typeof k === "string" && k),
    ...offen,
  ]);
  const weitere = kurseSortiert([...alle].filter((k) => !amTag.some((x) => x.kurs === k)), alias).map(eintrag);
  return { amTag, weitere };
}

/**
 * Vorschläge beim Eintragen: Kurse, die am Tag laut Stundenplan stattfanden, aber im Archiv keine
 * Hausaufgabe haben, weder von der Lehrkraft noch selbst eingetragen. Nur gemessene Tage, deren
 * Unterricht schon begonnen hat, sonst null. abgerufen: Der letzte Abruf lag nach Beginn dieses
 * Tages, keine Hausaufgabe heißt dann „im Schulmanager nichts eingetragen“. Ohne Uhrzeiten der
 * Stunden zählt wie bei den Lücken der ganze Tag ab Schulbeginn.
 * → { datum, abgerufen, kurse: [{ kurs, name, fach }] } oder null
 */
export function kurseOhneHausaufgabe(jetzt, daten, datum) {
  const einst = mitStandard(daten.einstellungen);
  const heute = isoDatum(jetzt);
  if (!datum || datum > gehaltenBis(jetzt, einst.schulbeginn) || istFrei(datum, einst.freieTage)) return null;
  if (planFunktion(daten, heute)(datum).herkunft !== "gemessen") return null;
  const mitHausaufgabe = new Set((daten.eintraege || []).filter((e) => e.datum === datum && e.hausaufgabe).map((e) => e.kurs));
  const abruf = abrufStand(daten, einst.schulbeginn);
  return {
    datum,
    abgerufen: !!abruf && !nachAbruf(datum, abruf),
    kurse: kurseZumEintragen(daten, datum, heute).amTag.filter((k) => !mitHausaufgabe.has(k.kurs)),
  };
}

// ---------------------------------------------------------------------------
// Statuszeilen für die Oberfläche (§7), rein aus Daten und Zeitpunkt
// ---------------------------------------------------------------------------

export function herkunftZeile(digest, stundenplan, jetzt, einstellungen) {
  const einst = mitStandard(einstellungen);
  if (!digest || !digest.datum) return "";
  const heute = isoDatum(jetzt);
  if (digest.herkunft === "gemessen") {
    const am = stundenplan && stundenplan.abgerufenAm ? stundenplan.abgerufenAm.slice(0, 10) : null;
    const alter = am ? tageZwischen(am, heute) : null;
    let t = am ? `Stundenplan vom ${tagMonat(am)}, abgerufen ${vorTagenText(alter)}` : "Stundenplan aus Schulmanager";
    if (alter !== null && alter > einst.stundenplanStaleTage) t += " · evtl. veraltet";
    return t;
  }
  if (digest.herkunft === "manuell") return "Nur manuell festgelegte Kurse";
  // Stundenplan da, aber der Tag liegt außerhalb des abgerufenen Fensters: das ehrlich sagen,
  // sonst liest sich "nicht abgerufen" wie ein Fehler.
  const f = stundenplan && stundenplan.abgerufenAm && stundenplan.fenster ? stundenplan.fenster : {};
  if (f.bis && digest.datum > f.bis) return `Aus dem Archiv abgeleitet, Stundenplan reicht nur bis ${tagMonat(f.bis)}`;
  if (f.von && digest.datum < f.von) return `Aus dem Archiv abgeleitet, Stundenplan beginnt erst ${tagMonat(f.von)}`;
  return "Aus dem Archiv abgeleitet, Stundenplan nicht abgerufen";
}

const tagMonat = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

export function vorTagenText(tage) {
  if (tage === null || tage === undefined) return "";
  if (tage <= 0) return "heute";
  if (tage === 1) return "gestern";
  return `vor ${tage} Tagen`;
}

/** → { art: "nie"|"ok"|"warn"|"fehler", text } */
export function syncStatus(sync, jetzt, einstellungen) {
  const einst = mitStandard(einstellungen);
  const s = sync || {};
  const heute = isoDatum(jetzt);
  const fehlerNeuer = s.letzterFehler && s.letzterFehler.zeit && (!s.letzterErfolg || s.letzterFehler.zeit > s.letzterErfolg);
  if (fehlerNeuer) return { art: "fehler", text: `Letzter Abruf fehlgeschlagen: ${s.letzterFehler.text || s.letzterFehler.art || "unbekannter Fehler"}` };
  if (!s.letzterErfolg) return { art: "nie", text: "Noch kein Abruf" };
  const tage = tageZwischen(s.letzterErfolg.slice(0, 10), heute);
  if (tage > einst.syncWarnungNachTagen) return { art: "warn", text: `Letzter Abruf ${vorTagenText(tage)}, evtl. veraltet` };
  return { art: "ok", text: `Letzter Abruf ${vorTagenText(tage)}` };
}

/**
 * Statuszeile unter der Herkunft-Zeile der Vorschau. Ein Fehler kommt als art "fehler" zurück
 * (die Oberfläche zeigt dann eine Box), alles andere als leise Zeile. null, wenn die
 * Herkunft-Zeile denselben Abruf schon nennt: Tag gemessen und Stundenplan am selben Tag
 * geholt wie der letzte erfolgreiche Abruf.
 */
export function syncZeile(digest, stundenplan, sync, jetzt, einstellungen) {
  const s = syncStatus(sync, jetzt, einstellungen);
  if (s.art === "fehler") return s;
  const am = stundenplan && stundenplan.abgerufenAm;
  const erfolg = sync && sync.letzterErfolg;
  if (digest && digest.herkunft === "gemessen" && am && erfolg && am.slice(0, 10) === erfolg.slice(0, 10)) return null;
  return s;
}
