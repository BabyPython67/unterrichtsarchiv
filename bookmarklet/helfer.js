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

/**
 * Sucht in Storage-Einträgen [[schlüssel, wert], ...] nach einem JWT, roh oder in JSON
 * verpackt. Schlüssel mit jwt/token/auth im Namen haben Vorrang. Null, wenn nichts da ist —
 * dann läuft die Sitzung vermutlich über Cookies, die der Browser ohnehin mitschickt.
 */
export function findeJwt(eintraege) {
  const kandidaten = [];
  for (const [k, v] of eintraege) {
    if (typeof v !== "string") continue;
    const wert = v.trim();
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
