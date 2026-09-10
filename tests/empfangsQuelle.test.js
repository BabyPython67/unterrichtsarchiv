import { test } from "node:test";
import assert from "node:assert/strict";
import { EmpfangsQuelle } from "../quellen/empfangsQuelle.js";
import { NACHRICHT, SCHULMANAGER_ORIGIN } from "../quellen/quelle.js";
import { HUELLE_TYP } from "../kern/rohantwort.js";

/** Nachgebautes Fenster: opener sammelt gesendete Nachrichten, message-Events werden von Hand ausgelöst. */
function fensterBauen({ hostname = "babypython67.github.io", mitOpener = true } = {}) {
  const listener = [];
  const opener = mitOpener ? { gesendet: [], postMessage(msg, ziel) { this.gesendet.push({ msg, ziel }); } } : null;
  return {
    location: { hostname },
    opener,
    addEventListener(typ, fn) { if (typ === "message") listener.push(fn); },
    feuern(ev) { for (const fn of listener) fn(ev); },
  };
}

test("EmpfangsQuelle: sendet 'bereit' nur an die Schulmanager-Origin, nimmt Daten vom Öffner an, bestätigt mit Zählern", () => {
  const f = fensterBauen();
  const q = new EmpfangsQuelle(f);
  const aufrufe = [];
  q.starten({
    onDaten: (d, meta) => { aufrufe.push({ d, meta }); return { neu: 5, geaendert: 1, unveraendert: 2 }; },
    onFehler: (t) => aufrufe.push({ fehler: t }),
    onWarten: (l) => aufrufe.push({ warten: l }),
  });
  assert.deepEqual(aufrufe, [{ warten: true }]);
  assert.deepEqual(f.opener.gesendet, [{ msg: { typ: NACHRICHT.bereit }, ziel: SCHULMANAGER_ORIGIN }]);

  const huelle = { typ: HUELLE_TYP, version: 1, roh: { results: [] } };
  f.feuern({ origin: SCHULMANAGER_ORIGIN, source: f.opener, data: huelle });
  q.stoppen();
  assert.equal(aufrufe.length, 2);
  assert.equal(aufrufe[1].d, huelle);
  assert.equal(aufrufe[1].meta.quelle, "Bookmarklet");
  assert.deepEqual(f.opener.gesendet[1], { msg: { typ: NACHRICHT.empfangen, neu: 5, geaendert: 1, unveraendert: 2 }, ziel: SCHULMANAGER_ORIGIN });
});

test("EmpfangsQuelle: fremde Origin, fremde Quelle und Müll werden verworfen", () => {
  const f = fensterBauen();
  const q = new EmpfangsQuelle(f);
  const aufrufe = [];
  q.starten({ onDaten: (d) => { aufrufe.push(d); return null; }, onFehler: (t) => aufrufe.push(t) });
  q.stoppen();
  const huelle = { typ: HUELLE_TYP, roh: {} };
  f.feuern({ origin: "https://evil.example", source: f.opener, data: huelle });
  f.feuern({ origin: SCHULMANAGER_ORIGIN, source: {}, data: huelle });
  f.feuern({ origin: SCHULMANAGER_ORIGIN, source: f.opener, data: "text" });
  f.feuern({ origin: SCHULMANAGER_ORIGIN, source: f.opener, data: { typ: "anderes" } });
  assert.deepEqual(aufrufe, []);
  f.feuern({ origin: SCHULMANAGER_ORIGIN, source: f.opener, data: huelle });
  assert.deepEqual(aufrufe, [huelle]);
});

test("EmpfangsQuelle: Fehlermeldung des Bookmarklets landet bei onFehler", () => {
  const f = fensterBauen();
  const q = new EmpfangsQuelle(f);
  const fehler = [];
  q.starten({ onDaten: () => null, onFehler: (t) => fehler.push(t) });
  q.stoppen();
  f.feuern({ origin: SCHULMANAGER_ORIGIN, source: f.opener, data: { typ: NACHRICHT.fehler, text: "HTTP 429" } });
  assert.deepEqual(fehler, ["Das Lesezeichen meldet: HTTP 429"]);
});

test("EmpfangsQuelle: ohne Öffner kein Handshake, aber Listener bleibt harmlos", () => {
  const f = fensterBauen({ mitOpener: false });
  const q = new EmpfangsQuelle(f);
  const aufrufe = [];
  q.starten({ onDaten: (d) => { aufrufe.push(d); return null; }, onFehler: () => {}, onWarten: (l) => aufrufe.push({ warten: l }) });
  f.feuern({ origin: SCHULMANAGER_ORIGIN, source: {}, data: { typ: HUELLE_TYP, roh: {} } });
  assert.deepEqual(aufrufe, []);
  assert.equal(q.timer, null);
});

test("EmpfangsQuelle: lokal (localhost) sind Attrappen-Origins erlaubt, sonst nicht", () => {
  const f = fensterBauen({ hostname: "localhost" });
  const q = new EmpfangsQuelle(f);
  const aufrufe = [];
  q.starten({ onDaten: (d) => { aufrufe.push(d); return null; }, onFehler: () => {} });
  q.stoppen();
  assert.deepEqual(f.opener.gesendet.map((g) => g.ziel), [SCHULMANAGER_ORIGIN, "http://localhost:8081", "http://127.0.0.1:8081"]);
  f.feuern({ origin: "http://localhost:8081", source: f.opener, data: { typ: HUELLE_TYP, roh: {} } });
  assert.equal(aufrufe.length, 1);
});
