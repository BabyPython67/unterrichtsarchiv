// Ende-zu-Ende-Verschlüsselung für die Ablage. Ein Geheimnis (32 Zufallsbytes, base64url) ergibt
// per HKDF zwei Dinge: die Dokument-ID in der Ablage und den AES-GCM-Schlüssel. Das Geheimnis
// verlässt das Gerät nur im Kopplungslink. Nur WebCrypto, läuft im Browser und in node.
//
// Klartext vor dem Verschlüsseln: ein Byte Format (0 = JSON, 1 = gzip-JSON), danach die Daten.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const ABLAGE_VERSION = 1;

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function ausB64url(text) {
  const s = String(text).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export const istGeheimnis = (t) => typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);

export function geheimnisErzeugen() {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** → { dokumentId (64 Hex-Zeichen), schluessel (CryptoKey) }. Wirft bei ungültigem Geheimnis. */
export async function ableiten(geheimnis) {
  if (!istGeheimnis(geheimnis)) throw new Error("Kopplungscode ungültig.");
  const basis = await crypto.subtle.importKey("raw", ausB64url(geheimnis), "HKDF", false, ["deriveBits", "deriveKey"]);
  const hkdf = (info) => ({ name: "HKDF", hash: "SHA-256", salt: enc.encode("unterrichtsarchiv"), info: enc.encode(info) });
  const bits = new Uint8Array(await crypto.subtle.deriveBits(hkdf("dokument"), basis, 256));
  const dokumentId = [...bits].map((b) => b.toString(16).padStart(2, "0")).join("");
  const schluessel = await crypto.subtle.deriveKey(hkdf("schluessel"), basis, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  return { dokumentId, schluessel };
}

async function durch(bytes, strom) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(strom)).arrayBuffer());
}

/** → { daten, iv, version } als Strings bzw. Zahl, bereit für die Ablage. */
export async function verschluesseln(schluessel, objekt) {
  const json = enc.encode(JSON.stringify(objekt));
  const gzip = typeof CompressionStream === "function";
  const bytes = gzip ? await durch(json, new CompressionStream("gzip")) : json;
  const klar = new Uint8Array(bytes.length + 1);
  klar[0] = gzip ? 1 : 0;
  klar.set(bytes, 1);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const geheim = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, schluessel, klar));
  return { daten: b64url(geheim), iv: b64url(iv), version: ABLAGE_VERSION };
}

export async function entschluesseln(schluessel, { daten, iv, version }) {
  if (version !== ABLAGE_VERSION) throw new Error(`Die Ablage hat Version ${version}, diese App kennt ${ABLAGE_VERSION}. App neu laden.`);
  let klar;
  try {
    klar = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: ausB64url(iv) }, schluessel, ausB64url(daten)));
  } catch {
    throw new Error("Die Ablage lässt sich nicht entschlüsseln. Der Kopplungscode passt nicht.");
  }
  const bytes = klar.subarray(1);
  if (klar[0] === 1 && typeof DecompressionStream !== "function") throw new Error("Dieser Browser kann die Ablage nicht entpacken.");
  const json = klar[0] === 1 ? await durch(bytes, new DecompressionStream("gzip")) : bytes;
  return JSON.parse(dec.decode(json));
}
