// Build ohne Abhängigkeiten:
//   node tools/build.mjs                       -> bookmarklet/bookmarklet.js (Produktion)
//   node tools/build.mjs --viewer http://localhost:8080/ --origin http://localhost:8081 \
//        --out tools/fake-schulmanager/bookmarklet-test.js   -> Testbuild für die Attrappe
// Außerdem stempelt der Produktionsbuild die Service-Worker-Version (Hash der App-Shell).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const WURZEL = fileURLToPath(new URL("..", import.meta.url));
export const STANDARD = {
  viewer: "https://babypython67.github.io/unterrichtsarchiv/",
  origin: "https://login.schulmanager-online.de",
};

/** Dateien, deren Inhalt die Service-Worker-Version bestimmt (App-Shell, keine Nutzerdaten). */
export const SHELL_DATEIEN = [
  "index.html", "install.html", "manifest.json", "ui/stil.css", "ui/app.js",
  "kern/erkennen.js", "kern/normalisieren.js", "kern/mergen.js", "kern/filtern.js",
  "kern/rohantwort.js", "kern/speicher.js", "kern/importieren.js", "kern/logik.js", "kern/stundenplan.js",
  "kern/zusammenfassung.js",
  "quellen/quelle.js", "quellen/dateiQuelle.js", "quellen/empfangsQuelle.js",
  "bookmarklet/bookmarklet.js",
];

/** Kommentarzeilen und führende Leerzeichen entfernen. Semikolons bleiben Pflicht in src.js. */
export function codeVerdichten(code) {
  return code.split(/\r?\n/).map((z) => z.trim()).filter((z) => z && !z.startsWith("//")).join("\n");
}

export function bookmarkletBauen({ viewer = STANDARD.viewer, origin = STANDARD.origin, helfer, src } = {}) {
  helfer = helfer ?? readFileSync(resolve(WURZEL, "bookmarklet/helfer.js"), "utf8");
  src = src ?? readFileSync(resolve(WURZEL, "bookmarklet/src.js"), "utf8");
  const code = codeVerdichten(helfer.replace(/^export /gm, "") + "\n" + src)
    .replaceAll("__VIEWER_URL__", viewer)
    .replaceAll("__SCHULMANAGER_ORIGIN__", origin);
  const roh = `void (() => {\n${code}\n})();`;
  // Kurze Kennung des gebauten Codes; steht in Statusbox und install.html, damit man sieht,
  // ob ein Lesezeichen aktuell ist. Gehasht wird der Code mit Platzhalter, sonst wäre es zirkulär.
  const build = createHash("sha256").update(roh).digest("hex").slice(0, 8);
  const ganz = roh.replaceAll("__BUILD__", build);
  return { code: ganz, url: "javascript:" + encodeURIComponent(ganz), build };
}

export function bookmarkletModul({ viewer, origin, url, build }) {
  return "// Gebaut von tools/build.mjs aus bookmarklet/helfer.js + src.js. Nicht von Hand ändern.\n" +
    `export const VIEWER_URL = ${JSON.stringify(viewer)};\n` +
    `export const SCHULMANAGER_ORIGIN = ${JSON.stringify(origin)};\n` +
    `export const BOOKMARKLET_URL = ${JSON.stringify(url)};\n` +
    `export const BUILD = ${JSON.stringify(build)};\n`;
}

/**
 * Kurzer Hash über die Shell-Dateien; ändert sich nur, wenn sich deren Inhalt ändert.
 * Zeilenenden werden auf LF normalisiert, damit ein CRLF-Checkout (Windows) nicht zählt.
 */
export function shellVersion(wurzel = WURZEL) {
  const h = createHash("sha256");
  for (const d of SHELL_DATEIEN) {
    const p = resolve(wurzel, d);
    h.update(d + "\n");
    if (existsSync(p)) h.update(readFileSync(p, "utf8").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex").slice(0, 12);
}

export function swStempeln(swQuelle, version) {
  const neu = swQuelle.replace(/const VERSION = "[^"]*";/, `const VERSION = "${version}";`);
  if (neu === swQuelle && !swQuelle.includes(`const VERSION = "${version}";`)) {
    throw new Error("sw.js enthält keine Zeile const VERSION = \"...\";");
  }
  return neu;
}

function argumente(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) { a[argv[i].slice(2)] = argv[i + 1]; i++; }
  }
  return a;
}

const direktGestartet = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (direktGestartet) {
  const a = argumente(process.argv.slice(2));
  const viewer = a.viewer || STANDARD.viewer;
  const origin = a.origin || STANDARD.origin;
  const { url, build } = bookmarkletBauen({ viewer, origin });
  const out = resolve(WURZEL, a.out || "bookmarklet/bookmarklet.js");
  writeFileSync(out, bookmarkletModul({ viewer, origin, url, build }));
  console.log(`Bookmarklet: ${out} (Build ${build}, ${url.length} Zeichen, Viewer ${viewer}, Origin ${origin})`);

  const istProduktion = !a.out && viewer === STANDARD.viewer && origin === STANDARD.origin;
  const swPfad = resolve(WURZEL, "sw.js");
  if (istProduktion && existsSync(swPfad)) {
    const version = shellVersion();
    writeFileSync(swPfad, swStempeln(readFileSync(swPfad, "utf8"), version));
    console.log(`Service Worker: Version ${version}`);
  }
}
