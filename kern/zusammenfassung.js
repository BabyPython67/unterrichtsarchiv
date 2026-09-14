// Kurze Zustandszeilen für die Einstellungen: je Thema eine Zeile, die sagt, wie es gerade
// steht („10 Kurse · 3 mit Klausurdatum“). Reine Funktionen, kein DOM. Die Übersicht zeigt
// nur diese Zeilen, Details und Erklärungen stehen auf den Unterseiten.

import { kurseZaehlen } from "./filtern.js";
import { mitStandard } from "./logik.js";

const mehrzahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;

const anzahlFrei = (einstellungen) => {
  const f = mitStandard(einstellungen).freieTage;
  return Array.isArray(f) ? f.length : 0;
};

/** „10 Kurse · 3 mit Klausurdatum“. Gezählt werden nur Kurse mit Einträgen. */
export function kurseZusammenfassung(bestand) {
  const kurse = Object.keys(kurseZaehlen(bestand.eintraege));
  if (!kurse.length) return "Noch keine Kurse";
  const mitDatum = kurse.filter((k) => bestand.klausurschnitt[k]).length;
  return `${mehrzahl(kurse.length, "Kurs", "Kurse")} · ${mitDatum} mit Klausurdatum`;
}

/** Wochenplan-Overrides über alle Tage: „2 fest, 1 aus“ oder „automatisch“. */
export function wochenplanZusammenfassung(einstellungen) {
  const overrides = mitStandard(einstellungen).wochenplan.overrides || {};
  let fest = 0;
  let aus = 0;
  for (const tag of Object.values(overrides)) {
    for (const wert of Object.values(tag || {})) {
      if (wert === "fix") fest++;
      else if (wert === "aus") aus++;
    }
  }
  const teile = [];
  if (fest) teile.push(`${fest} fest`);
  if (aus) teile.push(`${aus} aus`);
  return teile.length ? teile.join(", ") : "automatisch";
}

/** „1 freier Zeitraum“, „3 freie Zeiträume“ oder „keine“. */
export function freieTageZusammenfassung(einstellungen) {
  const n = anzahlFrei(einstellungen);
  return n ? mehrzahl(n, "freier Zeitraum", "freie Zeiträume") : "keine";
}

/** Übersichtszeile „Vorschau“: „Beginn 08:00 · Wochenplan 2 fest · 1 freier Zeitraum“. */
export function vorschauZusammenfassung(einstellungen) {
  const e = mitStandard(einstellungen);
  const teile = [`Beginn ${e.schulbeginn}`, `Wochenplan ${wochenplanZusammenfassung(e)}`];
  const frei = anzahlFrei(e);
  if (frei) teile.push(mehrzahl(frei, "freier Zeitraum", "freie Zeiträume"));
  return teile.join(" · ");
}

/** Fächer aus dem Stundenplan-Cache plus alle, die schon eine Zuordnung haben, alphabetisch. */
export function faecherImStundenplan(bestand) {
  return [...new Set([
    ...Object.values(bestand.stundenplan.tage).flat().map((s) => s.fach),
    ...Object.keys(bestand.kurszuordnung),
  ])].sort((a, b) => a.localeCompare(b, "de"));
}

/** „12 Fächer · 2 nicht zugeordnet“, „12 Fächer“ oder „Stundenplan nicht abgerufen“. „Nicht anzeigen“ zählt als zugeordnet. */
export function faecherZusammenfassung(bestand) {
  const faecher = faecherImStundenplan(bestand);
  if (!faecher.length) return "Stundenplan nicht abgerufen";
  const offen = faecher.filter((f) => !bestand.kurszuordnung[f]).length;
  const n = mehrzahl(faecher.length, "Fach", "Fächer");
  return offen ? `${n} · ${offen} nicht zugeordnet` : n;
}

const zweistellig = (n) => String(n).padStart(2, "0");

/**
 * Übersichtszeile „Abgleich“: „Aus“, „Ein“, „Ein · zuletzt heute 14:02“, mit „wartet auf
 * Verbindung“, oder „Letzter Abgleich fehlgeschlagen“. Uhrzeit in Ortszeit von jetzt.
 */
export function abgleichZusammenfassung(status, jetzt) {
  if (!status) return "Aus";
  if (status.fehler) return "Letzter Abgleich fehlgeschlagen";
  const wartet = status.ausstehend ? " · wartet auf Verbindung" : "";
  if (!status.letzter) return `Ein${wartet}`;
  const t = new Date(status.letzter);
  const tage = Math.round((new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate()) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5);
  const tag = tage === 0 ? "heute" : tage === 1 ? "gestern" : `am ${zweistellig(t.getDate())}.${zweistellig(t.getMonth() + 1)}.`;
  return `Ein · zuletzt ${tag} ${zweistellig(t.getHours())}:${zweistellig(t.getMinutes())}${wartet}`;
}

/** Übersichtszeile „Daten“: „27 Einträge“ oder „Noch keine Einträge“. */
export function datenZusammenfassung(bestand) {
  const n = bestand.eintraege.length;
  return n ? mehrzahl(n, "Eintrag", "Einträge") : "Noch keine Einträge";
}
