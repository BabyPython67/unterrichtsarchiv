// Kleiner statischer Server für die lokale Prüfung des Viewers. Keine Abhängigkeiten.
//   node tools/serve.mjs [port] [wurzel]
// Liefert ohne Cache-Header, damit Änderungen sofort sichtbar sind.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.argv[2] || 8080);
const wurzel = resolve(process.argv[3] || fileURLToPath(new URL("..", import.meta.url)));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pfad = decodeURIComponent(url.pathname);
    if (pfad.endsWith("/")) pfad += "index.html";
    const datei = resolve(join(wurzel, pfad));
    if (!datei.startsWith(wurzel + sep) && datei !== wurzel) {
      res.writeHead(403); res.end("verboten"); return;
    }
    const info = await stat(datei).catch(() => null);
    if (!info || !info.isFile()) { res.writeHead(404); res.end("nicht gefunden: " + pfad); return; }
    const inhalt = await readFile(datei);
    res.writeHead(200, {
      "Content-Type": MIME[extname(datei).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*", // nur lokal: die Schulmanager-Attrappe auf :8081 holt Fixtures von :8080
    });
    res.end(inhalt);
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(port, () => {
  console.log(`Unterrichtsarchiv lokal: http://localhost:${port}/  (Wurzel: ${wurzel})`);
});
