// Ablage in Firestore über die REST-Schnittstelle, ohne SDK. Pro Kopplung ein Dokument mit dem
// verschlüsselten Bestand (daten, iv, version). Firestore sieht nur Chiffretext. Die Regeln in
// docs/technik.md erlauben nur Lesen und Schreiben eines Dokuments, dessen ID man kennt.
// fetch wird übergeben, damit sich der Ablauf in node mit einer Attrappe testen lässt.

import { entschluesseln, verschluesseln } from "../kern/verschluesselung.js";
import { zusammenfuehren, stabil } from "../kern/abgleich.js";
import { pruefeBestand } from "../kern/speicher.js";

// Projekt-ID und API-Schlüssel sind bei Firebase nicht geheim; geschützt wird über die Regeln.
export const ABLAGE_KONFIG = { projectId: "daten-ablage---u-archiv", apiKey: "AIzaSyBm8KL32xQRGK5iAx1K4MWvLWSeE2Epo1A" };

export const MAX_DATEN = 900000;   // Zeichen im Feld daten, die Regeln erlauben bis knapp darunter

export class AblageFehler extends Error {
  /** art: "konfig" | "offline" | "konflikt" | "verweigert" | "limit" | "zugross" | "inhalt" | "server" */
  constructor(art, text) {
    super(text);
    this.art = art;
  }
}

export const ablageEingerichtet = (konfig = ABLAGE_KONFIG) => !!(konfig.projectId && konfig.apiKey);

export class Ablage {
  constructor(konfig = ABLAGE_KONFIG, abruf = (...a) => fetch(...a)) {
    if (!ablageEingerichtet(konfig)) throw new AblageFehler("konfig", "Die Ablage ist noch nicht eingerichtet.");
    this.basis = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(konfig.projectId)}/databases/(default)/documents/ablagen/`;
    this.key = encodeURIComponent(konfig.apiKey);
    this.abruf = abruf;
  }

  async anfrage(url, optionen) {
    let antwort;
    try {
      antwort = await this.abruf(url, optionen);
    } catch {
      throw new AblageFehler("offline", "Keine Verbindung zur Ablage.");
    }
    let inhalt = null;
    try { inhalt = await antwort.json(); } catch { inhalt = null; }
    return { status: antwort.status, inhalt };
  }

  fehler(status, inhalt) {
    const s = inhalt && inhalt.error ? inhalt.error.status : null;
    if (status === 409 || s === "FAILED_PRECONDITION" || s === "ALREADY_EXISTS" || s === "ABORTED") {
      return new AblageFehler("konflikt", "Die Ablage wurde gleichzeitig geändert.");
    }
    if (status === 403) return new AblageFehler("verweigert", "Die Ablage verweigert den Zugriff.");
    if (status === 429 || s === "RESOURCE_EXHAUSTED") return new AblageFehler("limit", "Tageslimit der Ablage erreicht. Morgen geht es wieder.");
    return new AblageFehler("server", `Die Ablage antwortet mit Fehler ${status}.`);
  }

  /** → null, wenn es das Dokument nicht gibt, sonst { daten, iv, version, updateTime }. */
  async holen(dokumentId) {
    const { status, inhalt } = await this.anfrage(`${this.basis}${dokumentId}?key=${this.key}`, { method: "GET", cache: "no-store" });
    if (status === 404) return null;
    if (status !== 200 || !inhalt) throw this.fehler(status, inhalt);
    const f = inhalt.fields || {};
    return {
      daten: f.daten ? f.daten.stringValue : "",
      iv: f.iv ? f.iv.stringValue : "",
      version: f.version ? Number(f.version.integerValue) : 0,
      updateTime: inhalt.updateTime,
    };
  }

  /** Schreibt nur, wenn das Dokument noch so ist wie beim Holen (updateTime) bzw. noch fehlt. → neue updateTime */
  async ablegen(dokumentId, { daten, iv, version }, updateTime) {
    const bedingung = updateTime ? `currentDocument.updateTime=${encodeURIComponent(updateTime)}` : "currentDocument.exists=false";
    const body = JSON.stringify({ fields: { daten: { stringValue: daten }, iv: { stringValue: iv }, version: { integerValue: String(version) } } });
    const { status, inhalt } = await this.anfrage(`${this.basis}${dokumentId}?key=${this.key}&${bedingung}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body,
    });
    if (status !== 200 || !inhalt) throw this.fehler(status, inhalt);
    return inhalt.updateTime;
  }
}

/**
 * Holt die Ablage, führt sie mit dem lokalen Bestand zusammen und legt das Ergebnis ab, wenn es
 * sich von der Ablage unterscheidet. Hat ein anderes Gerät dazwischen geschrieben, beginnt der
 * Durchgang von vorn, höchstens versuche-mal.
 * → { bestand, neu, hochgeladen, groesse }
 */
export async function abgleichen({ ablage, dokumentId, schluessel, lokal, jetzt, versuche = 3 }) {
  for (let versuch = 1; ; versuch++) {
    const dok = await ablage.holen(dokumentId);
    let fremd = null;
    if (dok) {
      try {
        fremd = pruefeBestand(await entschluesseln(schluessel, dok));
      } catch (e) {
        throw new AblageFehler("inhalt", e.message);
      }
    }
    const { bestand, neu } = fremd ? zusammenfuehren(lokal, fremd, jetzt) : { bestand: lokal, neu: 0 };
    if (fremd && stabil(bestand) === stabil(fremd)) return { bestand, neu, hochgeladen: false, groesse: dok.daten.length };
    const paket = await verschluesseln(schluessel, bestand);
    if (paket.daten.length > MAX_DATEN) throw new AblageFehler("zugross", "Das Archiv ist zu groß für die Ablage.");
    try {
      await ablage.ablegen(dokumentId, paket, dok ? dok.updateTime : null);
      return { bestand, neu, hochgeladen: true, groesse: paket.daten.length };
    } catch (e) {
      if (!(e instanceof AblageFehler) || e.art !== "konflikt" || versuch >= versuche) throw e;
    }
  }
}
