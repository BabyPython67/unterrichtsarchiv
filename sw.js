// Service Worker: cache-first NUR für die App-Shell. Nutzerdaten liegen im localStorage und
// kommen nie in den Cache. VERSION stempelt tools/build.mjs aus dem Inhalt der Shell-Dateien:
// ein Deploy mit geänderter Shell bekommt einen neuen Cache-Namen, alte Caches werden beim
// Aktivieren gelöscht, damit niemand auf einer alten Version festhängt.

const VERSION = "0b37fd313823";
const CACHE = "unterrichtsarchiv-shell-" + VERSION;
const PRAEFIX = "unterrichtsarchiv-shell-";

const SHELL = [
  "./",
  "./index.html",
  "./install.html",
  "./manifest.json",
  "./ui/stil.css",
  "./ui/app.js",
  "./kern/erkennen.js",
  "./kern/normalisieren.js",
  "./kern/mergen.js",
  "./kern/filtern.js",
  "./kern/rohantwort.js",
  "./kern/speicher.js",
  "./kern/importieren.js",
  "./quellen/quelle.js",
  "./quellen/dateiQuelle.js",
  "./quellen/empfangsQuelle.js",
  "./bookmarklet/bookmarklet.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PRAEFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return; // Fremdes nie anfassen
  // ignoreSearch: "./?empfang=1" (vom Bookmarklet geöffnet) trifft den Eintrag "./"
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((treffer) => treffer || fetch(req)));
});
