// Service Worker: cache-first NUR für die App-Shell. Nutzerdaten liegen im localStorage und
// kommen nie in den Cache. VERSION stempelt tools/build.mjs aus dem Inhalt der Shell-Dateien:
// ein Deploy mit geänderter Shell bekommt einen neuen Cache-Namen, alte Caches werden beim
// Aktivieren gelöscht, damit niemand auf einer alten Version festhängt.

const VERSION = "688d534d5f06";
const CACHE = "unterrichtsarchiv-shell-" + VERSION;
const PRAEFIX = "unterrichtsarchiv-shell-";
// Diese beiden werden bei Verbindung immer frisch geholt (Cache nur als Rückfall offline):
// sonst zieht man nach einem Update ein altes Lesezeichen aus dem Cache.
const NETZ_ZUERST = ["/install.html", "/bookmarklet/bookmarklet.js"];

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
  "./kern/logik.js",
  "./kern/stundenplan.js",
  "./kern/zusammenfassung.js",
  "./kern/abgleich.js",
  "./kern/verschluesselung.js",
  "./kern/neuigkeiten.js",
  "./quellen/quelle.js",
  "./quellen/dateiQuelle.js",
  "./quellen/empfangsQuelle.js",
  "./quellen/ablage.js",
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
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Fremdes nie anfassen
  if (NETZ_ZUERST.some((p) => url.pathname.endsWith(p))) {
    e.respondWith(fetch(req).then((antwort) => {
      if (antwort.ok) {
        const kopie = antwort.clone();
        url.search = ""; // ohne Query ablegen, damit der Cache nicht wächst
        caches.open(CACHE).then((c) => c.put(url.href, kopie));
      }
      return antwort;
    }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  // ignoreSearch: "./?empfang=1" (vom Bookmarklet geöffnet) trifft den Eintrag "./"
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((treffer) => treffer || fetch(req)));
});
