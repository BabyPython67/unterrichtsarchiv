// Die eine Pipeline für alles, was hereinkommt — egal ob per postMessage oder aus einer Datei.
// Erkennt Export-Dateien (Wiederherstellung) und Rohantworten (Hülle oder nackte API-Antwort).
// Reine Funktion: liefert einen neuen Bestand, verändert den alten nicht.

import { entpacken, istRohdatenHuelle, pruefeTeilantworten, zeilenAusRohantwort } from "./rohantwort.js";
import { mergen } from "./mergen.js";
import { istExportDatei, pruefeBestand } from "./speicher.js";

const SYNC_QUELLEN = ["bookmarklet", "script-ios", "script-android", "userscript"];

/** Einstellungen aus einer Export-Datei ergänzen, ohne Lokales zu überschreiben. */
function einstellungenMergen(lokal, fremd) {
  const overrides = { ...fremd.wochenplan.overrides };
  for (const [tag, kurse] of Object.entries(lokal.wochenplan.overrides)) {
    overrides[tag] = { ...(overrides[tag] || {}), ...kurse };
  }
  return {
    ...fremd,
    ...lokal,
    wochenplan: { ...lokal.wochenplan, overrides },
    freieTage: [...new Set([...fremd.freieTage, ...lokal.freieTage])].sort(),
  };
}

/**
 * @param bestand  aktueller Bestand
 * @param objekt   geparstes JSON (Export-Datei, Rohdaten-Hülle oder API-Antwort)
 * @param heute    "YYYY-MM-DD" für ersterfasst/geaendert
 * @param jetzt    ISO-Zeitstempel für letzterAbruf, falls die Hülle keinen mitbringt
 */
export function importieren(bestand, objekt, heute, jetzt) {
  if (istExportDatei(objekt)) {
    const fremd = pruefeBestand(objekt);
    const ergebnis = mergen(bestand.eintraege, fremd.eintraege, heute);
    const letzterAbruf = [bestand.letzterAbruf, fremd.letzterAbruf].filter(Boolean).sort().pop() || null;
    return {
      art: "export",
      bestand: {
        ...bestand,
        kursAlias: { ...fremd.kursAlias, ...bestand.kursAlias },          // lokal gewinnt
        klausurschnitt: { ...fremd.klausurschnitt, ...bestand.klausurschnitt },
        kurszuordnung: { ...fremd.kurszuordnung, ...bestand.kurszuordnung },
        einstellungen: einstellungenMergen(bestand.einstellungen, fremd.einstellungen),
        letzterAbruf,
        eintraege: ergebnis.eintraege,
      },
      ergebnis, berichte: [], warnungen: [],
    };
  }

  const roh = entpacken(objekt);
  const huelle = istRohdatenHuelle(objekt);
  const endpoints = huelle && Array.isArray(objekt.endpoints) ? objekt.endpoints : [];
  const warnungen = pruefeTeilantworten(roh, endpoints);
  const { zeilen, berichte } = zeilenAusRohantwort(roh);
  if (!zeilen.length) {
    const grund = warnungen.length ? " " + warnungen.map((w) => w.text).join(" ") : "";
    throw new Error("Keine Unterrichtsdaten in der Antwort erkannt." + grund);
  }
  const ergebnis = mergen(bestand.eintraege, zeilen, heute);
  const abgerufen = huelle && typeof objekt.abgerufen === "string" ? objekt.abgerufen : jetzt;
  const quelle = huelle && SYNC_QUELLEN.includes(objekt.quelle) ? objekt.quelle : "bookmarklet";
  return {
    art: "rohdaten",
    bestand: {
      ...bestand,
      letzterAbruf: abgerufen,
      eintraege: ergebnis.eintraege,
      sync: { ...bestand.sync, letzterLauf: abgerufen, letzterErfolg: abgerufen, letzterFehler: null, quelle },
    },
    ergebnis, berichte, warnungen,
  };
}
