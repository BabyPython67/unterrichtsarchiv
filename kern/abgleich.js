// Abgleich zwischen Geräten. Ein Gerät holt die Ablage, führt sie mit dem lokalen Bestand
// zusammen und legt das Ergebnis wieder ab. Reine Funktionen, kein DOM, kein Date.now().
//
//   Einträge aus dem Schulmanager   Vereinigung. Leeres Feld überschreibt nie, bei abweichendem
//                                   Text gewinnt das jüngere geaendert. Archiv schrumpft nie.
//   Eigene Einträge                 jüngeres geaendertUm gewinnt. Gelöschte hinterlassen einen
//                                   Grabstein (geloescht[id] = Zeitpunkt), der ältere Stände schlägt.
//   Stundenplan                     das Fenster des jüngeren Abrufs ersetzt die Tage des älteren.
//   kurszuordnung                   je Fach: manuell schlägt automatisch, sonst jüngerer Block.
//   kursAlias, klausurschnitt,      ganzer Block vom Gerät mit dem jüngeren Stempel (staende);
//   einstellungen                   ohne Stempel auf beiden Seiten: Schlüssel vereinigen.
//
// Das Ergebnis hängt nicht von der Reihenfolge der Argumente ab. Stempel und Grabsteine setzt
// aenderungenStempeln() beim Speichern, indem es den vorigen mit dem neuen Bestand vergleicht.

import { istEigen, EIGENE_POSITION_AB } from "./mergen.js";
import { stundenplanUebernehmen, kurszuordnungErgaenzen } from "./logik.js";
import { STAND_BLOECKE } from "./speicher.js";

export const GRABSTEIN_TAGE = 180;

/** JSON mit sortierten Schlüsseln: gleiche Inhalte ergeben denselben Text. */
export function stabil(v) {
  if (Array.isArray(v)) return `[${v.map(stabil).join(",")}]`;
  if (v && typeof v === "object") {
    const teile = Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stabil(v[k])}`);
    return `{${teile.join(",")}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
}

const spaeter = (a, b) => (!a ? b || null : !b ? a : a > b ? a : b);
const frueher = (a, b) => (!a ? b || null : !b ? a : a < b ? a : b);

/** Von zwei Werten der mit dem jüngeren Zeitpunkt; bei Gleichstand fest nach Inhalt. */
function juenger(a, b, za, zb) {
  if ((za || "") !== (zb || "")) return (za || "") > (zb || "") ? a : b;
  return stabil(a) >= stabil(b) ? a : b;
}

function textFeld(a, b, name) {
  const x = a[name] || "";
  const y = b[name] || "";
  if (!x || x === y) return y || x;
  if (!y) return x;
  return juenger(x, y, a.geaendert, b.geaendert);
}

function schulmanagerEintrag(a, b) {
  return {
    id: a.id, kurs: a.kurs, datum: a.datum,
    thema: textFeld(a, b, "thema"), hausaufgabe: textFeld(a, b, "hausaufgabe"),
    position: a.position,
    ersterfasst: frueher(a.ersterfasst, b.ersterfasst), geaendert: spaeter(a.geaendert, b.geaendert),
  };
}

function eintraegeZusammenfuehren(a, b, geloescht) {
  const nachId = new Map(a.map((e) => [e.id, e]));
  // Eigene Einträge von vor dem Abgleich zählen je Kurs und Tag ab 1001. Haben zwei Geräte dieselbe
  // ID mit verschiedenem Text vergeben, bleiben beide: einer behält die ID, der andere zieht um.
  const weichen = [];
  for (const e of b) {
    const x = nachId.get(e.id);
    if (!x) { nachId.set(e.id, e); continue; }
    if (stabil(x) === stabil(e)) continue;
    if (!istEigen(e)) { nachId.set(e.id, schulmanagerEintrag(x, e)); continue; }
    if (!x.geaendertUm && !e.geaendertUm && x.hausaufgabe !== e.hausaufgabe) {
      const [bleibt, weicht] = x.hausaufgabe < e.hausaufgabe ? [x, e] : [e, x];
      nachId.set(e.id, bleibt);
      weichen.push(weicht);
      continue;
    }
    nachId.set(e.id, juenger(x, e, x.geaendertUm, e.geaendertUm));
  }
  const eintraege = [...nachId.values()]
    .filter((e) => !(istEigen(e) && geloescht[e.id] && geloescht[e.id] >= (e.geaendertUm || "")));
  const gleicherTag = (e, w) => istEigen(e) && e.kurs === w.kurs && e.datum === w.datum;
  for (const w of weichen.sort((p, q) => (p.hausaufgabe < q.hausaufgabe ? -1 : 1))) {
    if (geloescht[w.id]) continue;
    if (eintraege.some((e) => gleicherTag(e, w) && e.hausaufgabe === w.hausaufgabe)) continue;
    let p = EIGENE_POSITION_AB - 1;
    for (const e of eintraege) if (gleicherTag(e, w)) p = Math.max(p, e.position);
    eintraege.push({ ...w, id: `${w.kurs}|${w.datum}|${p + 1}`, position: p + 1 });
  }
  const vergleich = (p, q) => (p < q ? -1 : p > q ? 1 : 0);
  return eintraege.sort((p, q) => vergleich(p.datum, q.datum) || vergleich(p.kurs, q.kurs) || p.position - q.position);
}

function stundenplanZusammenfuehren(x, y) {
  const [neu, alt] = juenger(x, y, x.abgerufenAm, y.abgerufenAm) === x ? [x, y] : [y, x];
  if (!neu.fenster.von || !neu.fenster.bis) return alt.fenster.von ? alt : neu;
  return stundenplanUebernehmen(alt, { von: neu.fenster.von, bis: neu.fenster.bis, tage: neu.tage, abgerufenAm: neu.abgerufenAm });
}

function kurszuordnungZusammenfuehren(a, b) {
  const x = a.kurszuordnung;
  const y = b.kurszuordnung;
  const z = {};
  for (const fach of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (!Object.hasOwn(y, fach)) { z[fach] = x[fach]; continue; }
    if (!Object.hasOwn(x, fach)) { z[fach] = y[fach]; continue; }
    const mx = x[fach].quelle === "manuell";
    const my = y[fach].quelle === "manuell";
    z[fach] = mx !== my ? (mx ? x[fach] : y[fach]) : juenger(x[fach], y[fach], a.staende.kurszuordnung, b.staende.kurszuordnung);
  }
  return z;
}

function blockZusammenfuehren(name, a, b) {
  const x = a[name];
  const y = b[name];
  const za = a.staende[name] || "";
  const zb = b.staende[name] || "";
  if (za !== zb) return za > zb ? x : y;
  if (name === "einstellungen") return juenger(x, y, null, null);
  const z = {};
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    z[k] = !Object.hasOwn(y, k) ? x[k] : !Object.hasOwn(x, k) ? y[k] : juenger(x[k], y[k], null, null);
  }
  return z;
}

function syncZusammenfuehren(x, y) {
  const letzterErfolg = spaeter(x.letzterErfolg, y.letzterErfolg);
  let letzterFehler = !x.letzterFehler ? y.letzterFehler : !y.letzterFehler ? x.letzterFehler
    : juenger(x.letzterFehler, y.letzterFehler, x.letzterFehler.zeit, y.letzterFehler.zeit);
  if (letzterFehler && letzterErfolg && letzterErfolg >= letzterFehler.zeit) letzterFehler = null;
  return {
    letzterLauf: spaeter(x.letzterLauf, y.letzterLauf),
    letzterErfolg,
    letzterFehler: letzterFehler || null,
    quelle: juenger(x.quelle, y.quelle, x.letzterErfolg, y.letzterErfolg) || x.quelle || y.quelle || null,
  };
}

/**
 * Beide Bestände müssen durch pruefeBestand gelaufen sein.
 * @param jetzt ISO-Zeitstempel, nur um alte Grabsteine zu verwerfen
 * → { bestand, neu }   neu = Einträge, die lokal noch nicht da waren
 */
export function zusammenfuehren(lokal, fremd, jetzt) {
  const grenze = new Date(Date.parse(jetzt) - GRABSTEIN_TAGE * 864e5).toISOString();
  const geloescht = {};
  for (const [id, zeit] of [...Object.entries(lokal.geloescht), ...Object.entries(fremd.geloescht)]) {
    if (zeit >= grenze) geloescht[id] = spaeter(geloescht[id], zeit);
  }
  const eintraege = eintraegeZusammenfuehren(lokal.eintraege, fremd.eintraege, geloescht);
  const stundenplan = stundenplanZusammenfuehren(lokal.stundenplan, fremd.stundenplan);
  const staende = {};
  for (const block of STAND_BLOECKE) {
    const z = spaeter(lokal.staende[block], fremd.staende[block]);
    if (z) staende[block] = z;
  }
  const bestand = {
    schemaVersion: lokal.schemaVersion,
    letzterAbruf: spaeter(lokal.letzterAbruf, fremd.letzterAbruf),
    kursAlias: blockZusammenfuehren("kursAlias", lokal, fremd),
    klausurschnitt: blockZusammenfuehren("klausurschnitt", lokal, fremd),
    eintraege,
    stundenplan,
    kurszuordnung: kurszuordnungErgaenzen(kurszuordnungZusammenfuehren(lokal, fremd), stundenplan, eintraege),
    sync: syncZusammenfuehren(lokal.sync, fremd.sync),
    einstellungen: blockZusammenfuehren("einstellungen", lokal, fremd),
    geloescht,
    staende,
  };
  const bekannt = new Set(lokal.eintraege.map((e) => e.id));
  return { bestand: JSON.parse(JSON.stringify(bestand)), neu: eintraege.filter((e) => !bekannt.has(e.id)).length };
}

/**
 * Vergleicht den zuletzt gespeicherten mit dem neuen Bestand und stempelt, was sich geändert hat:
 * neue oder geänderte eigene Einträge bekommen geaendertUm, verschwundene einen Grabstein,
 * geänderte Blöcke einen Stand. vorher null: nichts zu vergleichen.
 */
export function aenderungenStempeln(vorher, nachher, jetzt) {
  if (!vorher) return nachher;
  const alt = new Map(vorher.eintraege.filter(istEigen).map((e) => [e.id, e]));
  const ids = new Set(nachher.eintraege.map((e) => e.id));
  const eintraege = nachher.eintraege.map((e) => {
    if (!istEigen(e)) return e;
    const v = alt.get(e.id);
    return !v || v.hausaufgabe !== e.hausaufgabe || (v.bis || "") !== (e.bis || "") ? { ...e, geaendertUm: jetzt } : e;
  });
  const geloescht = { ...nachher.geloescht };
  for (const id of alt.keys()) if (!ids.has(id)) geloescht[id] = jetzt;
  const staende = { ...nachher.staende };
  for (const block of STAND_BLOECKE) if (stabil(vorher[block]) !== stabil(nachher[block])) staende[block] = jetzt;
  return { ...nachher, eintraege, geloescht, staende };
}
