import { test } from "node:test";
import assert from "node:assert/strict";
import { geheimnisErzeugen, istGeheimnis, ableiten, verschluesseln, entschluesseln, ABLAGE_VERSION } from "../kern/verschluesselung.js";
import { Ablage, AblageFehler, abgleichen, ablageEingerichtet } from "../quellen/ablage.js";
import { leererBestand, pruefeBestand } from "../kern/speicher.js";

const KONFIG = { projectId: "test-projekt", apiKey: "test-schluessel" };
const JETZT = "2026-09-14T15:00:00.000Z";

const eintrag = (kurs, hausaufgabe) =>
  ({ id: `${kurs}|2026-09-14|1`, kurs, datum: "2026-09-14", thema: "Thema", hausaufgabe, position: 1, ersterfasst: "2026-09-14", geaendert: null });
const bestand = (...eintraege) => pruefeBestand({ ...leererBestand(), eintraege });

/** Nachbau der Firestore-REST-Schnittstelle: GET, PATCH mit currentDocument-Bedingung. */
function firestoreAttrappe() {
  const dokumente = new Map();
  const anfragen = [];
  let uhr = 0;
  const antwort = (status, inhalt) => ({ status, json: async () => inhalt });
  async function abruf(url, { method, body }) {
    const u = new URL(url);
    anfragen.push({ method, url: u, body });
    const id = u.pathname.split("/").pop();
    const dok = dokumente.get(id);
    if (method === "GET") return dok ? antwort(200, dok) : antwort(404, { error: { status: "NOT_FOUND" } });
    const fehlt = u.searchParams.get("currentDocument.exists") === "false";
    const zeit = u.searchParams.get("currentDocument.updateTime");
    if ((fehlt && dok) || (zeit && (!dok || dok.updateTime !== zeit))) return antwort(400, { error: { status: "FAILED_PRECONDITION" } });
    const neu = { name: id, fields: JSON.parse(body).fields, updateTime: `2026-09-14T15:00:00.${String(++uhr).padStart(6, "0")}Z` };
    dokumente.set(id, neu);
    return antwort(200, neu);
  }
  return { abruf, dokumente, anfragen };
}

test("Geheimnis: 43 Zeichen base64url; gleiches Geheimnis ergibt dieselbe Dokument-ID, anderes eine andere", async () => {
  const g = geheimnisErzeugen();
  assert.ok(istGeheimnis(g));
  assert.notEqual(g, geheimnisErzeugen());
  const a = await ableiten(g);
  assert.match(a.dokumentId, /^[0-9a-f]{64}$/);
  assert.equal((await ableiten(g)).dokumentId, a.dokumentId);
  assert.notEqual((await ableiten(geheimnisErzeugen())).dokumentId, a.dokumentId);
  assert.ok(!a.dokumentId.includes(g), "Dokument-ID verrät das Geheimnis nicht");
  await assert.rejects(ableiten("zu-kurz"), /ungültig/);
});

test("Verschlüsselung: Rundlauf; Klartext nicht lesbar; falscher Schlüssel und fremde Version scheitern", async () => {
  const { schluessel } = await ableiten(geheimnisErzeugen());
  const objekt = bestand(eintrag("Chemie", "S. 45 Nr. 3 Protokoll"));
  const paket = await verschluesseln(schluessel, objekt);
  assert.equal(paket.version, ABLAGE_VERSION);
  assert.ok(!paket.daten.includes("Chemie") && !Buffer.from(paket.daten, "base64url").toString("latin1").includes("Chemie"));
  assert.deepEqual(await entschluesseln(schluessel, paket), objekt);
  const fremd = await ableiten(geheimnisErzeugen());
  await assert.rejects(entschluesseln(fremd.schluessel, paket), /nicht entschlüsseln/);
  await assert.rejects(entschluesseln(schluessel, { ...paket, version: 99 }), /Version 99/);
});

test("Ablage: ohne Konfiguration nicht eingerichtet", () => {
  assert.equal(ablageEingerichtet({ projectId: "", apiKey: "" }), false);
  assert.throws(() => new Ablage({ projectId: "", apiKey: "" }), (e) => e instanceof AblageFehler && e.art === "konfig");
});

test("abgleichen: erstes Gerät legt ab, zweites übernimmt; unveränderter Stand wird nicht erneut geschrieben", async () => {
  const fs = firestoreAttrappe();
  const ablage = new Ablage(KONFIG, fs.abruf);
  const { dokumentId, schluessel } = await ableiten(geheimnisErzeugen());

  const ipad = await abgleichen({ ablage, dokumentId, schluessel, lokal: bestand(eintrag("Chemie", "S. 45")), jetzt: JETZT });
  assert.deepEqual([ipad.hochgeladen, ipad.neu], [true, 0]);
  assert.equal(fs.dokumente.size, 1);
  const gespeichert = fs.dokumente.get(dokumentId).fields;
  assert.deepEqual(Object.keys(gespeichert).sort(), ["daten", "iv", "version"]);
  assert.ok(!JSON.stringify(gespeichert).includes("Chemie"), "Firestore sieht nur Chiffretext");
  assert.match(fs.anfragen[1].url.search, /currentDocument\.exists=false/);

  const handy = await abgleichen({ ablage, dokumentId, schluessel, lokal: bestand(eintrag("Deutsch", "Faust lesen")), jetzt: JETZT });
  assert.deepEqual([handy.hochgeladen, handy.neu], [true, 1]);
  assert.deepEqual(handy.bestand.eintraege.map((e) => e.kurs).sort(), ["Chemie", "Deutsch"]);
  assert.match(fs.anfragen.at(-1).url.search, /currentDocument\.updateTime=/);

  const nochmal = await abgleichen({ ablage, dokumentId, schluessel, lokal: handy.bestand, jetzt: JETZT });
  assert.equal(nochmal.hochgeladen, false);
  const ipad2 = await abgleichen({ ablage, dokumentId, schluessel, lokal: ipad.bestand, jetzt: JETZT });
  assert.deepEqual([ipad2.hochgeladen, ipad2.neu], [false, 1]);
});

test("abgleichen: schreibt ein anderes Gerät dazwischen, beginnt der Durchgang neu und nichts geht verloren", async () => {
  const fs = firestoreAttrappe();
  const { dokumentId, schluessel } = await ableiten(geheimnisErzeugen());
  const direkt = new Ablage(KONFIG, fs.abruf);
  let dazwischen = true;
  const stoerend = new Ablage(KONFIG, async (url, optionen) => {
    if (optionen.method === "PATCH" && dazwischen) {
      dazwischen = false;
      await abgleichen({ ablage: direkt, dokumentId, schluessel, lokal: bestand(eintrag("Physik", "Versuch")), jetzt: JETZT });
    }
    return fs.abruf(url, optionen);
  });
  const r = await abgleichen({ ablage: stoerend, dokumentId, schluessel, lokal: bestand(eintrag("Chemie", "S. 45")), jetzt: JETZT });
  assert.deepEqual(r.bestand.eintraege.map((e) => e.kurs).sort(), ["Chemie", "Physik"]);
  const ende = await abgleichen({ ablage: direkt, dokumentId, schluessel, lokal: bestand(), jetzt: JETZT });
  assert.deepEqual(ende.bestand.eintraege.map((e) => e.kurs).sort(), ["Chemie", "Physik"]);
});

test("abgleichen: Fehler werden benannt — offline, verweigert, falscher Schlüssel", async () => {
  const { dokumentId, schluessel } = await ableiten(geheimnisErzeugen());
  const lokal = bestand();
  const offline = new Ablage(KONFIG, async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(abgleichen({ ablage: offline, dokumentId, schluessel, lokal, jetzt: JETZT }), (e) => e.art === "offline");
  const verweigert = new Ablage(KONFIG, async () => ({ status: 403, json: async () => ({ error: { status: "PERMISSION_DENIED" } }) }));
  await assert.rejects(abgleichen({ ablage: verweigert, dokumentId, schluessel, lokal, jetzt: JETZT }), (e) => e.art === "verweigert");

  const fs = firestoreAttrappe();
  const ablage = new Ablage(KONFIG, fs.abruf);
  await abgleichen({ ablage, dokumentId, schluessel, lokal: bestand(eintrag("Chemie", "x")), jetzt: JETZT });
  const falsch = await ableiten(geheimnisErzeugen());
  await assert.rejects(abgleichen({ ablage, dokumentId, schluessel: falsch.schluessel, lokal, jetzt: JETZT }), (e) => e.art === "inhalt");
});
