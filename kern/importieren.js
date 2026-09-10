// Die eine Pipeline für alles, was hereinkommt — egal ob per postMessage oder aus einer Datei.
// Erkennt Export-Dateien (Wiederherstellung) und Rohantworten (Hülle oder nackte API-Antwort).
// Reine Funktion: liefert einen neuen Bestand, verändert den alten nicht.

import { entpacken, istRohdatenHuelle, pruefeTeilantworten, zeilenAusRohantwort } from "./rohantwort.js";
import { mergen } from "./mergen.js";
import { istExportDatei, pruefeBestand } from "./speicher.js";

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
        letzterAbruf,
        eintraege: ergebnis.eintraege,
      },
      ergebnis, berichte: [], warnungen: [],
    };
  }

  const roh = entpacken(objekt);
  const endpoints = istRohdatenHuelle(objekt) && Array.isArray(objekt.endpoints) ? objekt.endpoints : [];
  const warnungen = pruefeTeilantworten(roh, endpoints);
  const { zeilen, berichte } = zeilenAusRohantwort(roh);
  if (!zeilen.length) {
    const grund = warnungen.length ? " " + warnungen.map((w) => w.text).join(" ") : "";
    throw new Error("Keine Unterrichtsdaten in der Antwort erkannt." + grund);
  }
  const ergebnis = mergen(bestand.eintraege, zeilen, heute);
  const abgerufen = istRohdatenHuelle(objekt) && typeof objekt.abgerufen === "string" ? objekt.abgerufen : jetzt;
  return {
    art: "rohdaten",
    bestand: { ...bestand, letzterAbruf: abgerufen, eintraege: ergebnis.eintraege },
    ergebnis, berichte, warnungen,
  };
}
