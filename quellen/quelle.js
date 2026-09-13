// Schnittstelle der Abrufschicht. Jede Quelle liefert geparste JSON-Objekte genau so, wie sie
// hereinkommen (Rohdaten-Hülle des Bookmarklets, nackte API-Antwort oder Export-Datei).
// Normalisierung, Merge, Speicherung und UI kennen die Quelle nicht — alles läuft durch
// kern/importieren.js.
//
// Abweichung zur Skizze im Dispatch (holen(): Promise<RohAntwort[]>): Quellen melden über
// Callbacks, weil Daten mehrfach eintreffen können (Bookmarklet ein zweites Mal geklickt,
// mehrere Dateien gewählt), ohne dass der Viewer neu geladen wird.
//
// interface Quelle {
//   name: string;
//   verfuegbar(): boolean;
//   starten({ onDaten(objekt, meta), onFehler(text) }): void;
// }
//
// Hülle, die das Bookmarklet sendet (kern/rohantwort.js kennt sie ebenfalls):
// {
//   typ: "unterrichtsarchiv:rohdaten",
//   version: 1,
//   abgerufen: "<ISO-Zeitstempel>",
//   endpoints: ["get-topics", "get-homework", "get-actual-lessons"],   // Reihenfolge wie in results[]
//   fenster: { von: "YYYY-MM-DD", bis: "YYYY-MM-DD" },                // angefragter Stundenplan-Zeitraum
//   roh: <Antwort von /api/calls, unverändert>
// }

export const SCHULMANAGER_ORIGIN = "https://login.schulmanager-online.de";
export const ENDPOINTS = ["get-topics", "get-homework", "get-actual-lessons"];

/** Nachrichtentypen zwischen Bookmarklet und Viewer. */
export const NACHRICHT = {
  bereit: "unterrichtsarchiv:bereit",       // Viewer -> Bookmarklet: ich höre zu
  rohdaten: "unterrichtsarchiv:rohdaten",   // Bookmarklet -> Viewer: hier sind die Daten
  fehler: "unterrichtsarchiv:fehler",       // Bookmarklet -> Viewer: Abruf fehlgeschlagen
  empfangen: "unterrichtsarchiv:empfangen", // Viewer -> Bookmarklet: verarbeitet, mit Zählern
};
