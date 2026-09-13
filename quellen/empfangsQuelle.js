// Empfang per postMessage vom Bookmarklet im Schulmanager-Tab.
//
// Ablauf: Das Bookmarklet öffnet den Viewer per window.open mit ?empfang=1. Sobald der Viewer geladen ist,
// meldet er dem Öffner "bereit" (wiederholt, bis Daten da sind). Das Bookmarklet schickt
// daraufhin die Rohdaten-Hülle; der Viewer bestätigt mit "empfangen" und den Zählern.
//
// Sicherheit: Nur Nachrichten, deren event.origin erlaubt ist UND die vom Öffner-Fenster
// stammen, werden angenommen. Beim Senden wird die Ziel-Origin immer explizit angegeben.
// Läuft der Viewer selbst auf localhost, sind zusätzlich localhost-Origins erlaubt (nur für
// den Test mit der Schulmanager-Attrappe).

import { SCHULMANAGER_ORIGIN, NACHRICHT } from "./quelle.js";

const LOKAL_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const BEREIT_INTERVALL_MS = 500;
const BEREIT_MAX_MS = 20000;

export function istLokal(location) {
  return !!location && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
}

/** Origins, an die "bereit" geschickt wird (postMessage verwirft stille Nicht-Treffer). */
export function bereitZiele(location) {
  const ziele = [SCHULMANAGER_ORIGIN];
  if (istLokal(location)) ziele.push("http://localhost:8081", "http://127.0.0.1:8081");
  return ziele;
}

/** Nur der Aufruf mit ?empfang=1 (so öffnet ihn das Lesezeichen) wartet auf Daten. Lädt der
 * Tab über „Zum Unterrichtsarchiv“ neu, hat er weiter einen Öffner, soll aber nicht warten. */
export function empfangErwartet(location) {
  return !!location && new URLSearchParams(location.search || "").has("empfang");
}

export function originErlaubt(origin, location) {
  if (origin === SCHULMANAGER_ORIGIN) return true;
  return istLokal(location) && LOKAL_RE.test(origin);
}

export class EmpfangsQuelle {
  constructor(fenster = window) {
    this.name = "Bookmarklet";
    this.fenster = fenster;
    this.timer = null;
  }

  verfuegbar() {
    return typeof this.fenster.addEventListener === "function";
  }

  /** onWarten(true) beim Start des Handshakes, onWarten(false) wenn nichts angekommen ist. */
  starten({ onDaten, onFehler, onWarten = () => {} }) {
    const { fenster } = this;
    fenster.addEventListener("message", (ev) => {
      if (!originErlaubt(ev.origin, fenster.location)) return;
      if (!fenster.opener || ev.source !== fenster.opener) return;
      const d = ev.data;
      if (!d || typeof d !== "object") return;
      if (d.typ === NACHRICHT.rohdaten) {
        this.stoppen();
        const ergebnis = onDaten(d, { quelle: this.name });
        if (ergebnis) {
          try { ev.source.postMessage({ typ: NACHRICHT.empfangen, ...ergebnis }, ev.origin); } catch (e) { /* Öffner weg */ }
        }
      } else if (d.typ === NACHRICHT.fehler) {
        this.stoppen();
        onFehler(`Das Lesezeichen meldet: ${String(d.text || "Abruf fehlgeschlagen.")}`);
      }
    });

    if (!fenster.opener || !empfangErwartet(fenster.location)) return;
    onWarten(true);
    const ziele = bereitZiele(fenster.location);
    const senden = () => {
      for (const ziel of ziele) {
        try { fenster.opener.postMessage({ typ: NACHRICHT.bereit }, ziel); } catch (e) { /* Öffner weg */ }
      }
    };
    senden();
    let vergangen = 0;
    this.timer = setInterval(() => {
      vergangen += BEREIT_INTERVALL_MS;
      if (vergangen >= BEREIT_MAX_MS) { this.stoppen(); onWarten(false); return; }
      senden();
    }, BEREIT_INTERVALL_MS);
  }

  stoppen() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
