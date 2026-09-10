// Erzeugt die PWA-Icons als PNG rein mit Node-Bordmitteln (zlib), ohne Bildbibliothek.
//   node tools/icons.mjs
// Motiv: abgerundetes Quadrat in Akzentfarbe, darauf drei helle Zeilen (Unterrichtsnotizen),
// die oberste kürzer wie eine Überschrift. Ergebnis wird committed, der Build ruft es nicht auf.

import { deflateSync, crc32 } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AKZENT = [0x1f, 0x4e, 0x79];
const HELL = [0xe3, 0xec, 0xf5];

function pngRgba(w, h, rgba) {
  const zeile = w * 4 + 1;
  const raw = Buffer.alloc(zeile * h);
  for (let y = 0; y < h; y++) {
    raw[y * zeile] = 0; // Filter: none
    rgba.copy(raw, y * zeile + 1, y * w * 4, (y + 1) * w * 4);
  }
  const chunk = (typ, daten) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(daten.length);
    const td = Buffer.concat([Buffer.from(typ, "latin1"), daten]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8 Bit, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Abstand eines Punkts zu einem abgerundeten Rechteck (negativ = innen). */
function rundrechteck(px, py, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  return Math.hypot(px - cx, py - cy) - r;
}

/**
 * groesse: Kantenlänge; rand: Anteil, der um das Quadrat frei bleibt (0 = randlos, für
 * maskable/apple-touch); vollflaechig: Hintergrund auch außerhalb des Quadrats füllen.
 */
export function iconZeichnen(groesse, { rand = 0.04, vollflaechig = false } = {}) {
  const S = groesse;
  const rgba = Buffer.alloc(S * S * 4);
  const p = rand * S;
  const innen = S - 2 * p;
  const radius = innen * 0.22;
  const zeilen = [
    { x0: 0.24, x1: 0.60, y: 0.36 },
    { x0: 0.24, x1: 0.76, y: 0.50 },
    { x0: 0.24, x1: 0.76, y: 0.64 },
  ];
  const dicke = 0.085 * innen;
  const N = 4; // Supersampling je Achse
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let deckHinter = 0, deckZeile = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const px = x + (sx + 0.5) / N, py = y + (sy + 0.5) / N;
          const innenQuadrat = vollflaechig || rundrechteck(px, py, p, p, S - p, S - p, radius) <= 0;
          if (!innenQuadrat) continue;
          deckHinter++;
          for (const z of zeilen) {
            const zx0 = p + z.x0 * innen, zx1 = p + z.x1 * innen, zy = p + z.y * innen;
            if (rundrechteck(px, py, zx0, zy - dicke / 2, zx1, zy + dicke / 2, dicke / 2) <= 0) { deckZeile++; break; }
          }
        }
      }
      const a = deckHinter / (N * N);
      const t = deckHinter ? deckZeile / deckHinter : 0;
      const i = (y * S + x) * 4;
      rgba[i] = Math.round(AKZENT[0] + (HELL[0] - AKZENT[0]) * t);
      rgba[i + 1] = Math.round(AKZENT[1] + (HELL[1] - AKZENT[1]) * t);
      rgba[i + 2] = Math.round(AKZENT[2] + (HELL[2] - AKZENT[2]) * t);
      rgba[i + 3] = Math.round(255 * a);
    }
  }
  return pngRgba(S, S, rgba);
}

const wurzel = fileURLToPath(new URL("..", import.meta.url));
const ziel = resolve(wurzel, "icons");
mkdirSync(ziel, { recursive: true });
const dateien = {
  "icon-192.png": iconZeichnen(192),
  "icon-512.png": iconZeichnen(512),
  "icon-512-maskable.png": iconZeichnen(512, { rand: 0.12, vollflaechig: true }),
  "apple-touch-icon.png": iconZeichnen(180, { rand: 0.06, vollflaechig: true }),
};
for (const [name, png] of Object.entries(dateien)) {
  writeFileSync(resolve(ziel, name), png);
  console.log(`${name}: ${png.length} Bytes`);
}
