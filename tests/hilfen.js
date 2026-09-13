import { readFileSync } from "node:fs";

export function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../referenz/${name}`, import.meta.url), "utf8"));
}

export const inhalte = () => fixture("antwort-inhalte.json");
export const hausaufgaben = () => fixture("antwort-hausaufgaben.json");
export const stundenplan = () => fixture("antwort-stundenplan.json");

/** Eine Antwort, wie sie ein kombinierter Request mit zwei Teilanfragen liefert (Klassenbuch). */
export function kombiniert() {
  return { results: [inhalte().results[0], hausaufgaben().results[0]], systemStatusMessages: [] };
}

/** Wie kombiniert(), plus Stundenplan als dritte Teilantwort (so sendet das Lesezeichen seit v3). */
export function kombiniert3() {
  return { results: [inhalte().results[0], hausaufgaben().results[0], stundenplan().results[0]], systemStatusMessages: [] };
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
