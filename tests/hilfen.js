import { readFileSync } from "node:fs";

export function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../referenz/${name}`, import.meta.url), "utf8"));
}

export const inhalte = () => fixture("antwort-inhalte.json");
export const hausaufgaben = () => fixture("antwort-hausaufgaben.json");

/** Eine Antwort, wie sie ein kombinierter Request mit zwei Teilanfragen liefert. */
export function kombiniert() {
  return { results: [inhalte().results[0], hausaufgaben().results[0]], systemStatusMessages: [] };
}

export function speicherStub() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}
