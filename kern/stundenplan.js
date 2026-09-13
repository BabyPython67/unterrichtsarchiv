// Stundenplan aus der Antwort von schedules/get-actual-lessons in das Cache-Format bringen.
// Reine Funktionen, kein DOM. Gemessen am 2026-09-12 (referenz/antwort-stundenplan.json):
//
//   { date: "2026-09-14", classHour: { id, number: "4" },
//     type: "regularLesson" | "cancelledLesson" | "specialLesson" | "changedLesson",
//     actualLesson:     { room: { name }, subject: { abbreviation, name | null }, subjectLabel, teachers, classes, studentGroups, … },
//     originalLessons: [ …wie actualLesson… ],        // bei Entfall statt actualLesson
//     isCancelled, isSubstitution, isNew, comment }
//
// Übernommen werden nur Stunde, Fach, Raum und Status. Lehrkräfte, IDs, Klassen, Gruppen
// und Kommentare werden verworfen (Regel: keine Namen, nichts Fremdes im Cache). Als Fach
// gilt subject.name, weil das Klassenbuch (get-topics) denselben Namen liefert und die
// Zuordnung zum Archiv-Kurs dann von selbst passt; fehlt der Name, das Kurskürzel (subjectLabel).
//
// Schulmanager liefert Sondertermine anderer Lerngruppen derselben Klasse mit, z. B. die Klausur
// eines Parallelkurses (type specialLesson, comment „Examen", im Schulmanager grün). Die fallen
// weg. Die Gruppen-IDs dienen nur diesem Vergleich und landen nicht im Cache.

export const STUNDENPLAN_MODUL = "schedules";
export const STUNDENPLAN_ENDPOINT = "get-actual-lessons";

const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;

const istObjekt = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

function lektionsDaten(l) {
  if (istObjekt(l.actualLesson)) return l.actualLesson;
  if (Array.isArray(l.originalLessons) && istObjekt(l.originalLessons[0])) return l.originalLessons[0];
  return null;
}

export function istLektion(x) {
  return istObjekt(x) && typeof x.date === "string" && DATUM_RE.test(x.date) && istObjekt(x.classHour) && !!lektionsDaten(x);
}

/** Liste aus lauter Lektionen (leere Liste zählt, weil eine Ferienwoche leer zurückkommt). */
export function istStundenplanListe(liste) {
  return Array.isArray(liste) && liste.every(istLektion);
}

export function fachName(lektion) {
  const d = lektionsDaten(lektion);
  if (!d) return null;
  const s = istObjekt(d.subject) ? d.subject : {};
  for (const k of [s.name, d.subjectLabel, s.abbreviation]) {
    if (typeof k === "string" && k.trim()) return k.trim();
  }
  return null;
}

function status(l) {
  if (l.type === "cancelledLesson" || l.isCancelled === true) return "entfall";
  if (l.isSubstitution === true) return "vertretung";
  return "normal";
}

function stunde(l) {
  const n = parseInt(l.classHour.number, 10);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function gruppenIds(d) {
  return (Array.isArray(d.studentGroups) ? d.studentGroups : [])
    .map((g) => (istObjekt(g) ? g.id : null))
    .filter((id) => id !== null && id !== undefined);
}

// Eigene Lerngruppen: aus allen Stunden außer Sonderterminen, entfallende eingeschlossen.
function eigeneGruppen(lektionen) {
  const ids = new Set();
  for (const l of lektionen) {
    if (!istLektion(l) || l.type === "specialLesson") continue;
    for (const id of gruppenIds(lektionsDaten(l))) ids.add(id);
  }
  return ids;
}

// Sondertermin, dessen Gruppen alle nicht zum eigenen Plan gehören. Ein Termin der eigenen
// Gruppe (etwa die eigene Klausur) bleibt, ebenso einer ohne Gruppe. Gibt es keine eigenen
// Gruppen zum Vergleich, bleibt alles stehen.
function fremderSondertermin(l, eigene) {
  if (l.type !== "specialLesson" || !eigene.size) return false;
  const ids = gruppenIds(lektionsDaten(l));
  return ids.length > 0 && !ids.some((id) => eigene.has(id));
}

/**
 * @param lektionen   results[i].data der Teilantwort
 * @param fenster     { von, bis } wie angefragt; fehlt es, gilt der Bereich der gelieferten Daten
 * @param abgerufenAm ISO-Zeitstempel des Abrufs
 * → Lieferung für stundenplanUebernehmen: { von, bis, tage, abgerufenAm, anzahl } — oder null,
 *   wenn nichts geliefert wurde. Dann bleibt der Cache unangetastet: eine leere Antwort kann
 *   auch heißen, dass die Anfrage nicht stimmt, und soll nicht zwei Wochen leer fegen.
 */
export function stundenplanAusLektionen(lektionen, fenster, abgerufenAm) {
  const tage = {};
  let anzahl = 0;
  const liste = Array.isArray(lektionen) ? lektionen : [];
  const eigene = eigeneGruppen(liste);
  for (const l of liste) {
    if (!istLektion(l) || fremderSondertermin(l, eigene)) continue;
    const fach = fachName(l);
    if (!fach) continue;
    const d = lektionsDaten(l);
    const raum = istObjekt(d.room) && typeof d.room.name === "string" ? d.room.name : "";
    (tage[l.date] = tage[l.date] || []).push({ stunde: stunde(l), fach, raum, status: status(l) });
    anzahl++;
  }
  if (!anzahl) return null;
  const daten = Object.keys(tage).sort();
  const sortiert = {};
  for (const d of daten) {
    sortiert[d] = tage[d].sort((a, b) => a.stunde - b.stunde || a.fach.localeCompare(b.fach, "de"));
  }
  const f = fenster && typeof fenster === "object" ? fenster : {};
  const von = DATUM_RE.test(f.von || "") ? f.von : daten[0];
  const bis = DATUM_RE.test(f.bis || "") && f.bis >= von ? f.bis : daten[daten.length - 1];
  return { von, bis, tage: sortiert, abgerufenAm: abgerufenAm || null, anzahl };
}
