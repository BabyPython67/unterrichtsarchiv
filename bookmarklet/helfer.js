// Reine Helfer des Bookmarklets. tools/build.mjs fügt diese Datei (ohne "export") vor src.js
// ein; die Tests importieren sie direkt. Kein DOM, kein fetch, keine Seiteneffekte.

/**
 * Sucht rekursiv nach associatedStudent-Objekten mit numerischer id. Liefert alle
 * verschiedenen Treffer, damit ein Elternaccount mit zwei Kindern erkannt wird. Der Name
 * dient nur der Auswahl im Prompt und wird nirgends gespeichert.
 */
export function findeAssociatedStudents(obj, gefunden = [], gesehen = new Set()) {
  if (!obj || typeof obj !== "object" || gesehen.has(obj)) return gefunden;
  gesehen.add(obj);
  const merken = (s) => {
    if (s && typeof s === "object" && typeof s.id === "number" && !gefunden.some((x) => x.id === s.id)) {
      const name = [s.firstname, s.lastname].filter((x) => typeof x === "string").join(" ").trim();
      gefunden.push({ id: s.id, name });
    }
  };
  if (!Array.isArray(obj)) {
    merken(obj.associatedStudent);
    if (Array.isArray(obj.associatedStudents)) obj.associatedStudents.forEach(merken);
  }
  for (const wert of Array.isArray(obj) ? obj : Object.values(obj)) findeAssociatedStudents(wert, gefunden, gesehen);
  return gefunden;
}

const BUNDLE_RE = /bundleVersion["']?\s*[:=]\s*["']([0-9a-f]{6,20})["']/i;

/** Erste bundleVersion, die in einem der Texte (Seitenquelltext, Skripte, Storage) steht. */
export function findeBundleVersion(texte) {
  for (const t of texte) {
    if (typeof t !== "string") continue;
    const m = BUNDLE_RE.exec(t);
    if (m) return m[1];
  }
  return null;
}

const JWT_RE = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;

export function siehtNachJwtAus(s) {
  return typeof s === "string" && s.length > 60 && JWT_RE.test(s.trim());
}

function jwtInObjekt(obj, tiefe = 3) {
  if (!obj || typeof obj !== "object" || tiefe < 0) return null;
  for (const [k, v] of Object.entries(obj)) {
    if (/^(jwt|token|accesstoken|access_token|id_token)$/i.test(k) && siehtNachJwtAus(v)) return v.trim();
  }
  for (const v of Object.values(obj)) {
    if (siehtNachJwtAus(v)) return v.trim();
    const t = jwtInObjekt(v, tiefe - 1);
    if (t) return t;
  }
  return null;
}

/** Storage-Werte, die als JSON-String abgelegt sind (mit Anführungszeichen), auspacken; sonst nur trimmen. */
function stringEntpacken(wert) {
  if (typeof wert !== "string") return wert;
  const w = wert.trim();
  if (w.length > 1 && w.startsWith('"') && w.endsWith('"')) {
    try { const p = JSON.parse(w); if (typeof p === "string") return p.trim(); } catch (e) { /* kein JSON */ }
  }
  return w;
}

/**
 * Sucht in Storage-Einträgen [[schlüssel, wert], ...] nach einem JWT, roh oder in JSON
 * verpackt. Schlüssel mit jwt/token/auth im Namen haben Vorrang. Null, wenn nichts da ist —
 * dann läuft die Sitzung vermutlich über Cookies, die der Browser ohnehin mitschickt.
 */
export function findeJwt(eintraege) {
  const kandidaten = [];
  for (const [k, v] of eintraege) {
    const wert = stringEntpacken(v);
    if (typeof wert !== "string") continue;
    if (siehtNachJwtAus(wert)) {
      kandidaten.push({ k: String(k), token: wert });
    } else if (wert.startsWith("{") || wert.startsWith("[")) {
      try {
        const t = jwtInObjekt(JSON.parse(wert));
        if (t) kandidaten.push({ k: String(k), token: t });
      } catch (e) { /* kein JSON */ }
    }
  }
  const prio = (k) => (/jwt|token|auth/i.test(k) ? 0 : 1);
  kandidaten.sort((a, b) => prio(a.k) - prio(b.k));
  return kandidaten.length ? kandidaten[0].token : null;
}

/** unterricht-JJJJ-MM-TT.json in Ortszeit. */
export function dateinameFuerDatum(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `unterricht-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

/** Teilanfragen mit Status ungleich 200 als Texte, z. B. "get-topics: Status 404". */
export function pruefeAntwortStatus(roh, endpoints) {
  const results = roh && Array.isArray(roh.results) ? roh.results : [];
  const meldungen = [];
  results.forEach((r, i) => {
    const status = r && typeof r === "object" ? r.status : undefined;
    if (status !== undefined && status !== 200) meldungen.push(`${endpoints[i] || "Teilanfrage " + (i + 1)}: Status ${status}`);
  });
  return meldungen;
}

/** Zahl der Datensätze über alle Teilantworten, nur zur Anzeige. */
export function zaehleDatensaetze(roh) {
  const results = roh && Array.isArray(roh.results) ? roh.results : [];
  return results.reduce((s, r) => s + (r && Array.isArray(r.data) ? r.data.length : 0), 0);
}

/** Datensätze je Teilantwort als Text, z. B. "get-topics 27, get-homework 4, get-actual-lessons 34". */
export function datensaetzeJeTeil(roh, endpoints) {
  const results = roh && Array.isArray(roh.results) ? roh.results : [];
  return results.map((r, i) => (endpoints[i] || "Teilanfrage " + (i + 1)) + " " + (r && Array.isArray(r.data) ? r.data.length : 0)).join(", ");
}

// Stundenplan: Modul und Endpunkt wie in kern/stundenplan.js (hier doppelt, weil diese Datei
// ohne Imports ins Lesezeichen wandert; tests/bookmarklet.test.js prüft, dass beide gleich sind).
const STUNDENPLAN_ENDPOINT = "get-actual-lessons";
const STUNDENPLAN_MODUL = "schedules";

/** Zeitraum für den Stundenplan: Montag der laufenden Woche bis Sonntag der Folgewoche, Ortszeit. */
export function stundenplanFenster(jetzt) {
  const p = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  const montag = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() - ((jetzt.getDay() + 6) % 7));
  const sonntag = new Date(montag.getFullYear(), montag.getMonth(), montag.getDate() + 13);
  return { von: iso(montag), bis: iso(sonntag) };
}

/** Die Teilanfragen für /api/calls in der Reihenfolge von endpoints; Klassenbuch braucht nur die Schüler-ID, der Stundenplan zusätzlich das Fenster. */
export function anfragenBauen(endpoints, studentId, fenster) {
  return endpoints.map((e) => {
    const plan = e === STUNDENPLAN_ENDPOINT;
    const parameters = { student: { id: studentId } };
    if (plan) { parameters.start = fenster.von; parameters.end = fenster.bis; }
    return { moduleName: plan ? STUNDENPLAN_MODUL : "classbook", endpointName: e, parameters: parameters };
  });
}

/** Nutzlast (mittlerer Teil) eines JWT als Objekt, sonst null. Kein Signaturcheck, nur lesen. */
export function jwtNutzlast(token) {
  if (!siehtNachJwtAus(token)) return null;
  try {
    const b64 = token.trim().split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    return obj && typeof obj === "object" ? obj : null;
  } catch (e) {
    return null;
  }
}

/**
 * Schüler-Zuordnung direkt aus den Sitzungsdaten im Browser (Storage-Einträge als JSON oder
 * JWT-Nutzlast), ohne eigenen Request. Liefert dieselbe Form wie findeAssociatedStudents.
 */
export function schuelerAusSpeicher(eintraege) {
  const objekte = [];
  for (const [, v] of eintraege) {
    const wert = stringEntpacken(v);
    if (typeof wert !== "string") continue;
    if (siehtNachJwtAus(wert)) {
      const n = jwtNutzlast(wert);
      if (n) objekte.push(n);
    } else if (wert.startsWith("{") || wert.startsWith("[")) {
      try { objekte.push(JSON.parse(wert)); } catch (e) { /* kein JSON */ }
    }
  }
  const jwt = findeJwt(eintraege);
  if (jwt) { const n = jwtNutzlast(jwt); if (n) objekte.push(n); }
  return findeAssociatedStudents(objekte);
}

/**
 * API-Pfade, die die Seite selbst schon aufgerufen hat (aus den Resource-Timing-Namen), nur
 * eigene Origin, ohne Query, Zahlenfolgen ab 5 Stellen maskiert. Dient allein der Diagnose,
 * damit der richtige Pfad für login-status nicht geraten werden muss.
 */
export function apiPfade(namen, origin) {
  const pfade = new Set();
  for (const n of namen) {
    if (typeof n !== "string" || !n.startsWith(origin + "/")) continue;
    let p;
    try { p = new URL(n).pathname; } catch (e) { continue; }
    if (!/\/api\//.test(p)) continue;
    pfade.add(p.replace(/\d{5,}/g, "#"));
  }
  return [...pfade].sort();
}

/**
 * Feldnamen eines Objekts als Pfade mit Typ (z. B. "user.associatedStudent.id:number"), in
 * Tiefe und Anzahl begrenzt, NIE Werte. Zahlenschlüssel werden zu "#". Nur für die Diagnose.
 */
export function feldnamen(obj, tiefe = 2, max = 40) {
  const aus = [];
  const typVon = (v) => (v === null ? "null" : Array.isArray(v) ? "[" + v.length + "]" : typeof v === "object" ? "{}" : typeof v);
  const gehe = (o, praefix, t) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { gehe(o[0], praefix + "[]", t); return; }
    for (const [k, v] of Object.entries(o)) {
      if (aus.length >= max) return;
      const name = praefix + (praefix ? "." : "") + (/^\d+$/.test(k) ? "#" : k);
      aus.push(name + ":" + typVon(v));
      if (t > 0) gehe(v, name, t - 1);
    }
  };
  gehe(obj, "", tiefe);
  return aus;
}

/**
 * Je Storage-Eintrag, der JSON oder ein JWT ist, die Feldnamen: "user: id:number, …".
 * Keine Werte, damit die Diagnose gefahrlos weitergegeben werden kann.
 */
export function sitzungsFelder(eintraege) {
  const zeilen = [];
  for (const [k, v] of eintraege) {
    const wert = stringEntpacken(v);
    if (typeof wert !== "string") continue;
    let obj = null;
    let art = "";
    if (siehtNachJwtAus(wert)) { obj = jwtNutzlast(wert); art = " (Token-Nutzlast)"; }
    else if (wert.startsWith("{") || wert.startsWith("[")) { try { obj = JSON.parse(wert); } catch (e) { obj = null; } }
    if (obj && typeof obj === "object") zeilen.push(String(k) + art + ": " + (feldnamen(obj).join(", ") || "leer"));
  }
  return zeilen;
}
