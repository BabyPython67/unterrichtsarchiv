import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { findeAssociatedStudents, findeBundleVersion, siehtNachJwtAus, findeJwt, dateinameFuerDatum, pruefeAntwortStatus, zaehleDatensaetze, jwtNutzlast, schuelerAusSpeicher, apiPfade } from "../bookmarklet/helfer.js";
import { bookmarkletBauen, bookmarkletModul, codeVerdichten, STANDARD, WURZEL } from "../tools/build.mjs";
import { originErlaubt, bereitZiele } from "../quellen/empfangsQuelle.js";
import { kombiniert } from "./hilfen.js";

test("findeAssociatedStudents: verschachtelt, mehrere, keine Dubletten, Name nur zur Auswahl", () => {
  const status = {
    isAuthenticated: true,
    user: { id: 7, associatedStudent: { id: 4242424, firstname: "Max", lastname: "M" }, roles: [{ name: "student" }] },
    tief: [{ noch: { associatedStudent: { id: 4242424, firstname: "Max" } } }, { associatedStudents: [{ id: 99, firstname: "Kind", lastname: "Zwei" }] }],
    falsch: { associatedStudent: { id: "kein-int" } },
  };
  const s = findeAssociatedStudents(status);
  assert.deepEqual(s.map((x) => x.id), [4242424, 99]);
  assert.equal(s[0].name, "Max M");
  assert.deepEqual(findeAssociatedStudents({ a: 1 }), []);
  assert.deepEqual(findeAssociatedStudents(null), []);
});

test("findeBundleVersion: verschiedene Schreibweisen, sonst null", () => {
  assert.equal(findeBundleVersion(['var x={bundleVersion:"a6ef588fd2",foo:1}']), "a6ef588fd2");
  assert.equal(findeBundleVersion(['{"bundleVersion": "0123abcdef"}']), "0123abcdef");
  assert.equal(findeBundleVersion(["nix", null, "bundleVersion = 'deadbeef01'"]), "deadbeef01");
  assert.equal(findeBundleVersion(["bundleVersion: 'zu-kurz'"]), null);
  assert.equal(findeBundleVersion([]), null);
});

test("siehtNachJwtAus / findeJwt: roh, in JSON verpackt, Prioritäten, nichts", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0IiwiaWF0IjoxNzAwMDAwMDAwfQ.abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH";
  assert.equal(siehtNachJwtAus(jwt), true);
  assert.equal(siehtNachJwtAus("a.b.c"), false);
  assert.equal(siehtNachJwtAus(null), false);
  assert.equal(findeJwt([["egal", "x"], ["jwt", jwt]]), jwt);
  assert.equal(findeJwt([["state", JSON.stringify({ auth: { token: jwt } })]]), jwt);
  assert.equal(findeJwt([["irgendwas", jwt], ["token", jwt + "X"]]), jwt + "X"); // Schlüssel mit token gewinnt
  assert.equal(findeJwt([["a", "{kaputt"], ["b", "1"]]), null);
  assert.equal(findeJwt([]), null);
});

test("dateinameFuerDatum, pruefeAntwortStatus, zaehleDatensaetze", () => {
  assert.equal(dateinameFuerDatum(new Date(2026, 8, 3, 23, 30)), "unterricht-2026-09-03.json");
  assert.deepEqual(pruefeAntwortStatus({ results: [{ status: 404 }, { status: 200, data: [] }] }, ["get-topics", "get-homework"]), ["get-topics: Status 404"]);
  assert.deepEqual(pruefeAntwortStatus(kombiniert(), ["a", "b"]), []);
  assert.deepEqual(pruefeAntwortStatus(null, []), []);
  assert.equal(zaehleDatensaetze(kombiniert()), 31);
});

test("codeVerdichten: Kommentarzeilen und Einrückung weg, Code bleibt", () => {
  assert.equal(codeVerdichten("  // weg\n  const a = 1; // bleibt\n\n    b();\n"), "const a = 1; // bleibt\nb();");
});

test("bookmarkletBauen: Platzhalter ersetzt, Helfer ohne export, javascript:-URL, Code ist gültiges JS", () => {
  const { code, url } = bookmarkletBauen();
  assert.ok(url.startsWith("javascript:void%20"));
  assert.ok(!code.includes("__VIEWER_URL__") && !code.includes("__SCHULMANAGER_ORIGIN__"));
  assert.ok(code.includes(`"${STANDARD.viewer}"`) && code.includes(`"${STANDARD.origin}"`));
  assert.ok(!/^export /m.test(code));
  assert.ok(!/^\/\//m.test(code));
  assert.doesNotThrow(() => new Function(code), "gebauter Code muss syntaktisch gültig sein");
  assert.equal(decodeURIComponent(url.slice("javascript:".length)), code);
  const test = bookmarkletBauen({ viewer: "http://localhost:8080/", origin: "http://localhost:8081" });
  assert.ok(test.code.includes('"http://localhost:8081"'));
  assert.ok(url.length < 40000, `Bookmarklet-URL ist ${url.length} Zeichen lang`);
});

test("bookmarklet/bookmarklet.js ist aktuell (sonst: npm run build)", () => {
  const pfad = new URL("../bookmarklet/bookmarklet.js", import.meta.url);
  assert.ok(existsSync(pfad), "bookmarklet/bookmarklet.js fehlt, npm run build ausführen");
  const erwartet = bookmarkletModul({ ...STANDARD, url: bookmarkletBauen().url });
  assert.equal(readFileSync(pfad, "utf8").replace(/\r\n/g, "\n"), erwartet);
});

test("empfangsQuelle: Origin-Prüfung streng, lokal nur auf localhost gelockert", () => {
  const prod = { hostname: "babypython67.github.io" };
  const lokal = { hostname: "localhost" };
  assert.equal(originErlaubt("https://login.schulmanager-online.de", prod), true);
  assert.equal(originErlaubt("https://login.schulmanager-online.de.evil.example", prod), false);
  assert.equal(originErlaubt("http://localhost:8081", prod), false);
  assert.equal(originErlaubt("http://localhost:8081", lokal), true);
  assert.equal(originErlaubt("https://evil.example", lokal), false);
  assert.deepEqual(bereitZiele(prod), ["https://login.schulmanager-online.de"]);
  assert.equal(bereitZiele(lokal).length, 3);
  assert.equal(WURZEL.length > 0, true);
});

function jwtBauen(nutzlast) {
  const b64url = (s) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b64url('{"alg":"HS256","typ":"JWT"}') + "." + b64url(JSON.stringify(nutzlast)) + "." + "x".repeat(43);
}

test("jwtNutzlast: base64url mit Umlauten, ohne Padding; Müll ergibt null", () => {
  const jwt = jwtBauen({ user: { id: 7, associatedStudent: { id: 4242424, firstname: "Jörg", lastname: "Ü" } }, exp: 1 });
  const n = jwtNutzlast(jwt);
  assert.equal(n.user.associatedStudent.firstname, "Jörg");
  assert.equal(jwtNutzlast("a.b.c"), null);
  assert.equal(jwtNutzlast("eyJhbGciOiJIUzI1NiJ9.!!!!!!!!!!!!!!!!!!!!.abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH"), null);
  assert.equal(jwtNutzlast(null), null);
});

test("schuelerAusSpeicher: aus JWT roh, aus JSON-Storage, in JSON verpacktem JWT; sonst leer", () => {
  const jwt = jwtBauen({ user: { associatedStudent: { id: 4242424, firstname: "Max" } } });
  assert.deepEqual(schuelerAusSpeicher([["jwt", jwt]]).map((s) => s.id), [4242424]);
  assert.deepEqual(schuelerAusSpeicher([["user", JSON.stringify({ associatedStudent: { id: 42 } })]]).map((s) => s.id), [42]);
  assert.deepEqual(schuelerAusSpeicher([["state", JSON.stringify({ auth: { token: jwt } })]]).map((s) => s.id), [4242424]);
  assert.deepEqual(schuelerAusSpeicher([["x", "1"], ["y", "{kaputt"]]), []);
  assert.deepEqual(schuelerAusSpeicher([]), []);
});

test("apiPfade: nur eigene Origin, nur /api/, ohne Query, Zahlen maskiert, sortiert und eindeutig", () => {
  const o = "https://login.schulmanager-online.de";
  const namen = [
    o + "/api/calls", o + "/api/calls?x=1", o + "/api/user/4242424/status", o + "/main.js",
    "https://cdn.example/api/calls", o + "/api/calls", 5, o + "/api/login-status",
  ];
  assert.deepEqual(apiPfade(namen, o), ["/api/calls", "/api/login-status", "/api/user/#/status"]);
  assert.deepEqual(apiPfade([], o), []);
});
