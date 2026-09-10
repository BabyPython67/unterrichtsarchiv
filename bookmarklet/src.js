// Bookmarklet: läuft im eingeloggten Schulmanager-Tab. Holt Unterrichtsinhalte und
// Hausaufgaben mit EINEM Request (zwei Teilanfragen), übergibt sie per postMessage an den
// Viewer und lädt sie sonst als Datei herunter. Platzhalter __VIEWER_URL__ und
// __SCHULMANAGER_ORIGIN__ ersetzt tools/build.mjs; die Helfer aus helfer.js werden davor
// eingefügt. Regeln: kein Passwort, ein Abruf pro Klick, kein Retry, das Sitzungs-Token
// verlässt diesen Tab nie (es steht nicht in der Nutzlast).
// Hinweis für Änderungen: der Build entfernt Kommentarzeilen und führende Leerzeichen,
// deshalb jede Anweisung mit Semikolon abschließen und keine Zeile mit ( oder [ beginnen.

;(() => {
  const VIEWER_URL = "__VIEWER_URL__";
  const SCHULMANAGER_ORIGIN = "__SCHULMANAGER_ORIGIN__";
  const VIEWER_ORIGIN = new URL(VIEWER_URL).origin;
  const BUNDLE_FALLBACK = "a6ef588fd2";
  const ENDPOINTS = ["get-topics", "get-homework"];
  const TYP = { bereit: "unterrichtsarchiv:bereit", rohdaten: "unterrichtsarchiv:rohdaten", fehler: "unterrichtsarchiv:fehler", empfangen: "unterrichtsarchiv:empfangen" };
  const WARTE_AUF_VIEWER_MS = 15000;

  if (location.origin !== SCHULMANAGER_ORIGIN) {
    alert("Unterrichtsarchiv: Dieses Lesezeichen funktioniert nur auf " + SCHULMANAGER_ORIGIN.replace(/^https?:\/\//, "") + ". Bitte dort einloggen und es dann antippen.");
    return;
  }
  if (window.__unterrichtsarchivAktiv) {
    alert("Unterrichtsarchiv: Der Abruf läuft bereits.");
    return;
  }
  window.__unterrichtsarchivAktiv = true;

  // Statusbox im Tab: sichtbares Feedback, egal welcher Weg genommen wird.
  const box = document.createElement("div");
  box.setAttribute("style", "position:fixed;top:12px;right:12px;z-index:2147483647;width:min(380px,calc(100vw - 24px));background:#ffffff;color:#111111;border:1px solid #c9d1d9;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);font:14px/1.45 system-ui,-apple-system,sans-serif;padding:12px 14px;text-align:left;");
  const titel = document.createElement("div");
  titel.setAttribute("style", "font-weight:600;margin-bottom:6px;");
  titel.textContent = "Unterrichtsarchiv";
  const protokoll = document.createElement("div");
  protokoll.setAttribute("style", "white-space:pre-wrap;word-break:break-word;max-height:40vh;overflow:auto;");
  const leiste = document.createElement("div");
  leiste.setAttribute("style", "display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;");
  const knopf = (text, fn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.setAttribute("style", "font:inherit;padding:6px 10px;border:1px solid #c9d1d9;border-radius:8px;background:#f6f8fa;color:#111111;cursor:pointer;");
    b.addEventListener("click", fn);
    return b;
  };
  const zeilen = [];
  const log = (text) => { zeilen.push(text); protokoll.textContent = zeilen.join("\n"); };
  const kopieren = knopf("Meldung kopieren", () => {
    const t = "Unterrichtsarchiv-Bookmarklet " + new Date().toISOString() + "\n" + zeilen.join("\n");
    const p = navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject(new Error("kein Clipboard"));
    p.then(() => log("(kopiert)"), () => window.prompt("Zum Kopieren markieren:", t));
  });
  kopieren.hidden = true;
  leiste.append(kopieren, knopf("Schließen", () => box.remove()));
  box.append(titel, protokoll, leiste);
  document.body.append(box);

  let viewer = null;
  const fehler = (text) => {
    log("Fehler: " + text);
    kopieren.hidden = false;
    if (viewer && !viewer.closed) { try { viewer.postMessage({ typ: TYP.fehler, text: text }, VIEWER_ORIGIN); } catch (e) { /* egal */ } }
  };

  // Viewer SOFORT öffnen (synchron im Klick), sonst blockt der Popupblocker nach dem Abruf.
  try { viewer = window.open(VIEWER_URL + "?empfang=1", "unterrichtsarchiv"); } catch (e) { viewer = null; }
  log(viewer ? "Viewer geöffnet, hole Daten …" : "Neues Fenster wurde blockiert, die Daten kommen als Datei.");

  let bereitMelden = () => {};
  const bereit = new Promise((r) => { bereitMelden = r; });
  window.addEventListener("message", (ev) => {
    if (ev.origin !== VIEWER_ORIGIN || !ev.data || typeof ev.data !== "object") return;
    if (ev.data.typ === TYP.bereit) bereitMelden(true);
    if (ev.data.typ === TYP.empfangen) log("Viewer: " + ev.data.neu + " neu, " + ev.data.geaendert + " geändert, " + ev.data.unveraendert + " unverändert.");
  });
  const warte = (ms) => new Promise((r) => setTimeout(() => r(false), ms));

  const storageEintraege = () => {
    const e = [];
    for (const s of [window.localStorage, window.sessionStorage]) {
      try { for (let i = 0; i < s.length; i++) { const k = s.key(i); e.push([k, s.getItem(k)]); } } catch (x) { /* Storage gesperrt */ }
    }
    return e;
  };
  const kopf = () => {
    const h = { "Content-Type": "application/json", "Accept": "application/json" };
    const jwt = findeJwt(storageEintraege());
    if (jwt) h.Authorization = "Bearer " + jwt;
    return h;
  };

  async function bundleVersionErmitteln() {
    let v = findeBundleVersion([document.documentElement.outerHTML]);
    if (v) return { v: v, quelle: "Seite" };
    v = findeBundleVersion(storageEintraege().map((e) => e[1]));
    if (v) return { v: v, quelle: "Speicher" };
    const srcs = [...document.scripts].map((s) => s.src).filter((u) => u && u.startsWith(location.origin));
    srcs.sort((a, b) => (/main/i.test(b) ? 1 : 0) - (/main/i.test(a) ? 1 : 0));
    for (const u of srcs.slice(0, 3)) {
      try {
        const t = await (await fetch(u, { credentials: "same-origin" })).text();
        v = findeBundleVersion([t]);
        if (v) return { v: v, quelle: "Skript" };
      } catch (e) { /* nächstes Skript */ }
    }
    return { v: BUNDLE_FALLBACK, quelle: "Rückfallwert, evtl. veraltet" };
  }

  function herunterladen(huelle) {
    const blob = new Blob([JSON.stringify(huelle)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = dateinameFuerDatum(new Date());
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    log("Datei " + a.download + " heruntergeladen. Im Viewer auf „Importieren“ tippen und diese Datei wählen: " + VIEWER_URL);
  }

  ;(async () => {
    const statusRes = await fetch("/api/login-status", { credentials: "include", headers: kopf() });
    if (!statusRes.ok) {
      fehler("login-status antwortet mit HTTP " + statusRes.status + " (Pfad /api/login-status). Bist du eingeloggt?");
      return;
    }
    const status = await statusRes.json();
    const schueler = findeAssociatedStudents(status);
    if (!schueler.length) {
      fehler("Keine Schüler-Zuordnung (associatedStudent) in login-status gefunden. Felder der Antwort: " + Object.keys(status || {}).join(", "));
      return;
    }
    let gewaehlt = schueler[0];
    if (schueler.length > 1) {
      const antwort = window.prompt("Mehrere Schüler gefunden. Nummer eingeben:\n" + schueler.map((s, i) => (i + 1) + ": " + (s.name || "ID " + s.id)).join("\n"), "1");
      const n = parseInt(antwort, 10);
      if (!(n >= 1 && n <= schueler.length)) { fehler("Keine gültige Auswahl, abgebrochen."); return; }
      gewaehlt = schueler[n - 1];
    }
    log("Schüler-Zuordnung erkannt.");
    const bundle = await bundleVersionErmitteln();
    log("bundleVersion " + bundle.v + " (" + bundle.quelle + ").");
    const body = { bundleVersion: bundle.v, requests: ENDPOINTS.map((e) => ({ moduleName: "classbook", endpointName: e, parameters: { student: { id: gewaehlt.id } } })) };
    const res = await fetch("/api/calls", { method: "POST", credentials: "include", headers: kopf(), body: JSON.stringify(body) });
    if (res.status === 429) { fehler("Zu viele Anfragen (HTTP 429). Bitte später noch einmal, nicht sofort wieder klicken."); return; }
    if (res.status === 401 || res.status === 403) { fehler("Sitzung nicht erkannt (HTTP " + res.status + "). Neu einloggen und erneut versuchen."); return; }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      fehler("Abruf fehlgeschlagen: HTTP " + res.status + " " + t.slice(0, 300) + " [bundleVersion " + bundle.v + ", Endpoints " + ENDPOINTS.join("/") + "]");
      return;
    }
    const roh = await res.json();
    const warnungen = pruefeAntwortStatus(roh, ENDPOINTS);
    for (const w of warnungen) log("Warnung: " + w + ", der endpointName stimmt dort vermutlich nicht.");
    if (warnungen.length) kopieren.hidden = false;
    log(zaehleDatensaetze(roh) + " Datensätze erhalten.");
    const huelle = { typ: TYP.rohdaten, version: 1, abgerufen: new Date().toISOString(), endpoints: ENDPOINTS, roh: roh };
    if (viewer && !viewer.closed) {
      const ok = await Promise.race([bereit, warte(WARTE_AUF_VIEWER_MS)]);
      if (ok) {
        viewer.postMessage(huelle, VIEWER_ORIGIN);
        log("An den Viewer übergeben.");
        return;
      }
      log("Der Viewer meldet sich nicht, die Daten kommen als Datei.");
    }
    herunterladen(huelle);
  })().catch((e) => fehler(String((e && e.message) || e))).finally(() => { window.__unterrichtsarchivAktiv = false; });
})();
