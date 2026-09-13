import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { SHELL_DATEIEN, shellVersion, swStempeln, WURZEL } from "../tools/build.mjs";

const swQuelle = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("sw.js: Shell-Liste enthält alle Dateien, die der Build hasht, und nur existierende Dateien", () => {
  const m = /const SHELL = \[([\s\S]*?)\];/.exec(swQuelle);
  assert.ok(m, "SHELL-Array nicht gefunden");
  const shell = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  for (const d of SHELL_DATEIEN) assert.ok(shell.includes("./" + d), `sw.js SHELL fehlt: ./${d}`);
  for (const s of shell) {
    if (s === "./") continue;
    assert.ok(existsSync(new URL("../" + s.slice(2), import.meta.url)), `sw.js verweist auf fehlende Datei ${s}`);
  }
});

test("sw.js: Version ist gestempelt und passt zum Inhalt der Shell (sonst: npm run build)", () => {
  const m = /const VERSION = "([^"]*)";/.exec(swQuelle);
  assert.ok(m, "VERSION-Zeile fehlt");
  assert.equal(m[1], shellVersion(WURZEL));
});

test("Home-Bildschirm öffnet Safari: keine iOS-Web-App mit eigenem, leerem Speicher", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.display, "browser");
  const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(!/web-app-capable/.test(index), "index.html darf keine *-web-app-capable-Meta haben");
});

test("swStempeln ersetzt genau die VERSION-Zeile", () => {
  assert.equal(swStempeln('x\nconst VERSION = "dev";\ny', "abc123"), 'x\nconst VERSION = "abc123";\ny');
  assert.throws(() => swStempeln("nix", "abc"), /VERSION/);
});

test("sw.js fasst keine Nutzerdaten an: kein Storage-Zugriff im Code, nur GET, nur eigene Origin", () => {
  const code = swQuelle.split("\n").filter((z) => !z.trim().startsWith("//")).join("\n");
  assert.ok(!/localStorage|indexedDB|sessionStorage/.test(code));
  assert.ok(/req\.method !== "GET"/.test(code));
  assert.ok(/self\.location\.origin/.test(code));
});

test("sw.js: install.html und Lesezeichen-Code werden netzwerk-zuerst geholt, Cache nur als Rückfall", () => {
  const m = /const NETZ_ZUERST = \[([^\]]*)\];/.exec(swQuelle);
  assert.ok(m, "NETZ_ZUERST fehlt");
  assert.ok(m[1].includes('"/install.html"') && m[1].includes('"/bookmarklet/bookmarklet.js"'));
  assert.ok(/fetch\(req\)\.then\([\s\S]*\.catch\(\(\) => caches\.match\(req/.test(swQuelle), "Netz zuerst, Cache als Rückfall");
});
