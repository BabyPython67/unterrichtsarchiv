// Feld-Autoerkennung: findet in einer beliebigen JSON-Antwort die Liste(n) mit Unterrichtsdaten
// und ordnet den Zielfeldern (kurs, datum, thema, hausaufgabe) die passenden Rohschlüssel zu.
// Übernommen aus dem Python-Prototyp smsync.py (flach, listen_finden, ist_huelle,
// alle_stundenlisten, _treffer, mapping_bauen, wert). Reine Funktionen, kein DOM.

export const DATUM_RE = /^\d{4}-\d{2}-\d{2}/;

// Reihenfolge = Priorität. Verglichen wird gegen die flach gemachten Schlüssel
// (z. B. "subject.name"), erst exakt, dann als Endung, dann als Teilstring.
// Lehrkraft und Stundennummer sind bewusst nicht dabei (Nicht-Ziele bzw. nicht im Datenmodell).
export const FELD_KANDIDATEN = {
  kurs: ["subject.name", "studentgroup.name", "course.name", "class.name",
         "subjectname", "subject.abbreviation", "kurs", "fach", "subject", "course"],
  datum: ["date", "datum", "classhour.date", "day", "start"],
  thema: ["subjectcontent", "lessoncontent", "lessontopic", "content", "topic",
          "thema", "inhalt", "unterrichtsinhalt", "comment", "text", "description"],
  hausaufgabe: ["homework", "hausaufgabe", "homeworktext"],
};

function istObjekt(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function istPrimitiv(x) {
  return x === null || typeof x === "string" || typeof x === "number" || typeof x === "boolean";
}

/** Macht ein verschachteltes Objekt flach: {subject:{name:"Mathe"}} -> {"subject.name":"Mathe"}. */
export function flach(obj, prefix = "", tiefe = 3) {
  const out = {};
  if (tiefe < 0 || !istObjekt(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const pfad = prefix + k;
    if (istPrimitiv(v)) {
      out[pfad] = v;
    } else if (istObjekt(v)) {
      Object.assign(out, flach(v, pfad + ".", tiefe - 1));
    } else if (Array.isArray(v) && v.length && v.every((x) => typeof x === "string")) {
      out[pfad] = v.join(", ");
    } else if (Array.isArray(v) && v.length && istObjekt(v[0])) {
      // z. B. teachers: [{lastName: ...}] -> erstes Element mitnehmen
      Object.assign(out, flach(v[0], pfad + ".", tiefe - 1));
    }
  }
  return out;
}

export function siehtNachDatumAus(wert) {
  return typeof wert === "string" && DATUM_RE.test(wert);
}

/** Liefert alle {pfad, liste} im JSON-Baum, deren Liste nur aus Objekten besteht. */
export function* listenFinden(obj, pfad = "$") {
  if (Array.isArray(obj)) {
    if (obj.length && obj.every(istObjekt)) yield { pfad, liste: obj };
    for (let i = 0; i < obj.length; i++) yield* listenFinden(obj[i], `${pfad}[${i}]`);
  } else if (istObjekt(obj)) {
    for (const [k, v] of Object.entries(obj)) yield* listenFinden(v, `${pfad}.${k}`);
  }
}

/** True, wenn die Liste nur Container um die eigentlichen Daten ist (z. B. "results"). */
export function istHuelle(liste) {
  for (const eintrag of liste.slice(0, 5)) {
    if (!istObjekt(eintrag)) continue;
    for (const v of Object.values(eintrag)) {
      if (Array.isArray(v) && v.length && istObjekt(v[0])) return true;
    }
  }
  return false;
}

/** Findet den passendsten Schlüssel zu einem Muster: exakt > Endung > Teilstring. */
export function treffer(schluessel, muster) {
  muster = muster.toLowerCase();
  const sortiert = [...schluessel].sort();
  for (const k of sortiert) if (k === muster) return k;
  for (const k of sortiert) if (k.endsWith("." + muster) || k.endsWith(muster)) return k;
  for (const k of sortiert) if (k.includes(muster)) return k;
  return null;
}

/** Alle Listen im JSON, die nach Unterrichtsdaten aussehen, beste zuerst. */
export function alleStundenlisten(daten) {
  const gefunden = [];
  for (const { pfad, liste } of listenFinden(daten)) {
    if (istHuelle(liste)) continue;
    const probe = liste.slice(0, 40).map((x) => flach(x));
    if (!probe.length) continue;
    const mitDatum = probe.filter((pr) => Object.values(pr).some(siehtNachDatumAus)).length;
    const anteil = mitDatum / probe.length;
    if (anteil < 0.5) continue;
    const schluessel = new Set(probe.flatMap((pr) => Object.keys(pr).map((k) => k.toLowerCase())));
    let bonus = 0;
    for (const gruppe of ["kurs", "thema", "hausaufgabe"]) {
      if (FELD_KANDIDATEN[gruppe].some((m) => treffer(schluessel, m))) bonus += 0.5;
    }
    gefunden.push({ score: anteil + bonus + Math.min(liste.length, 500) / 1000, pfad, liste });
  }
  gefunden.sort((a, b) => b.score - a.score);
  return gefunden.map(({ pfad, liste }) => ({ pfad, liste }));
}

export function stundenlisteFinden(daten) {
  const alle = alleStundenlisten(daten);
  return alle.length ? alle[0] : null;
}

/** Ordnet jedem Zielfeld einen Schlüssel aus den Rohdaten zu (null = nicht gefunden). */
export function mappingBauen(records, override = {}) {
  const flache = records.map((r) => flach(r));
  const gefuellt = new Map();
  for (const f of flache) {
    for (const [k, v] of Object.entries(f)) {
      if (v === null || v === "") continue;
      const kl = k.toLowerCase();
      gefuellt.set(kl, (gefuellt.get(kl) || 0) + 1);
    }
  }
  const schluessel = new Set([
    ...gefuellt.keys(),
    ...flache.flatMap((f) => Object.keys(f).map((k) => k.toLowerCase())),
  ]);
  const mapping = {};
  for (const [feld, musterListe] of Object.entries(FELD_KANDIDATEN)) {
    if (feld in override) { mapping[feld] = override[feld]; continue; }
    let gewaehlt = null;
    for (const muster of musterListe) {
      const kandidat = treffer(schluessel, muster);
      if (kandidat && (gefuellt.get(kandidat) || 0) > 0) { gewaehlt = kandidat; break; }
    }
    mapping[feld] = gewaehlt;
  }
  return mapping;
}

/** Wert eines flachen Datensatzes, Schlüssel ohne Groß/Klein; null/false -> "". */
export function wert(flacherRecord, schluessel) {
  if (!schluessel) return "";
  const gesucht = schluessel.toLowerCase();
  for (const [k, v] of Object.entries(flacherRecord)) {
    if (k.toLowerCase() === gesucht) {
      if (v === null || v === undefined || v === false) return "";
      return String(v).trim();
    }
  }
  return "";
}
