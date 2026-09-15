// Was ein Abruf Neues gebracht hat: für die Box oben nach dem Aktualisieren und die Marken im
// Archiv. Reine Funktionen, kein DOM.
//
// Der Bericht liegt nur auf diesem Gerät, nicht im Bestand, nicht im Export und nicht in der
// Ablage. Er gilt bis zum nächsten Abruf, der ihn ersetzt:
//   { zeit, seit, erst, neu: [id], geaendert: [id], hausaufgabeNeu: [id],
//     plan: [{ datum, fach, status }], planBis, warnungen: [text], offen }
// erst: Vor dem Abruf lag kein Eintrag aus dem Schulmanager im Archiv. Dann gibt es keine Liste
// und keine Marken, sonst wäre alles „neu“.

import { istEigen } from "./mergen.js";
import { anzeigename, anzahlText, wochentag } from "./filtern.js";

export const NEU_LISTE_MAX = 5;   // mehr Einträge: Hausaufgaben einzeln, der Rest je Kurs gezählt
const KOMPAKT_KURSE = 3;
const PLAN_STATUS = ["entfall", "vertretung"];
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

const zwei = (n) => String(n).padStart(2, "0");

/** ISO-Zeitstempel in Ortszeit, z. B. "Do 10.09., 18:00". Ein reines Datum wird "Do 10.09.". */
export function zeitKurz(iso) {
  if (typeof iso !== "string" || !iso) return "";
  if (DATUM.test(iso)) return wochentag(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${wochentag(`${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`)}, ${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
}

/**
 * Entfall und Vertretung ab heute, die im alten Stundenplan-Cache nicht so standen. Eine
 * Doppelstunde zählt einmal. War der Cache leer (erster Stundenplan), ist nichts neu.
 * → [{ datum, fach, status }]
 */
export function planAenderungen(alt, neu, heute) {
  const altTage = (alt && alt.tage) || {};
  if (!neu || neu === alt || !Object.keys(altTage).length) return [];
  const liste = [];
  for (const datum of Object.keys(neu.tage || {}).sort()) {
    if (datum < heute) continue;
    const bekannt = new Set((altTage[datum] || []).map((s) => `${s.fach}|${s.status}`));
    for (const s of neu.tage[datum]) {
      if (!s || !PLAN_STATUS.includes(s.status)) continue;
      const schluessel = `${s.fach}|${s.status}`;
      if (bekannt.has(schluessel)) continue;
      bekannt.add(schluessel);
      liste.push({ datum, fach: s.fach, status: s.status });
    }
  }
  return liste;
}

/**
 * Bericht zu einem Abruf. vorher/nachher: Bestand vor und nach dem Import, ergebnis: aus mergen.
 * warnungen: aus importieren ({ text } oder Texte).
 */
export function abrufBericht({ vorher, nachher, ergebnis, heute, warnungen = [] }) {
  const erst = !vorher.eintraege.some((e) => !istEigen(e));
  const planNeu = nachher.stundenplan !== vorher.stundenplan;
  const fenster = nachher.stundenplan && nachher.stundenplan.fenster;
  return {
    zeit: nachher.letzterAbruf || null,
    seit: vorher.letzterAbruf || (vorher.sync && vorher.sync.letzterErfolg) || null,
    erst,
    neu: erst ? [] : [...(ergebnis.neueIds || [])],
    geaendert: erst ? [] : [...(ergebnis.geaenderteIds || [])],
    hausaufgabeNeu: erst ? [] : [...(ergebnis.hausaufgabeNeuIds || [])],
    plan: erst ? [] : planAenderungen(vorher.stundenplan, nachher.stundenplan, heute),
    planBis: planNeu && fenster ? fenster.bis || null : null,
    warnungen: warnungen.map((w) => (typeof w === "string" ? w : String((w && w.text) || ""))).filter(Boolean),
    offen: true,
  };
}

/** Bericht aus dem Speicher prüfen. Unbrauchbares wird null. */
export function pruefeBericht(obj) {
  if (!obj || typeof obj !== "object") return null;
  const ids = (x) => Array.isArray(x) && x.every((id) => typeof id === "string");
  if (!ids(obj.neu) || !ids(obj.geaendert) || !ids(obj.hausaufgabeNeu) || !Array.isArray(obj.plan)) return null;
  return {
    zeit: typeof obj.zeit === "string" ? obj.zeit : null,
    seit: typeof obj.seit === "string" ? obj.seit : null,
    erst: obj.erst === true,
    neu: obj.neu, geaendert: obj.geaendert, hausaufgabeNeu: obj.hausaufgabeNeu,
    plan: obj.plan.filter((p) => p && DATUM.test(p.datum) && typeof p.fach === "string" && PLAN_STATUS.includes(p.status)),
    planBis: typeof obj.planBis === "string" && DATUM.test(obj.planBis) ? obj.planBis : null,
    warnungen: Array.isArray(obj.warnungen) ? obj.warnungen.filter((w) => typeof w === "string") : [],
    offen: obj.offen === true,
  };
}

const zaehlText = ({ neu, geaendert }) => [neu ? `${neu} neu` : "", geaendert ? `${geaendert} geändert` : ""].filter(Boolean).join(" · ");

/**
 * Was die Box zeigt → { art, titel, warnungen, … } oder null ohne Bericht.
 *   "erst":    text, hinweis
 *   "leer":    nichts Neues (die App meldet das kurz statt einer Box)
 *   "liste":   hausaufgaben, inhalte, plan (je [{ kurs, name, datum, marke, thema, hausaufgabe }])
 *   "kompakt": hausaufgaben (höchstens NEU_LISTE_MAX), weitereHausaufgaben, kurse [{ kurs, name, text }],
 *              rest { anzahl, text } | null, plan
 * plan: [{ datum, kurs, name, status, text }], weiterePlan. Einträge, die es nicht mehr gibt, fallen weg.
 * zusammenfassung: Zeile für die zugeklappte Box, z. B. "4 Einträge, 2 im Stundenplan".
 */
export function berichtAnsicht(bericht, bestand) {
  if (!bericht) return null;
  const eintraege = bestand.eintraege || [];
  const kursAlias = bestand.kursAlias || {};
  const warnungen = bericht.warnungen || [];

  if (bericht.erst) {
    const kurse = new Set(eintraege.map((e) => e.kurs)).size;
    let text = `${anzahlText(eintraege.length)} aus ${kurse} ${kurse === 1 ? "Kurs" : "Kursen"}`;
    if (bericht.planBis) text += `, Stundenplan bis ${wochentag(bericht.planBis)}`;
    return {
      art: "erst", titel: "Archiv angelegt", warnungen,
      text: text.endsWith(".") ? text : `${text}.`,
      hinweis: "Ab dem nächsten Abruf steht hier, was neu ist.",
    };
  }

  const index = new Map(eintraege.map((e) => [e.id, e]));
  const eintrag = (marke) => (id) => {
    const e = index.get(id);
    return e ? { kurs: e.kurs, name: anzeigename(e.kurs, kursAlias), datum: e.datum, marke, thema: e.thema || "", hausaufgabe: e.hausaufgabe || "" } : null;
  };
  const neuesteZuerst = (a, b) => b.datum.localeCompare(a.datum) || a.name.localeCompare(b.name, "de");
  const neu = bericht.neu.map(eintrag("neu")).filter(Boolean);
  const hausaufgaben = [...neu.filter((e) => e.hausaufgabe), ...bericht.hausaufgabeNeu.map(eintrag("Hausaufgabe neu")).filter(Boolean)].sort(neuesteZuerst);
  const inhalte = [...neu.filter((e) => !e.hausaufgabe), ...bericht.geaendert.map(eintrag("geändert")).filter(Boolean)].sort(neuesteZuerst);

  const zuordnung = bestand.kurszuordnung || {};
  const planAlle = bericht.plan.flatMap((p) => {
    const zu = zuordnung[p.fach];
    if (zu && zu.kurs === null) return [];   // „Nicht anzeigen“
    const kurs = zu && typeof zu.kurs === "string" && zu.kurs ? zu.kurs : null;
    const name = kurs ? anzeigename(kurs, kursAlias) : p.fach;
    return [{ datum: p.datum, kurs, name, status: p.status, text: `${name} am ${wochentag(p.datum)} ${p.status === "entfall" ? "entfällt" : "mit Vertretung"}` }];
  });
  const plan = planAlle.slice(0, NEU_LISTE_MAX);
  const anzahl = hausaufgaben.length + inhalte.length;
  const zusammenfassung = [anzahl ? anzahlText(anzahl) : "", planAlle.length ? `${planAlle.length} im Stundenplan` : ""].filter(Boolean).join(", ");
  const basis = {
    titel: bericht.seit ? `Neu seit ${zeitKurz(bericht.seit)}` : "Neu seit dem letzten Abruf",
    zusammenfassung, warnungen, plan, weiterePlan: planAlle.length - plan.length,
  };

  if (!anzahl && !planAlle.length) return { ...basis, art: "leer" };
  if (anzahl <= NEU_LISTE_MAX) return { ...basis, art: "liste", hausaufgaben, inhalte };

  const je = new Map();
  for (const e of [...hausaufgaben, ...inhalte]) {
    const k = je.get(e.kurs) || { kurs: e.kurs, name: e.name, neu: 0, geaendert: 0 };
    if (e.marke === "geändert") k.geaendert++; else k.neu++;
    je.set(e.kurs, k);
  }
  const kurse = [...je.values()].sort((a, b) => (b.neu + b.geaendert) - (a.neu + a.geaendert) || a.name.localeCompare(b.name, "de"));
  // „und 1 weiterer Kurs“ lohnt nicht, dann lieber die Zeile selbst.
  const zeigen = kurse.length > KOMPAKT_KURSE + 1 ? kurse.slice(0, KOMPAKT_KURSE) : kurse;
  const rest = kurse.slice(zeigen.length);
  const summe = rest.reduce((s, k) => ({ neu: s.neu + k.neu, geaendert: s.geaendert + k.geaendert }), { neu: 0, geaendert: 0 });
  return {
    ...basis, art: "kompakt",
    hausaufgaben: hausaufgaben.slice(0, NEU_LISTE_MAX),
    weitereHausaufgaben: Math.max(0, hausaufgaben.length - NEU_LISTE_MAX),
    kurse: zeigen.map((k) => ({ kurs: k.kurs, name: k.name, text: zaehlText(k) })),
    rest: rest.length ? { anzahl: rest.length, text: zaehlText(summe) } : null,
  };
}

/** Marke am Eintrag im Archiv bis zum nächsten Abruf: "neu", "geändert" oder null. */
export function eintragMarke(bericht, id) {
  if (!bericht || bericht.erst) return null;
  if (bericht.neu.includes(id) || bericht.hausaufgabeNeu.includes(id)) return "neu";
  if (bericht.geaendert.includes(id)) return "geändert";
  return null;
}

/** Für die Kursliste: je Kurs Text wie "2 neu · 1 geändert" → Map kurs → Text; Kurse ohne fehlen. */
export function neuJeKurs(bericht, eintraege) {
  const zaehler = new Map();
  if (!bericht || bericht.erst) return zaehler;
  for (const e of eintraege) {
    const marke = eintragMarke(bericht, e.id);
    if (!marke) continue;
    const z = zaehler.get(e.kurs) || { neu: 0, geaendert: 0 };
    if (marke === "neu") z.neu++; else z.geaendert++;
    zaehler.set(e.kurs, z);
  }
  return new Map([...zaehler].map(([kurs, z]) => [kurs, zaehlText(z)]));
}
