// Die eine Pipeline für alles, was hereinkommt — egal ob per postMessage oder aus einer Datei.
// Erkennt Export-Dateien (Wiederherstellung) und Rohantworten (Hülle oder nackte API-Antwort).
// Reine Funktion: liefert einen neuen Bestand, verändert den alten nicht.

import { entpacken, istRohdatenHuelle, pruefeTeilantworten, zeilenAusRohantwort } from "./rohantwort.js";
import { mergen } from "./mergen.js";
import { istExportDatei, pruefeBestand } from "./speicher.js";
import { STUNDENPLAN_ENDPOINT, istStundenplanListe, stundenplanAusLektionen } from "./stundenplan.js";
import { stundenplanUebernehmen, kurszuordnungErgaenzen } from "./logik.js";

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
 * Index der Stundenplan-Teilantwort in results[]: über endpoints[] der Hülle, sonst am Inhalt
 * erkannt (nackte Antwort, z. B. aus einer von Hand gespeicherten Datei). −1, wenn keine da ist.
 */
function stundenplanTeil(results, endpoints) {
  const i = endpoints.indexOf(STUNDENPLAN_ENDPOINT);
  if (i >= 0) return i < results.length ? i : -1;
  return results.findIndex((r) => r && typeof r === "object" && Array.isArray(r.data) && r.data.length > 0 && istStundenplanListe(r.data));
}

/**
 * @param bestand  aktueller Bestand
 * @param objekt   geparstes JSON (Export-Datei, Rohdaten-Hülle oder API-Antwort)
 * @param heute    "YYYY-MM-DD" für ersterfasst/geaendert
 * @param jetzt    ISO-Zeitstempel für letzterAbruf, falls die Hülle keinen mitbringt
 * → { art, bestand, ergebnis, berichte, warnungen, stundenplan: { von, bis, tage } | null }
 */
export function importieren(bestand, objekt, heute, jetzt) {
  if (istExportDatei(objekt)) {
    const fremd = pruefeBestand(objekt);
    const ergebnis = mergen(bestand.eintraege, fremd.eintraege, heute);
    const letzterAbruf = [bestand.letzterAbruf, fremd.letzterAbruf].filter(Boolean).sort().pop() || null;
    const kurszuordnung = { ...fremd.kurszuordnung, ...bestand.kurszuordnung };      // lokal gewinnt
    return {
      art: "export",
      bestand: {
        ...bestand,
        kursAlias: { ...fremd.kursAlias, ...bestand.kursAlias },
        klausurschnitt: { ...fremd.klausurschnitt, ...bestand.klausurschnitt },
        kurszuordnung: kurszuordnungErgaenzen(kurszuordnung, bestand.stundenplan, ergebnis.eintraege),
        einstellungen: einstellungenMergen(bestand.einstellungen, fremd.einstellungen),
        letzterAbruf,
        eintraege: ergebnis.eintraege,
      },
      ergebnis, berichte: [], warnungen: [], stundenplan: null,
    };
  }

  const roh = entpacken(objekt);
  const huelle = istRohdatenHuelle(objekt);
  const endpoints = huelle && Array.isArray(objekt.endpoints) ? objekt.endpoints : [];
  const abgerufen = huelle && typeof objekt.abgerufen === "string" ? objekt.abgerufen : jetzt;
  const warnungen = pruefeTeilantworten(roh, endpoints);

  // Stundenplan-Teilantwort abtrennen, BEVOR die Klassenbuch-Erkennung läuft: sie hält jede
  // Liste mit Datumsfeldern für Unterrichtsinhalte. Der Platz bleibt (null), damit die Pfade
  // in den Berichten ($.results[i]) stimmen.
  const results = roh && typeof roh === "object" && Array.isArray(roh.results) ? roh.results : null;
  const iPlan = results ? stundenplanTeil(results, endpoints) : -1;
  const teil = iPlan >= 0 ? results[iPlan] : null;
  const teilOk = !!teil && typeof teil === "object" && (teil.status === undefined || teil.status === 200);
  const fenster = huelle && objekt.fenster && typeof objekt.fenster === "object" ? objekt.fenster : null;
  const lieferung = teilOk ? stundenplanAusLektionen(teil.data, fenster, abgerufen) : null;
  const rohOhnePlan = iPlan >= 0 ? { ...roh, results: results.map((r, i) => (i === iPlan ? null : r)) } : roh;

  const { zeilen, berichte } = zeilenAusRohantwort(rohOhnePlan);
  if (!zeilen.length && !lieferung) {
    const grund = warnungen.length ? " " + warnungen.map((w) => w.text).join(" ") : "";
    throw new Error("Keine Unterrichtsdaten in der Antwort erkannt." + grund);
  }
  if (lieferung) {
    const tage = Object.keys(lieferung.tage).length;
    berichte.push({ pfad: `$.results[${iPlan}].data`, anzahl: lieferung.anzahl, art: "stundenplan", text: `Stundenplan ${lieferung.von} bis ${lieferung.bis}: ${tage} ${tage === 1 ? "Tag" : "Tage"}` });
  } else if (teilOk) {
    berichte.push({ pfad: `$.results[${iPlan}].data`, anzahl: 0, art: "stundenplan", text: "Stundenplan: nichts im Zeitraum, Cache bleibt wie er ist" });
  }

  const ergebnis = mergen(bestand.eintraege, zeilen, heute);
  const stundenplan = lieferung ? stundenplanUebernehmen(bestand.stundenplan, lieferung) : bestand.stundenplan;
  const kurszuordnung = kurszuordnungErgaenzen(bestand.kurszuordnung, stundenplan, ergebnis.eintraege);
  const quelle = huelle && SYNC_QUELLEN.includes(objekt.quelle) ? objekt.quelle : "bookmarklet";
  return {
    art: "rohdaten",
    bestand: {
      ...bestand,
      letzterAbruf: abgerufen,
      eintraege: ergebnis.eintraege,
      stundenplan,
      kurszuordnung,
      sync: { ...bestand.sync, letzterLauf: abgerufen, letzterErfolg: abgerufen, letzterFehler: null, quelle },
    },
    ergebnis, berichte, warnungen,
    stundenplan: lieferung ? { von: lieferung.von, bis: lieferung.bis, tage: Object.keys(lieferung.tage).length } : null,
  };
}
