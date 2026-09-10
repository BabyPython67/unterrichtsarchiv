// Umgang mit einer rohen API-Antwort (oder der Hülle, in der das Bookmarklet sie liefert).
// Entspricht pruefe_teilantworten() und zeilen_aus_json() im Prototyp.

import { alleStundenlisten, mappingBauen } from "./erkennen.js";
import { normalisieren, zusammenfuehren } from "./normalisieren.js";

export const HUELLE_TYP = "unterrichtsarchiv:rohdaten";

/** Hülle des Bookmarklets: { typ, version, abgerufen, endpoints, roh } */
export function istRohdatenHuelle(obj) {
  return !!obj && typeof obj === "object" && obj.typ === HUELLE_TYP && "roh" in obj;
}

export function entpacken(obj) {
  return istRohdatenHuelle(obj) ? obj.roh : obj;
}

/** Teilanfragen, die der Server nicht mit 200 beantwortet hat (endpointName vermutlich falsch). */
export function pruefeTeilantworten(antwort, endpoints = []) {
  const ergebnisse = antwort && typeof antwort === "object" ? antwort.results : null;
  if (!Array.isArray(ergebnisse)) return [];
  const warnungen = [];
  ergebnisse.forEach((e, i) => {
    const status = e && typeof e === "object" ? e.status : undefined;
    if (status !== undefined && status !== null && status !== 200) {
      const name = endpoints[i] ? ` (${endpoints[i]})` : "";
      warnungen.push({
        index: i, status, endpoint: endpoints[i] || null,
        text: `Teilanfrage ${i + 1}${name} kam mit Status ${status} zurück. Wahrscheinlich stimmt dort der endpointName nicht.`,
      });
    }
  });
  return warnungen;
}

/** Alle erkannten Listen einer Antwort in fertige, zusammengeführte Zeilen umwandeln. */
export function zeilenAusRohantwort(roh, override = {}) {
  const gruppen = [];
  const berichte = [];
  for (const { pfad, liste } of alleStundenlisten(roh)) {
    const mapping = mappingBauen(liste, override);
    const zeilen = normalisieren(liste, mapping);
    if (!zeilen.length) continue;
    const art = mapping.hausaufgabe && !mapping.thema ? "Hausaufgaben" : "Inhalte";
    gruppen.push(zeilen);
    berichte.push({ pfad, anzahl: zeilen.length, art, text: `${pfad}: ${zeilen.length} Einträge (${art})` });
  }
  return { zeilen: zusammenfuehren(gruppen), berichte };
}
