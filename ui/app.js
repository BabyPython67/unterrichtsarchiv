// Viewer: Zustand, Verdrahtung, Rendering. Alle Datenlogik kommt aus kern/, die Quellen aus
// quellen/. Es wird nichts per innerHTML eingefügt — Texte aus den Daten laufen immer durch
// textContent bzw. createTextNode.

import { lesen, schreiben, loeschen, defektSichern, exportText, exportDateiname, leererBestand, STAND_BLOECKE } from "../kern/speicher.js";
import { stabil, zusammenfuehren, aenderungenStempeln } from "../kern/abgleich.js";
import { geheimnisErzeugen, istGeheimnis, ableiten } from "../kern/verschluesselung.js";
import { importieren } from "../kern/importieren.js";
import { istEigen, eigenenEintragAnlegen, eigenenEintragAendern, eigenenEintragLoeschen, eigeneEintraege } from "../kern/mergen.js";
import {
  filtern, gruppieren, kursListe, trefferZeile, eingegrenzt, anzahlText, kurseZaehlen, kurseSortiert, anzeigename, zerlegen, wochentag, datumLesbar, WOCHENTAGE,
} from "../kern/filtern.js";
import {
  baueDigest, digestKopfzeile, tagesablauf, herkunftZeile, syncZeile, planFunktion, schultagSuchen, datumPlus, isoDatum, vorTagenText,
  ermittleWochenplan, mitStandard, erinnerung, stundenSeitAbruf, stundenSeitAbrufText, eintragDatum, kurseZumEintragen, kurseOhneHausaufgabe,
  naechsteStunden,
} from "../kern/logik.js";
import {
  kurseZusammenfassung, vorschauZusammenfassung, wochenplanZusammenfassung, freieTageZusammenfassung,
  faecherImStundenplan, faecherZusammenfassung, datenZusammenfassung, abgleichZusammenfassung,
} from "../kern/zusammenfassung.js";
import { SCHULMANAGER_ORIGIN } from "../quellen/quelle.js";
import { DateiQuelle } from "../quellen/dateiQuelle.js";
import { EmpfangsQuelle } from "../quellen/empfangsQuelle.js";
import { Ablage, AblageFehler, abgleichen, ablageEingerichtet } from "../quellen/ablage.js";

const $ = (id) => document.getElementById(id);

const heuteIso = () => isoDatum(new Date());

/** Kleiner DOM-Helfer: el("div", {class:"x", onclick: fn}, "Text", kind, [weitere], ...) */
function el(tag, attrs = {}, ...kinder) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kind of kinder.flat(Infinity)) {
    if (kind === null || kind === undefined || kind === false) continue;
    n.append(kind instanceof Node ? kind : document.createTextNode(String(kind)));
  }
  return n;
}

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------

let storage = null;
try { storage = window.localStorage; } catch { storage = null; }

// zeitraum ("alles" | "klausur" | "ab") ist nur Zustand der Oberfläche; filtern() liest seitKlausur und abDatum.
// kurs ist die geöffnete Kursseite im Archiv, null die Kursliste.
const FILTER_LEER = () => ({ kurs: null, abDatum: "", suche: "", nurHausaufgabe: false, seitKlausur: false, zeitraum: "alles" });
// datum "" heißt: vorgeschlagenes Datum (eintragDatum), erst eine Wahl im Feld legt es fest.
const ENTWURF_LEER = () => ({ kurs: "", hausaufgabe: "", datum: "", bis: "" });

const zustand = {
  bestand: leererBestand(),
  speicherFehler: null,
  filter: FILTER_LEER(),
  filterOffen: false,     // Filterbereich im Archiv aufgeklappt
  monatAuf: {},           // "kurs|JJJJ-MM" → per Antippen auf- oder zugeklappt, sonst ist nur der neueste Monat offen
  ansicht: "archiv",     // "archiv" | "vorschau" | "eintragen" | "einstellungen"
  vorher: "archiv",       // wohin „Zurück“ aus den Einstellungen führt
  seite: [],              // Unterseite der Einstellungen, siehe renderEinstellungen
  vorschauDatum: null,    // null = nächster Schultag automatisch, sonst per Pfeil gewählter Tag
  abrufHilfeOffen: false, // Kurzanleitung zum Lesezeichen in der Erinnerung aufgeklappt
  entwurf: ENTWURF_LEER(), // Eingaben unter „Eintragen“, bleiben beim Reiterwechsel erhalten
  bearbeiten: null,       // { id, zurueck, scroll }: ein selbst eingetragener Eintrag wird geändert
  meldung: null,
};

function laden() {
  if (!storage) { zustand.speicherFehler = "Der Browser-Speicher ist nicht verfügbar. Daten gehen beim Schließen verloren."; return; }
  const { bestand, fehler, migriert } = lesen(storage);
  zustand.bestand = bestand;
  zustand.speicherFehler = fehler;
  gespeichert = kopie(bestand);
  abgleich.status = abgleichLesen();
  if (fehler) defektSichern(storage);
  else if (migriert) speichern();   // Schema 1 → 2 einmal zurückschreiben
  zustand.ansicht = bestand.einstellungen.startReiter === "vorschau" ? "vorschau" : "archiv";
  zustand.vorher = zustand.ansicht;
}

// Zuletzt geschriebener Bestand als Kopie. speichern() vergleicht damit und stempelt Änderungen
// für den Abgleich (aenderungenStempeln), bevor es schreibt.
let gespeichert = null;
const kopie = (b) => JSON.parse(JSON.stringify(b));

function speichern() {
  if (!storage) return;
  // Object.assign statt Ersetzen: Einstellungsseiten halten Verweise auf zustand.bestand.
  Object.assign(zustand.bestand, aenderungenStempeln(gespeichert, zustand.bestand, new Date().toISOString()));
  if (bestandSchreiben()) abgleichPlanen();
}

/** Schreibt ohne zu stempeln, z. B. was aus der Ablage kommt. → true bei Erfolg */
function bestandSchreiben() {
  if (!storage) return false;
  try {
    schreiben(storage, zustand.bestand);
    gespeichert = kopie(zustand.bestand);
    return true;
  } catch (e) {
    melden("fehler", `Speichern fehlgeschlagen: ${e.message}. Bitte jetzt exportieren.`);
    return false;
  }
}

function melden(art, text, details = []) {
  zustand.meldung = { art, text, details };
  renderMeldung();
  if (art === "ok") setTimeout(() => { if (zustand.meldung && zustand.meldung.text === text) { zustand.meldung = null; renderMeldung(); } }, 9000);
}

/** Zentraler Einstieg für alle Quellen. */
function datenVerarbeiten(objekt, meta = {}) {
  let r;
  try {
    r = importieren(zustand.bestand, objekt, heuteIso(), new Date().toISOString());
  } catch (e) {
    melden("fehler", `${meta.datei ? meta.datei + ": " : ""}${e.message}`);
    return null;
  }
  zustand.bestand = r.bestand;
  speichern();
  const { neu, geaendert, unveraendert } = r.ergebnis;
  const woher = meta.datei ? ` aus ${meta.datei}` : meta.quelle ? ` (${meta.quelle})` : "";
  const plan = r.stundenplan ? ` Stundenplan bis ${datumLesbar(r.stundenplan.bis)} aktualisiert.` : "";
  const text = r.art === "export"
    ? `Export-Datei übernommen${woher}: ${neu} neu, ${geaendert} geändert, ${unveraendert} unverändert.`
    : `Abruf übernommen${woher}: ${neu} neu, ${geaendert} geändert, ${unveraendert} unverändert.${plan}`;
  melden(r.warnungen.length ? "warn" : "ok", text, r.warnungen.map((w) => w.text));
  render();
  return r.ergebnis;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  renderStand();
  renderMeldung();
  renderErinnerung();
  const a = zustand.ansicht;
  $("knopf-einstellungen").setAttribute("aria-pressed", String(a === "einstellungen"));
  $("reiter-archiv").setAttribute("aria-pressed", String(a === "archiv"));
  $("reiter-vorschau").setAttribute("aria-pressed", String(a === "vorschau"));
  $("reiter-eintragen").setAttribute("aria-pressed", String(a === "eintragen"));
  $("stand").hidden = a !== "archiv";
  $("liste-bereich").hidden = a !== "archiv";
  $("vorschau").hidden = a !== "vorschau";
  $("eintragen").hidden = a !== "eintragen";
  $("einstellungen").hidden = a !== "einstellungen";
  if (a === "einstellungen") {
    renderEinstellungen();
  } else if (a === "vorschau") {
    renderVorschau();
  } else if (a === "eintragen") {
    renderEintragen();
  } else {
    renderArchivKopf();
    renderFilter();
    renderListe();
  }
}

const ANSICHT_NAMEN = { archiv: "Archiv", vorschau: "Vorschau", eintragen: "Eintragen" };

/** seite gilt nur beim Wechsel in die Einstellungen: [] ist die Übersicht. */
function ansichtWechseln(ziel, seite = []) {
  if (ziel === "einstellungen") zustand.seite = seite;
  else zustand.vorher = ziel;
  zustand.ansicht = ziel;
  render();
}

function renderStand() {
  const { eintraege, letzterAbruf } = zustand.bestand;
  const kurse = Object.keys(kurseZaehlen(eintraege)).length;
  const teile = [];
  if (eintraege.length) {
    teile.push(`${eintraege.length} ${eintraege.length === 1 ? "Eintrag" : "Einträge"} aus ${kurse} ${kurse === 1 ? "Kurs" : "Kursen"}`);
  } else {
    teile.push("Noch keine Einträge");
  }
  if (letzterAbruf) teile.push(`Stand ${zeitLesbar(letzterAbruf)}`);
  const stand = $("stand");
  stand.textContent = teile.join(" · ");
  // Unterricht seit dem Stand laut Stundenplan: sagt, ob das Archiv hinterherhinkt.
  const seit = letzterAbruf ? stundenSeitAbrufText(stundenSeitAbruf(new Date(), zustand.bestand)) : "";
  if (seit) stand.append(" · ", el("span", { class: "alt", text: seit }));
}

/** ISO-Zeitstempel in Ortszeit, z. B. "11.09.2026, 00:12". Reine Tagesdaten laufen über datumLesbar. */
function zeitLesbar(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return datumLesbar(iso);
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function renderMeldung() {
  const box = $("meldung");
  box.textContent = "";
  const m = zustand.meldung;
  if (!m) { box.hidden = true; box.className = "meldung"; return; }
  box.hidden = false;
  box.className = `meldung ${m.art}`;
  const text = el("div", { class: "text" }, el("p", { text: m.text }));
  if (m.details && m.details.length) text.append(el("ul", {}, m.details.map((d) => el("li", { text: d }))));
  box.append(text, el("button", { type: "button", onclick: () => { zustand.meldung = null; renderMeldung(); } }, "Schließen"));
}

/** iOS-Web-App vom Home-Bildschirm: eigener Speicher, getrennt von Safari, das Lesezeichen schreibt
 * nie hierher. Einmal beim Start, damit ein aufgeklappter Bereich beim Rendern offen bleibt. */
function renderWebAppHinweis() {
  const box = $("webapp-hinweis");
  box.textContent = "";
  box.append(
    el("p", {}, el("b", { text: "Diese App vom Home-Bildschirm bekommt keine Daten vom Lesezeichen." }), " Sie hat einen eigenen Speicher, getrennt von Safari."),
    el("details", {},
      el("summary", { text: "So wird es behoben" }),
      el("ol", {},
        el("li", { text: "Falls hier Einträge liegen, zuerst sichern: Einstellungen → Daten → Exportieren." }),
        el("li", { text: "Dieses Symbol vom Home-Bildschirm entfernen." }),
        el("li", { text: `In Safari ${location.host}${location.pathname} öffnen.` }),
        el("li", { text: "Teilen → „Zum Home-Bildschirm“, den Schalter „Als Web-App öffnen“ ausschalten, „Hinzufügen“." }),
        el("li", { text: "Falls gesichert: die Datei dort einlesen, Einstellungen → Daten → Importieren." }),
      ),
    ),
  );
  box.hidden = false;
}

/** Leerzustand ohne Daten: gleiche Anleitung im Archiv und in der Vorschau. */
function leerHinweis() {
  return el("div", { class: "leer-hinweis" },
    el("h2", { text: "Noch keine Einträge" }),
    el("p", { text: "So kommen die Daten hierher:" }),
    el("ol", {},
      el("li", {}, "Einmalig das Lesezeichen anlegen: ", el("a", { href: "./install.html" }, "Anleitung")),
      el("li", { text: "Im Schulmanager einloggen und das Lesezeichen antippen." }),
      el("li", { text: "Dieser Viewer öffnet sich und übernimmt die Einträge. Klappt das Öffnen nicht, lädt das Lesezeichen eine Datei herunter, die du hier importierst." }),
    ),
    el("div", { class: "knoepfe" }, el("button", { type: "button", onclick: () => dateiQuelle.oeffnen() }, "Datei importieren")),
  );
}

/** Wie man das Lesezeichen auf diesem Gerät aufruft (iPad meldet sich wie ein Mac mit Touch). */
function lesezeichenSchritt() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return "In die Adressleiste tippen und bei den Favoriten dein Lesezeichen antippen.";
  }
  if (/Android/.test(ua)) return "Den Namen deines Lesezeichens in die Adressleiste tippen und es auswählen.";
  return "In der Lesezeichenleiste auf dein Lesezeichen klicken.";
}

/** Erinnerung unter den Reitern (nicht in den Einstellungen): Rückstand seit dem Abruf oder Abruf fehlgeschlagen. */
function renderErinnerung() {
  const box = $("erinnerung");
  box.textContent = "";
  const e = zustand.ansicht === "einstellungen" ? null : erinnerung(new Date(), zustand.bestand);
  box.hidden = !e;
  if (e) box.append(abrufHinweis(e.art, e.text));
}

/** Hinweis mit Text, Link zum Schulmanager und einer zugeklappten Kurzanleitung zum Lesezeichen. */
function abrufHinweis(art, text) {
  const hilfe = el("div", { class: "abruf-hilfe", id: "abruf-hilfe", hidden: !zustand.abrufHilfeOffen },
    el("ol", {},
      el("li", { text: "Schulmanager öffnen und einloggen." }),
      el("li", { text: lesezeichenSchritt() }),
      el("li", { text: "Danach öffnet sich diese App mit den neuen Einträgen." }),
    ),
    el("p", {}, "Noch kein Lesezeichen angelegt? ", el("a", { href: "./install.html" }, "Anleitung")),
  );
  const knopf = el("button", {
    type: "button", class: "textknopf", "aria-expanded": String(zustand.abrufHilfeOffen), "aria-controls": "abruf-hilfe",
    onclick: () => {
      zustand.abrufHilfeOffen = !zustand.abrufHilfeOffen;
      knopf.setAttribute("aria-expanded", String(zustand.abrufHilfeOffen));
      hilfe.hidden = !zustand.abrufHilfeOffen;
    },
  }, "Wie geht das?");
  return el("div", { class: `hinweis ${art}` },
    el("p", { text }),
    el("div", { class: "aktionen" },
      el("a", { href: `${SCHULMANAGER_ORIGIN}/`, target: "_blank", rel: "noopener" }, "Schulmanager öffnen"),
      knopf,
    ),
    hilfe,
  );
}

// ---- Archiv ----------------------------------------------------------------
//
// Das Archiv beginnt mit der Kursliste, eine Zeile je Kurs. Antippen öffnet die Kursseite
// (filter.kurs). Suche und Filter gibt es auf beiden Ebenen: in der Kursliste wirken sie über
// alle Kurse, dann steht dort das Ergebnis nach Kurs gruppiert. Beim Wechsel zwischen Liste und
// Kursseite beginnen Suche und Filter leer. Neueste Einträge stehen oben; grenzen Suche oder
// Zeitraum nicht ein, ist je Kurs nur der neueste Monat offen.

function renderArchivKopf() {
  const box = $("archiv-kopf");
  box.textContent = "";
  const { kurs } = zustand.filter;
  const name = kurs ? anzeigename(kurs, zustand.bestand.kursAlias) : "";
  box.hidden = !kurs;
  if (kurs) seitenKopf(box, "Archiv", zurKursliste, name);
  const suche = $("suche");
  suche.placeholder = kurs ? `In ${name} suchen` : "In allen Kursen suchen";
  suche.setAttribute("aria-label", kurs ? `Suche in ${name}` : "Suche in allen Kursen");
}

function kursOeffnen(kurs) {
  archivEbene(kurs);
  $("archiv-kopf").querySelector("h2").focus({ preventScroll: true });
}

function zurKursliste() {
  archivEbene(null);
  $("suche").focus({ preventScroll: true });
}

function archivEbene(kurs) {
  zustand.filter = { ...FILTER_LEER(), kurs };
  zustand.filterOffen = false;
  renderArchivKopf();
  renderFilter();
  renderListe();
  window.scrollTo(0, 0);
}

// ---- Archiv: Suche und Filter ----------------------------------------------
//
// In der Leiste stehen nur Suche und der Filter-Knopf. Zeitraum und „Mit Hausaufgabe“ liegen im
// Bereich darunter, der sich per Knopf öffnet. Ist er zu, zeigen Marken, welche Filter wirken;
// Antippen einer Marke nimmt den Filter weg.

/** Filter aus dem Bereich, die gerade wirken. Suche und Kurs sieht man ohnehin, sie zählen nicht. */
function aktiveFilter() {
  const { filter } = zustand;
  const { klausurschnitt } = zustand.bestand;
  const liste = [];
  if (filter.zeitraum === "klausur") {
    const datum = filter.kurs ? klausurschnitt[filter.kurs] : "";
    liste.push({ text: datum ? `Seit Klausur am ${datumLesbar(datum)}` : "Seit letzter Klausur", weg: () => zeitraumSetzen("alles") });
  } else if (filter.zeitraum === "ab" && filter.abDatum) {
    liste.push({ text: `Ab ${datumLesbar(filter.abDatum)}`, weg: () => zeitraumSetzen("alles") });
  }
  if (filter.nurHausaufgabe) liste.push({ text: "Mit Hausaufgabe", weg: () => hausaufgabeSetzen(false) });
  return liste;
}

function zeitraumSetzen(wert) {
  const { filter } = zustand;
  filter.zeitraum = wert;
  filter.seitKlausur = wert === "klausur";
  if (wert !== "ab") filter.abDatum = "";
  renderFilter();
  renderListe();
}

function hausaufgabeSetzen(an) {
  zustand.filter.nurHausaufgabe = an;
  renderFilter();
  renderListe();
}

/** Knöpfe nebeneinander, der gewählte ist gedrückt. optionen: [[wert, text], …] */
function segment(label, optionen, aktuell, waehlen) {
  return el("div", { class: "segment", role: "group", "aria-label": label },
    optionen.map(([wert, text]) => el("button", {
      type: "button", "aria-pressed": String(aktuell === wert), onclick: () => waehlen(wert),
    }, text)));
}

function renderFilter() {
  if ($("suche").value !== zustand.filter.suche) $("suche").value = zustand.filter.suche;
  renderFilterKnopf();
  renderFilterBereich();
  renderFilterMarken();
}

function renderFilterKnopf() {
  const n = aktiveFilter().length;
  const knopf = $("filter-knopf");
  knopf.textContent = "";
  knopf.append("Filter");
  if (n) knopf.append(el("span", { class: "n", "aria-hidden": "true", text: String(n) }));
  knopf.setAttribute("aria-label", n ? `Filter, ${n} aktiv` : "Filter");
  knopf.setAttribute("aria-expanded", String(zustand.filterOffen));
}

function renderFilterMarken() {
  const box = $("filter-aktiv");
  box.textContent = "";
  const marken = aktiveFilter();
  box.hidden = zustand.filterOffen || !marken.length;
  for (const m of marken) {
    box.append(el("button", { type: "button", "aria-label": `${m.text}, Filter entfernen`, onclick: m.weg },
      m.text, el("span", { class: "x", "aria-hidden": "true", text: "×" })));
  }
}

function renderFilterBereich() {
  const box = $("filter");
  box.textContent = "";
  const { filter } = zustand;
  box.hidden = !zustand.filterOffen;
  if (box.hidden) return;

  box.append(el("div", { class: "filter-zeile" },
    el("span", { class: "filter-titel", text: "Zeitraum" }),
    segment("Zeitraum", [["alles", "Alles"], ["klausur", "Seit Klausur"], ["ab", "Ab Datum"]], filter.zeitraum, zeitraumSetzen)));
  if (filter.zeitraum === "ab") box.append(abDatumFeld());
  if (filter.zeitraum === "klausur") box.append(klausurFeld());

  box.append(el("div", { class: "filter-zeile" },
    el("span", { class: "filter-titel", text: "Einträge" }),
    segment("Einträge", [[false, "Alle"], [true, "Mit Hausaufgabe"]], filter.nurHausaufgabe, hausaufgabeSetzen)));

  const zuruecksetzen = () => {
    Object.assign(filter, { zeitraum: "alles", abDatum: "", seitKlausur: false, nurHausaufgabe: false });
    renderFilter();
    renderListe();
  };
  box.append(el("div", { class: "knopfreihe" },
    el("button", { type: "button", onclick: () => { zustand.filterOffen = false; renderFilter(); $("filter-knopf").focus(); } }, "Fertig"),
    filter.zeitraum !== "alles" || filter.nurHausaufgabe ? el("button", { type: "button", onclick: zuruecksetzen }, "Zurücksetzen") : null));
}

/** Datumsfeld unter „Ab Datum“. Aktualisiert nur Knopf und Liste, damit der Fokus im Feld bleibt. */
function abDatumFeld() {
  const { filter } = zustand;
  const eingabe = el("input", { type: "date", value: filter.abDatum, "aria-label": "Ab Datum" });
  eingabe.addEventListener("change", () => {
    filter.abDatum = eingabe.value;
    renderFilterKnopf();
    renderListe();
  });
  return el("div", { class: "filter-unter" }, el("label", { class: "feld" }, el("span", { text: "Ab" }), eingabe));
}

/** Unter „Seit Klausur“: auf der Kursseite dessen Klausurdatum (dasselbe wie unter Einstellungen → Kurse), in der Kursliste der Stand. */
function klausurFeld() {
  const { filter } = zustand;
  const { klausurschnitt, kursAlias, eintraege } = zustand.bestand;
  const box = el("div", { class: "filter-unter" });
  if (!filter.kurs) {
    const alle = Object.keys(kurseZaehlen(eintraege));
    const mitDatum = alle.filter((k) => klausurschnitt[k]).length;
    box.append(el("p", { class: "info", text: `Je Kurs ab dem eingetragenen Klausurdatum. ${mitDatum} von ${alle.length} Kursen haben eins. Eintragen lässt es sich im Filter auf der Seite des Kurses oder unter Einstellungen → Kurse.` }));
    return box;
  }
  const kurs = filter.kurs;
  const name = anzeigename(kurs, kursAlias);
  const info = el("p", { class: "info" });
  const infoSetzen = () => {
    info.textContent = klausurschnitt[kurs]
      ? `Zeigt Einträge ab dem ${datumLesbar(klausurschnitt[kurs])}.`
      : "Noch kein Klausurdatum für diesen Kurs. Datum eintragen, dann wirkt der Filter.";
  };
  const eingabe = el("input", { type: "date", value: klausurschnitt[kurs] || "", "aria-label": `Klausurdatum für ${name}` });
  eingabe.addEventListener("change", () => {
    if (eingabe.value) klausurschnitt[kurs] = eingabe.value;
    else delete klausurschnitt[kurs];
    speichern();
    infoSetzen();
    renderListe();
  });
  infoSetzen();
  box.append(el("label", { class: "feld" }, el("span", { text: `${name}: Klausur am` }), eingabe), info);
  return box;
}

function hervorheben(text, begriff) {
  const frag = document.createDocumentFragment();
  for (const teil of zerlegen(text, begriff)) {
    frag.append(teil.treffer ? el("mark", { text: teil.text }) : document.createTextNode(teil.text));
  }
  return frag;
}

function renderListe() {
  const ausgabe = $("ausgabe");
  ausgabe.textContent = "";
  const { bestand, filter } = zustand;

  if (!bestand.eintraege.length) {
    ausgabe.append(leerHinweis());
    return;
  }

  // Kursliste ohne Suche und Filter: nur eine Zeile je Kurs, die Einträge stehen auf der Kursseite.
  if (!filter.kurs && !filter.suche.trim() && !aktiveFilter().length) {
    ausgabe.append(gruppe(kursListe(bestand.eintraege, bestand.kursAlias).map((k) =>
      zeile(k.name, k.text, () => kursOeffnen(k.kurs)))));
    return;
  }

  const treffer = filtern(bestand.eintraege, filter, bestand.klausurschnitt);
  if (!treffer.length) {
    const zuruecksetzen = () => {
      zustand.filter = { ...FILTER_LEER(), kurs: filter.kurs };
      renderFilter();
      renderListe();
    };
    ausgabe.append(el("div", { class: "leer-hinweis" },
      el("p", { text: "Keine Einträge für diese Auswahl." }),
      el("div", { class: "knoepfe" }, el("button", { type: "button", onclick: zuruecksetzen }, "Alles zurücksetzen"))));
    return;
  }

  const gruppen = gruppieren(treffer, bestand.kursAlias);
  const zuklappen = !eingegrenzt(filter, bestand.klausurschnitt);
  if (!filter.kurs) ausgabe.append(el("p", { class: "treffer", text: trefferZeile(gruppen) }));
  for (const g of gruppen) ausgabe.append(kursAbschnitt(g, { titel: !filter.kurs, zuklappen }));
}

/** Einträge eines Kurses nach Monaten. titel: Kursname als Überschrift (Ergebnis aus allen Kursen). */
function kursAbschnitt(g, { titel, zuklappen }) {
  const { suche } = zustand.filter;
  const block = el("section", { class: "kursblock" },
    titel ? el("h2", { text: g.name }) : null,
    el("div", { class: "spanne", text: `${anzahlText(g.anzahl)} · ${datumLesbar(g.von)} bis ${datumLesbar(g.bis)}` }));
  g.monate.forEach((monat, i) => {
    const liste = el("div", {}, monat.eintraege.map((e) => eintragZeile(e, suche)));
    if (!zuklappen) {
      block.append(el("div", { class: "monat", text: monat.name }), liste);
      return;
    }
    const schluessel = `${g.kurs}|${monat.schluessel}`;
    const offen = zustand.monatAuf[schluessel] ?? i === 0;
    liste.hidden = !offen;
    const knopf = el("button", {
      type: "button", class: "monat-knopf", "aria-expanded": String(offen),
      onclick: () => {
        const auf = liste.hidden;
        liste.hidden = !auf;
        knopf.setAttribute("aria-expanded", String(auf));
        zustand.monatAuf[schluessel] = auf;
      },
    },
    el("span", { class: "monat-name", text: monat.name }),
    el("span", { class: "monat-n", text: anzahlText(monat.eintraege.length) }),
    el("span", { class: "monat-pfeil", "aria-hidden": "true", text: "›" }));
    block.append(knopf, liste);
  });
  return block;
}

function eintragZeile(e, suche) {
  const eigen = istEigen(e);
  const inhalt = el("div", { class: "inhalt" });
  if (e.thema) inhalt.append(el("div", { class: "thema" }, hervorheben(e.thema, suche)));
  else if (!eigen) inhalt.append(el("div", { class: "thema leer", text: "Kein Inhalt eingetragen" }));
  if (e.hausaufgabe) inhalt.append(el("div", { class: "ha" }, el("b", { text: "Hausaufgabe: " }), hervorheben(e.hausaufgabe, suche)));
  if (eigen) {
    inhalt.append(el("div", { class: "eigen" }, `Selbst eingetragen · ${e.bis ? `bis ${wochentag(e.bis)} · ` : ""}`, el("button", {
      type: "button", class: "textknopf", "aria-label": `Selbst eingetragene Hausaufgabe vom ${wochentag(e.datum)} ändern`,
      onclick: () => bearbeitenOeffnen(e.id, "archiv"),
    }, "Ändern")));
  }
  return el("div", { class: "eintrag" }, el("div", { class: "wann", text: wochentag(e.datum) }), inhalt);
}

// ---- Vorschau --------------------------------------------------------------

function renderVorschau() {
  const box = $("vorschau");
  box.textContent = "";
  const { bestand } = zustand;
  const jetzt = new Date();
  const heute = isoDatum(jetzt);
  const einst = mitStandard(bestand.einstellungen);

  if (!bestand.eintraege.length && !Object.keys(bestand.stundenplan.tage).length) {
    box.append(leerHinweis());
    return;
  }

  const digest = baueDigest(jetzt, { ...bestand, datum: zustand.vorschauDatum });

  if (!digest.datum) {
    box.append(el("div", { class: "leer-hinweis" },
      el("h2", { text: digest.label }),
      el("p", { text: "Entweder sind alle Tage als frei eingetragen, oder das Archiv hat für keinen Wochentag genug Einträge. Kurse lassen sich je Wochentag fest setzen." }),
      el("div", { class: "knoepfe" }, el("button", { type: "button", onclick: () => ansichtWechseln("einstellungen", ["vorschau", "wochenplan"]) }, "Wochenplan")),
    ));
    return;
  }

  const planFuer = planFunktion(bestand, heute);
  const nachbar = (richtung) => schultagSuchen(datumPlus(digest.datum, richtung), richtung, planFuer, einst.freieTage);
  const pfeil = (richtung, label) => {
    const ziel = nachbar(richtung);
    return el("button", {
      type: "button", class: "pfeil", "aria-label": label, disabled: !ziel,
      onclick: () => { zustand.vorschauDatum = ziel; renderVorschau(); },
    }, richtung < 0 ? "‹" : "›");
  };

  box.append(el("div", { class: "vorschau-kopf" },
    pfeil(-1, "Vorheriger Schultag"),
    el("div", { class: "vorschau-titel" },
      el("h2", { text: digest.label }),
      el("p", { class: "unterzeile", text: digestKopfzeile(digest) }),
    ),
    pfeil(1, "Nächster Schultag"),
  ));
  box.append(el("p", { class: "herkunft", text: herkunftZeile(digest, bestand.stundenplan, jetzt, einst) }));

  // Abrufstand leise unter der Herkunft. Fehler und Rückstand stehen als Erinnerung oben (renderErinnerung).
  const sync = syncZeile(digest, bestand.stundenplan, bestand.sync, jetzt, einst);
  if (sync && sync.art !== "fehler") {
    box.append(el("p", { class: `herkunft${sync.art === "warn" ? " alt" : ""}`, text: sync.text }));
  }

  if (zustand.vorschauDatum) {
    box.append(el("div", { class: "knopfreihe mitte" },
      el("button", { type: "button", onclick: () => { zustand.vorschauDatum = null; renderVorschau(); } }, "Zum nächsten Schultag")));
  }

  if (!digest.kurse.length && !digest.entfallen.length) {
    box.append(el("p", { class: "leer-hinweis", text: "Kein Unterricht an diesem Tag." }));
  }
  // Entfall als eigene Karte an der Stelle im Tag, wo der Kurs gewesen wäre.
  for (const { art, kurs: k } of tagesablauf(digest)) {
    box.append(art === "entfall" ? entfallKarte(k) : k.zuordnungFehlt ? zuordnungKarte(k) : kursKarte(k));
  }
}

function kursKarte(k) {
  const kopf = el("div", { class: "karte-kopf" }, el("h3", { text: k.name }));
  if (k.status === "vertretung") kopf.append(el("span", { class: "marke", text: "Vertretung" }));
  if (k.luecke) kopf.append(el("span", { class: "marke", text: "Letzte Stunde fehlt" }));
  if (k.sicherheit === "unsicher") kopf.append(el("span", { class: "marke leise", text: "unsicher" }));
  const karte = el("article", { class: "karte" }, kopf);
  // Aufgaben zur nächsten Stunde zusammen, jede mit Abgabedatum einzeln mit leisem „bis …“.
  const hausaufgaben = k.hausaufgaben || [];
  const ohneBis = hausaufgaben.filter((h) => !h.bis).map((h) => h.text).join("\n");
  if (ohneBis) karte.append(el("div", { class: "karte-ha" }, el("b", { text: "Hausaufgabe: " }), ohneBis));
  for (const h of hausaufgaben.filter((h) => h.bis)) {
    karte.append(el("div", { class: "karte-ha" }, el("b", { text: "Hausaufgabe: " }), h.text, el("span", { class: "bis", text: `bis ${wochentag(h.bis)}` })));
  }
  if (k.thema) karte.append(el("p", { class: "karte-thema", text: k.thema }));
  else if (k.letztesDatum && k.selbst !== "alle") karte.append(el("p", { class: "karte-thema leer", text: "Kein Inhalt eingetragen" }));
  if (k.letztesDatum) {
    karte.append(el("p", { class: "karte-meta" }, `Zuletzt ${wochentag(k.letztesDatum)} · `,
      el("span", { class: k.alt ? "alt" : null, text: vorTagenText(k.vorTagen) }),
      k.selbst ? ` · ${k.selbst === "alle" ? "selbst eingetragen" : "teils selbst eingetragen"}` : null));
  } else {
    karte.append(el("p", { class: "karte-meta", text: "Noch kein Eintrag im Archiv" }));
  }
  return karte;
}

/** Entfallender Kurs: kompakt, aber farbig, damit er beim Überfliegen auffällt. */
function entfallKarte(k) {
  return el("article", { class: "karte entfall" },
    el("div", { class: "karte-kopf" }, el("h3", {}, el("s", { text: k.name })), el("span", { class: "marke entfall", text: "Entfällt" })));
}

/**
 * Auswahlfeld „Kurs im Archiv“ für ein Fach aus dem Stundenplan. Eine Stelle für Vorschau-Karte
 * und Einstellungen, damit beide dasselbe tun: Kurs setzen, „Nicht anzeigen“ (kurs: null) oder
 * Zuordnung löschen. Jede Wahl hier gilt als manuell und bestätigt.
 */
function zuordnungAuswahl(fach, nachher) {
  const { bestand } = zustand;
  const zu = bestand.kurszuordnung[fach] || null;
  const kurse = kurseSortiert(Object.keys(kurseZaehlen(bestand.eintraege)), bestand.kursAlias);
  if (zu && zu.kurs && !kurse.includes(zu.kurs)) kurse.push(zu.kurs);   // zugeordnet, aber (noch) ohne Eintrag
  const auswahl = el("select", { "aria-label": `Kurs im Archiv für ${fach}` },
    el("option", { value: "", text: "Kurs im Archiv wählen" }),
    kurse.map((kurs) => el("option", { value: "k:" + kurs, text: anzeigename(kurs, bestand.kursAlias) })),
    el("option", { value: "aus", text: "Nicht anzeigen" }));
  auswahl.value = zu ? (zu.kurs === null ? "aus" : "k:" + zu.kurs) : "";
  auswahl.addEventListener("change", () => {
    const v = auswahl.value;
    if (v === "aus") bestand.kurszuordnung[fach] = { kurs: null, quelle: "manuell", bestaetigt: true };
    else if (v.startsWith("k:")) bestand.kurszuordnung[fach] = { kurs: v.slice(2), quelle: "manuell", bestaetigt: true };
    else delete bestand.kurszuordnung[fach];
    speichern();
    nachher();
  });
  return auswahl;
}

/** Fach aus dem Stundenplan, das noch keinem Archiv-Kurs zugeordnet ist. */
function zuordnungKarte(k) {
  return el("article", { class: "karte" },
    el("div", { class: "karte-kopf" }, el("h3", { text: k.name }), el("span", { class: "marke leise", text: "nicht zugeordnet" })),
    el("div", { class: "zeile-eingabe" }, zuordnungAuswahl(k.fach, renderVorschau)),
  );
}

// ---- Eintragen -------------------------------------------------------------
//
// Hausaufgaben, die nicht im Schulmanager stehen, selbst notieren. Eigene Einträge sind normale
// Einträge (kern/mergen.js) und stehen danach in Archiv und Vorschau. Oben stehen die Kurse des
// Tages ohne Hausaufgabe als Vorschläge, darunter das Formular, am Ende die zuletzt selbst
// eingetragenen. Mit zustand.bearbeiten ändert dieselbe Seite einen eigenen Eintrag.

function renderEintragen() {
  const box = $("eintragen");
  box.textContent = "";
  const { bestand } = zustand;
  const b = zustand.bearbeiten;
  const alt = b ? bestand.eintraege.find((e) => e.id === b.id && istEigen(e)) : null;
  if (b && !alt) zustand.bearbeiten = null;

  if (!alt && !bestand.eintraege.length && !Object.keys(bestand.stundenplan.tage).length) {
    box.append(leerHinweis());
    return;
  }

  // Beim Ändern gelten die Werte nur auf dieser Seite, beim Neuanlegen landen sie im Entwurf.
  const werte = alt
    ? { kurs: alt.kurs, hausaufgabe: alt.hausaufgabe, datum: alt.datum, bis: alt.bis || "" }
    : { ...zustand.entwurf, datum: zustand.entwurf.datum || eintragDatum(new Date(), bestand.einstellungen), bis: zustand.entwurf.bis || "" };
  const merken = (feld, wert) => {
    werte[feld] = wert;
    if (!alt) zustand.entwurf[feld] = wert;
  };
  const tagText = (datum) => (datum === heuteIso() ? "Heute" : `Am ${wochentag(datum)}`);

  if (alt) {
    seitenKopf(box, b.zurueck === "archiv" ? "Archiv" : "Eintragen", bearbeitenBeenden, "Eintrag ändern");
  } else {
    box.append(el("h2", { class: "eintragen-titel", text: "Hausaufgabe eintragen" }),
      el("p", { class: "info", text: "Für Hausaufgaben, die nicht im Schulmanager stehen." }));
  }

  const vorschlaege = el("div", { class: "vorschlaege" });
  const auswahl = el("select", { id: "eintrag-kurs", "aria-describedby": "eintrag-kurs-fehlt" });
  const text = el("textarea", { id: "eintrag-ha", rows: "3", autocapitalize: "sentences", "aria-describedby": "eintrag-ha-fehlt" });
  const datum = el("input", { type: "date", id: "eintrag-datum", value: werte.datum });
  const kursFehlt = el("p", { class: "fehlt", id: "eintrag-kurs-fehlt", text: "Kurs wählen.", hidden: true });
  const textFehlt = el("p", { class: "fehlt", id: "eintrag-ha-fehlt", text: "Hausaufgabe eingeben.", hidden: true });
  const bisKnoepfe = el("div", { class: "chips", role: "group", "aria-label": "Abgabe" });
  const bisFeld = el("input", { type: "date", id: "eintrag-bis", "aria-describedby": "eintrag-bis-falsch eintrag-bis-info" });
  const bisFalsch = el("p", { class: "fehlt", id: "eintrag-bis-falsch", text: "Abgabe muss nach dem Aufgabetag liegen.", hidden: true });
  const bisInfo = el("p", { class: "info", id: "eintrag-bis-info" });
  let ohneZuordnung = new Map();   // Kurs → gleichnamiges Fach im Stundenplan, das noch keinem Kurs zugeordnet ist

  function kursSetzen(kurs) {
    auswahl.value = kurs;
    merken("kurs", auswahl.value);
    if (auswahl.value) kursFehlt.hidden = true;
    vorschlaegeFuellen();
    bisFuellen();
  }

  // Abgabedatum: leer heißt „Nächste Stunde“. Knöpfe für die nächsten Stunden des Kurses, sonst Kalender.
  function bisFuellen() {
    const hatteFokus = bisKnoepfe.contains(document.activeElement);
    bisFeld.value = werte.bis;
    bisFeld.min = datumPlus(werte.datum, 1);
    bisFalsch.hidden = !werte.bis || werte.bis > werte.datum;
    bisInfo.textContent = werte.bis ? "Die Vorschau zeigt sie in jeder Stunde bis zur Abgabe." : "Die Vorschau zeigt sie zur nächsten Stunde des Kurses.";
    const knopf = (wert, beschriftung) => el("button", {
      type: "button", "aria-pressed": String(werte.bis === wert), onclick: () => { merken("bis", wert); bisFuellen(); },
    }, beschriftung);
    bisKnoepfe.textContent = "";
    bisKnoepfe.append(knopf("", "Nächste Stunde"),
      ...naechsteStunden(zustand.bestand, werte.kurs, werte.datum, heuteIso()).map((d) => knopf(d, wochentag(d))));
    if (hatteFokus) bisKnoepfe.querySelector('[aria-pressed="true"]')?.focus();
  }

  function auswahlFuellen() {
    const { amTag, weitere } = kurseZumEintragen(zustand.bestand, werte.datum, heuteIso());
    if (werte.kurs && ![...amTag, ...weitere].some((k) => k.kurs === werte.kurs)) {
      weitere.push({ kurs: werte.kurs, name: anzeigename(werte.kurs, zustand.bestand.kursAlias), fach: null });
    }
    ohneZuordnung = new Map([...amTag, ...weitere].filter((k) => k.fach).map((k) => [k.kurs, k.fach]));
    const option = (k) => el("option", { value: k.kurs, text: k.name });
    auswahl.textContent = "";
    auswahl.append(el("option", { value: "", text: "Kurs wählen" }));
    if (amTag.length) {
      auswahl.append(el("optgroup", { label: tagText(werte.datum) }, amTag.map(option)));
      if (weitere.length) auswahl.append(el("optgroup", { label: "Weitere Kurse" }, weitere.map(option)));
    } else {
      auswahl.append(...weitere.map(option));
    }
    auswahl.value = werte.kurs;
    if (auswahl.value !== werte.kurs) merken("kurs", auswahl.value);
  }

  // Kurse des Tages ohne Hausaufgabe. Vor dem Abruf weiß die App nur, dass im Archiv nichts steht.
  function vorschlaegeFuellen() {
    vorschlaege.textContent = "";
    const r = alt ? null : kurseOhneHausaufgabe(new Date(), zustand.bestand, werte.datum);
    vorschlaege.hidden = !r || !r.kurse.length;
    if (vorschlaege.hidden) return;
    vorschlaege.append(
      el("p", { class: "vorschlaege-titel", text: `${tagText(r.datum)} ohne Hausaufgabe${r.abgerufen ? " im Schulmanager" : ""}` }),
      el("div", { class: "chips", role: "group", "aria-label": "Kurs übernehmen" }, r.kurse.map((k) => el("button", {
        type: "button", "aria-pressed": String(werte.kurs === k.kurs),
        onclick: () => { kursSetzen(k.kurs); text.focus(); },
      }, k.name))),
    );
    if (!r.abgerufen) vorschlaege.append(el("p", { class: "info", text: "Noch nicht abgerufen. Im Schulmanager kann schon etwas stehen." }));
  }

  auswahl.addEventListener("change", () => kursSetzen(auswahl.value));
  text.value = werte.hausaufgabe;
  text.addEventListener("input", () => {
    merken("hausaufgabe", text.value);
    if (text.value.trim()) textFehlt.hidden = true;
  });
  datum.addEventListener("change", () => {
    if (!datum.value) { datum.value = werte.datum; return; }   // leeres Datum zurücknehmen
    merken("datum", datum.value);
    auswahlFuellen();
    vorschlaegeFuellen();
    bisFuellen();
  });
  bisFeld.addEventListener("change", () => {
    merken("bis", bisFeld.value);
    bisFuellen();
  });

  const speichernKnopf = el("button", { type: "button", class: "primaer", onclick: () => {
    const felder = { kurs: auswahl.value, datum: werte.datum, hausaufgabe: text.value, bis: werte.bis };
    kursFehlt.hidden = !!felder.kurs;
    textFehlt.hidden = !!felder.hausaufgabe.trim();
    bisFalsch.hidden = !felder.bis || felder.bis > felder.datum;
    if (!felder.kurs) return auswahl.focus();
    if (!felder.hausaufgabe.trim()) return text.focus();
    if (!bisFalsch.hidden) return bisFeld.focus();
    const best = zustand.bestand;
    let r;
    try {
      const jetzt = new Date().toISOString();
      r = alt ? eigenenEintragAendern(best.eintraege, alt.id, felder, heuteIso(), jetzt) : eigenenEintragAnlegen(best.eintraege, felder, heuteIso(), jetzt);
    } catch (fehler) {
      melden("fehler", fehler.message);
      return;
    }
    if (r.eintraege === best.eintraege) return bearbeitenBeenden();   // nichts geändert
    best.eintraege = r.eintraege;
    const fach = ohneZuordnung.get(felder.kurs);
    if (fach && !Object.prototype.hasOwnProperty.call(best.kurszuordnung, fach)) {
      best.kurszuordnung[fach] = { kurs: felder.kurs, quelle: "manuell", bestaetigt: true };
    }
    speichern();
    const wo = `${anzeigename(r.eintrag.kurs, best.kursAlias)}, ${wochentag(r.eintrag.datum)}`;
    if (alt) {
      melden("ok", `Geändert: ${wo}`);   // wochentag() endet schon mit einem Punkt
      bearbeitenBeenden();
    } else {
      zustand.entwurf = ENTWURF_LEER();
      melden("ok", `Gespeichert: ${wo}`);
      renderEintragen();
    }
  } }, "Speichern");

  const loeschenKnopf = alt ? el("button", { type: "button", class: "gefahr", onclick: () => {
    if (!window.confirm("Diesen selbst eingetragenen Eintrag löschen?")) return;
    zustand.bestand.eintraege = eigenenEintragLoeschen(zustand.bestand.eintraege, alt.id);
    speichern();
    melden("ok", `Gelöscht: ${anzeigename(alt.kurs, zustand.bestand.kursAlias)}, ${wochentag(alt.datum)}`);
    bearbeitenBeenden();
  } }, "Löschen") : null;

  auswahlFuellen();
  vorschlaegeFuellen();
  bisFuellen();
  const feld = (id, titel, eingabe, ...rest) => el("div", { class: "formfeld" }, el("label", { for: id, text: titel }), eingabe, ...rest);
  box.append(
    vorschlaege,
    feld("eintrag-kurs", "Kurs", auswahl, kursFehlt),
    feld("eintrag-ha", "Hausaufgabe", text, textFehlt),
    feld("eintrag-datum", "Aufgegeben am", datum),
    feld("eintrag-bis", "Bis (freiwillig)", bisKnoepfe, bisFeld, bisFalsch, bisInfo),
    el("div", { class: "knopfreihe" }, speichernKnopf, loeschenKnopf),
  );

  if (alt) return;
  const eigene = eigeneEintraege(bestand.eintraege).slice(0, 5);
  if (!eigene.length) return;
  box.append(el("h3", { text: "Selbst eingetragen" }), gruppe(eigene.map((e) =>
    zeile(e.hausaufgabe.split("\n")[0], `${anzeigename(e.kurs, bestand.kursAlias)} · ${wochentag(e.datum)}${e.bis ? ` · bis ${wochentag(e.bis)}` : ""}`, () => bearbeitenOeffnen(e.id, "eintragen")))));
}

/** Selbst eingetragenen Eintrag ändern. zurueck: "archiv" (dorthin, wo er stand) oder "eintragen". */
function bearbeitenOeffnen(id, zurueck) {
  zustand.bearbeiten = { id, zurueck, scroll: window.scrollY };
  ansichtWechseln("eintragen");
  window.scrollTo(0, 0);
  const titel = $("eintragen").querySelector(".seitenkopf h2");
  if (titel) titel.focus({ preventScroll: true });
}

function bearbeitenBeenden() {
  const b = zustand.bearbeiten;
  const insArchiv = !!b && b.zurueck === "archiv";
  zustand.bearbeiten = null;
  ansichtWechseln(insArchiv ? "archiv" : "eintragen");
  window.scrollTo(0, insArchiv ? b.scroll : 0);
}

// ---- Einstellungen ---------------------------------------------------------
//
// Übersicht mit einer Zeile je Thema und dem Zustand als Zusammenfassung, Details auf
// Unterseiten. zustand.seite ist der Pfad: [] Übersicht, ["kurse"], ["kurse", kurs],
// ["vorschau"], ["vorschau", "wochenplan" | "frei" | "faecher"], ["daten"].

function renderEinstellungen() {
  const box = $("einstellungen");
  box.textContent = "";
  const [thema, unter] = zustand.seite;
  if (thema === "kurse") return unter === undefined ? seiteKurse(box) : seiteKurs(box, unter);
  if (thema === "vorschau" && unter === "wochenplan") return seiteWochenplan(box);
  if (thema === "vorschau" && unter === "frei") return seiteFreieTage(box);
  if (thema === "vorschau" && unter === "faecher") return seiteFaecher(box);
  if (thema === "vorschau") return seiteVorschau(box);
  if (thema === "daten") return seiteDaten(box);
  if (thema === "abgleich") return seiteAbgleich(box);
  return seiteUebersicht(box);
}

function seiteOeffnen(pfad) {
  zustand.seite = pfad;
  renderEinstellungen();
  window.scrollTo(0, 0);
  const titel = $("einstellungen").querySelector(".seitenkopf h2");
  if (titel) titel.focus({ preventScroll: true });
}

/** Zurück-Knopf mit dem Namen der Seite darüber, darunter der Titel. Gibt den Titel zurück. */
function seitenKopf(box, zurueckName, zurueck, titel) {
  const h = el("h2", { text: titel, tabindex: "-1" });
  box.append(el("div", { class: "seitenkopf" },
    el("button", { type: "button", class: "zurueck", onclick: zurueck }, `‹ ${zurueckName}`), h));
  return h;
}

const gruppe = (...zeilen) => el("div", { class: "einst-gruppe" }, zeilen);

/**
 * Zeile einer Gruppe: Titel, darunter leise der Zustand. aktion ist eine Funktion (Knopf) oder
 * ein Link-Ziel. Mit pfeil führt die Zeile auf eine Unterseite.
 */
function zeile(titel, wert, aktion, { pfeil = true, klasse = "" } = {}) {
  const inhalt = [
    el("span", { class: "einst-text" },
      el("span", { class: "einst-titel", text: titel }),
      wert ? el("span", { class: "einst-wert", text: wert }) : null),
    pfeil ? el("span", { class: "einst-pfeil", "aria-hidden": "true", text: "›" }) : null,
  ];
  const cls = klasse ? `einst-zeile ${klasse}` : "einst-zeile";
  return typeof aktion === "string"
    ? el("a", { class: cls, href: aktion }, inhalt)
    : el("button", { type: "button", class: cls, onclick: aktion }, inhalt);
}

/** Zeile mit Bedienelement rechts, ohne Unterseite. */
const zeileMit = (titel, ...rechts) => el("div", { class: "einst-zeile" },
  el("span", { class: "einst-text" }, el("span", { class: "einst-titel", text: titel })),
  el("div", { class: "einst-rechts" }, rechts));

function seiteUebersicht(box) {
  const { bestand } = zustand;
  const einst = bestand.einstellungen;
  seitenKopf(box, ANSICHT_NAMEN[zustand.vorher] || "Archiv", () => ansichtWechseln(zustand.vorher), "Einstellungen");

  if (zustand.speicherFehler) {
    box.append(el("div", { class: "meldung fehler" }, el("div", { class: "text" }, el("p", { text: zustand.speicherFehler }))));
  }

  const start = (wert, text) => el("button", {
    type: "button", "aria-pressed": String(einst.startReiter === wert),
    onclick: () => { einst.startReiter = wert; speichern(); renderEinstellungen(); },
  }, text);

  box.append(gruppe(
    zeileMit("Beim Öffnen", el("div", { class: "segment", role: "group", "aria-label": "Ansicht beim Öffnen" }, start("archiv", "Archiv"), start("vorschau", "Vorschau"))),
    zeile("Kurse", kurseZusammenfassung(bestand), () => seiteOeffnen(["kurse"])),
    zeile("Vorschau", vorschauZusammenfassung(einst), () => seiteOeffnen(["vorschau"])),
    zeile("Daten", datenZusammenfassung(bestand), () => seiteOeffnen(["daten"])),
    abgleichMoeglich() && (abgleich.status || abgleich.frei)
      ? zeile("Abgleich", abgleichZusammenfassung(abgleich.status, new Date()), () => seiteOeffnen(["abgleich"]),
        { klasse: abgleich.status && abgleich.status.fehler ? "warn" : "" })
      : null,
  ));
  box.append(gruppe(zeile("Archiv löschen", null, archivLoeschen, { pfeil: false, klasse: "gefahr" })));
}

function seiteKurse(box) {
  const { bestand } = zustand;
  const kurse = kurseSortiert(Object.keys(kurseZaehlen(bestand.eintraege)), bestand.kursAlias);
  seitenKopf(box, "Einstellungen", () => seiteOeffnen([]), "Kurse");
  if (!kurse.length) {
    box.append(el("p", { text: "Noch keine Kurse. Erst Daten abrufen oder importieren." }));
    return;
  }
  box.append(el("p", { text: "Anzeigename und Datum der letzten Klausur je Kurs." }));
  box.append(gruppe(kurse.map((kurs) => {
    const teile = [];
    if (bestand.kursAlias[kurs]) teile.push(kurs);
    if (bestand.klausurschnitt[kurs]) teile.push(`Klausur ${datumLesbar(bestand.klausurschnitt[kurs])}`);
    return zeile(anzeigename(kurs, bestand.kursAlias), teile.join(" · "), () => seiteOeffnen(["kurse", kurs]));
  })));
}

function seiteKurs(box, kurs) {
  const { bestand } = zustand;
  const titel = seitenKopf(box, "Kurse", () => seiteOeffnen(["kurse"]), anzeigename(kurs, bestand.kursAlias));

  const alias = el("input", { type: "text", value: bestand.kursAlias[kurs] || "", placeholder: kurs, "aria-label": `Anzeigename für ${kurs}` });
  alias.addEventListener("change", () => {
    const v = alias.value.trim();
    if (v && v !== kurs) bestand.kursAlias[kurs] = v; else delete bestand.kursAlias[kurs];
    speichern();
    renderStand();
    titel.textContent = anzeigename(kurs, bestand.kursAlias);   // nicht neu rendern, sonst geht der Fokus verloren
  });
  box.append(el("label", { class: "einst-feld" }, el("span", { text: "Anzeigename" }), alias));
  box.append(el("p", { text: "Anzeigename gilt nur für die Anzeige, der Originalname bleibt gespeichert." }));

  const klausur = el("input", { type: "date", value: bestand.klausurschnitt[kurs] || "", "aria-label": `Klausurdatum für ${kurs}` });
  klausur.addEventListener("change", () => {
    if (klausur.value) bestand.klausurschnitt[kurs] = klausur.value; else delete bestand.klausurschnitt[kurs];
    speichern();
  });
  box.append(el("label", { class: "einst-feld" }, el("span", { text: "Letzte Klausur" }), klausur));
  box.append(el("p", { text: "Mit Filter → Zeitraum „Seit Klausur“ zeigt das Archiv diesen Kurs ab dem Datum." }));
}

function seiteVorschau(box) {
  const { bestand } = zustand;
  const einst = bestand.einstellungen;
  seitenKopf(box, "Einstellungen", () => seiteOeffnen([]), "Vorschau");

  const beginn = el("input", { type: "time", value: einst.schulbeginn, "aria-label": "Unterrichtsbeginn" });
  beginn.addEventListener("change", () => {
    if (!/^\d{2}:\d{2}$/.test(beginn.value)) return;
    einst.schulbeginn = beginn.value;
    speichern();
  });
  box.append(gruppe(zeileMit("Unterrichtsbeginn", beginn)));
  box.append(el("p", { text: "Bis zu dieser Uhrzeit zeigt die Vorschau den heutigen Tag, danach den nächsten Schultag." }));

  const ab = el("input", { type: "time", value: einst.erinnerungAb, "aria-label": "Erinnerung ab" });
  ab.addEventListener("change", () => {
    if (!/^\d{2}:\d{2}$/.test(ab.value)) return;
    einst.erinnerungAb = ab.value;
    speichern();
  });
  box.append(gruppe(zeileMit("Erinnerung ab", ab)));
  box.append(el("p", { text: "War seit dem letzten Abruf Unterricht, erinnert die App ab dieser Uhrzeit oben daran, das Lesezeichen anzutippen. Stunden von früheren Tagen zählen sofort." }));

  box.append(gruppe(
    zeile("Wochenplan", wochenplanZusammenfassung(einst), () => seiteOeffnen(["vorschau", "wochenplan"])),
    zeile("Freie Tage", freieTageZusammenfassung(einst), () => seiteOeffnen(["vorschau", "frei"])),
    zeile("Fächer im Stundenplan", faecherZusammenfassung(bestand), () => seiteOeffnen(["vorschau", "faecher"])),
  ));
}

function seiteWochenplan(box) {
  const { bestand } = zustand;
  const einst = bestand.einstellungen;
  const kurse = kurseSortiert(Object.keys(kurseZaehlen(bestand.eintraege)), bestand.kursAlias);
  seitenKopf(box, "Vorschau", () => seiteOeffnen(["vorschau"]), "Wochenplan");
  box.append(el("p", { text: `Abgeleitet aus den Einträgen der letzten ${einst.wochenplan.fensterTage} Tage. Antippen wechselt: automatisch → fest → aus.` }));

  const abgeleitetAlle = ermittleWochenplan(bestand.eintraege, heuteIso(), { ...einst, wochenplan: { ...einst.wochenplan, overrides: {} } });
  const plan = el("div", { class: "wochenplan" });
  for (const tag of WOCHENTAGE.slice(0, 5)) {
    const overrides = einst.wochenplan.overrides[tag] || {};
    const abgeleitet = new Map(abgeleitetAlle[tag].map((k) => [k.kurs, k.sicherheit]));
    const alle = kurseSortiert([...new Set([...abgeleitet.keys(), ...Object.keys(overrides)])], bestand.kursAlias);
    const chips = el("div", { class: "chips" });
    for (const kurs of alle) {
      const ov = overrides[kurs] || null;
      const stufe = ov === "fix" ? "fest" : ov === "aus" ? "aus" : abgeleitet.get(kurs) === "unsicher" ? "unsicher" : null;
      const naechste = ov === null ? "fix" : ov === "fix" && abgeleitet.has(kurs) ? "aus" : null;
      chips.append(el("button", {
        type: "button", class: ov === "fix" ? "fest" : ov === "aus" ? "aus" : null,
        "aria-label": `${anzeigename(kurs, bestand.kursAlias)} am ${tag}: ${stufe || "automatisch"}`,
        onclick: () => overrideSetzen(tag, kurs, naechste),
      }, anzeigename(kurs, bestand.kursAlias), stufe ? el("small", { text: stufe }) : null));
    }
    const frei = kurse.filter((k) => !alle.includes(k));
    if (frei.length) {
      const auswahl = el("select", { "aria-label": `Kurs am ${tag} fest hinzufügen` },
        el("option", { value: "", text: "+ Kurs" }),
        frei.map((k) => el("option", { value: k, text: anzeigename(k, bestand.kursAlias) })));
      auswahl.addEventListener("change", () => { if (auswahl.value) overrideSetzen(tag, auswahl.value, "fix"); });
      chips.append(auswahl);
    }
    plan.append(el("div", { class: "wochenplan-tag" }, el("div", { class: "tag", text: tag }), chips));
  }
  box.append(plan);
}

function seiteFreieTage(box) {
  const einst = zustand.bestand.einstellungen;
  seitenKopf(box, "Vorschau", () => seiteOeffnen(["vorschau"]), "Freie Tage");
  box.append(el("p", { text: "Ferien, Feiertage, Projekttage. Diese Tage überspringt die Vorschau." }));
  const liste = el("div", { class: "frei-liste" });
  einst.freieTage.forEach((f, i) => {
    const [von, bis] = f.split("..");
    liste.append(el("div", { class: "frei-zeile" },
      el("span", { text: bis ? `${datumLesbar(von)} bis ${datumLesbar(bis)}` : datumLesbar(von) }),
      el("button", { type: "button", onclick: () => { einst.freieTage.splice(i, 1); speichern(); renderEinstellungen(); } }, "Entfernen")));
  });
  const von = el("input", { type: "date", "aria-label": "Frei von" });
  const bis = el("input", { type: "date", "aria-label": "Frei bis, optional" });
  const hinzu = el("button", { type: "button", onclick: () => {
    if (!von.value) return;
    const eintrag = bis.value && bis.value > von.value ? `${von.value}..${bis.value}` : von.value;
    if (!einst.freieTage.includes(eintrag)) einst.freieTage.push(eintrag);
    einst.freieTage.sort();
    speichern(); renderEinstellungen();
  } }, "Hinzufügen");
  liste.append(el("div", { class: "zeile-eingabe" }, el("label", { class: "feld" }, "von", von), el("label", { class: "feld" }, "bis", bis), hinzu));
  box.append(liste);
}

function seiteFaecher(box) {
  const { bestand } = zustand;
  seitenKopf(box, "Vorschau", () => seiteOeffnen(["vorschau"]), "Fächer im Stundenplan");
  const faecher = faecherImStundenplan(bestand);
  if (!faecher.length) {
    box.append(el("p", { text: "Noch kein Stundenplan abgerufen. Das Lesezeichen holt ihn beim nächsten Abruf mit." }));
    return;
  }
  box.append(el("p", { text: "Jedes Fach aus dem Stundenplan gehört zu einem Kurs im Archiv. „Nicht anzeigen“ blendet es in der Vorschau aus." }));
  const tabelle = el("div", { class: "kurs-tabelle" });
  for (const fach of faecher) {
    const zu = bestand.kurszuordnung[fach];
    const hinweis = !zu ? "noch nicht zugeordnet" : zu.quelle === "auto" && !zu.bestaetigt ? "automatisch zugeordnet" : null;
    tabelle.append(el("div", { class: "kurs-zeile zwei" },
      el("div", { class: "roh" }, fach, hinweis ? el("small", { text: hinweis }) : null),
      el("label", {}, "Kurs im Archiv", zuordnungAuswahl(fach, renderEinstellungen)),
    ));
  }
  box.append(tabelle);
}

function seiteDaten(box) {
  seitenKopf(box, "Einstellungen", () => seiteOeffnen([]), "Daten");
  box.append(gruppe(
    zeile("Exportieren", "Alles als JSON-Datei in die Downloads", exportieren, { pfeil: false }),
    zeile("Importieren", "Datei vom Lesezeichen oder frühere Export-Datei", () => dateiQuelle.oeffnen(), { pfeil: false }),
  ));
  box.append(el("p", { text: "Der Browser-Speicher ist flüchtig. Regelmäßig exportieren, die Datei lässt sich hier jederzeit wieder importieren." }));
  box.append(gruppe(zeile("Lesezeichen", "Anleitung und Installation", "./install.html")));
  box.append(el("p", { text: "Das Lesezeichen holt die Daten aus dem eingeloggten Schulmanager-Tab." }));
}

// ---------------------------------------------------------------------------
// Abgleich zwischen Geräten: Ablage in Firestore (quellen/ablage.js), Zusammenführen in
// kern/abgleich.js. Das Geheimnis liegt unter eigenem Schlüssel, nie im Bestand oder Export.
// ---------------------------------------------------------------------------

const ABGLEICH_KEY = "unterrichtsarchiv:abgleich";
const ABLAGE_FAST_VOLL = 700000;
// status: { geheimnis, letzter, fehler: { art, text, zeit } | null, ausstehend, groesse } | null
// frei: Zeile „Abgleich“ auch ungekoppelt zeigen (nach Öffnen von ./#abgleich). Sonst sehen sie nur
// gekoppelte Geräte, die Ablage ist vorerst privat.
const abgleich = { status: null, schluessel: null, laeuft: false, nochmal: false, timer: null, gemeldet: null, frei: false };

const abgleichMoeglich = () => !!storage && ablageEingerichtet() && !!(globalThis.crypto && crypto.subtle);
const eintraegeText = (n) => `${n} ${n === 1 ? "Eintrag" : "Einträge"}`;
// Reihenfolge der Einträge egal: sortiert ablegen allein ist keine Änderung, die neu zeichnen muss.
const kanonisch = (b) => stabil({ ...b, eintraege: [...b.eintraege].sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0)) });

function abgleichLesen() {
  try {
    const s = JSON.parse(storage.getItem(ABGLEICH_KEY) || "null");
    return s && istGeheimnis(s.geheimnis) ? s : null;
  } catch {
    return null;
  }
}

function abgleichSchreiben(status) {
  abgleich.status = status;
  try {
    if (status) storage.setItem(ABGLEICH_KEY, JSON.stringify(status));
    else storage.removeItem(ABGLEICH_KEY);
  } catch { /* ohne Speicher gilt der Status nur bis zum Neuladen */ }
}

function abgleichPlanen(verzoegerung = 2000) {
  if (!abgleich.status) return;
  clearTimeout(abgleich.timer);
  abgleich.timer = setTimeout(() => abgleichStarten(), verzoegerung);
}

/** Einstellungen neu zeichnen, wenn dort gerade der Stand des Abgleichs zu sehen ist. */
function abgleichStandZeigen() {
  if (zustand.ansicht === "einstellungen" && (!zustand.seite.length || zustand.seite[0] === "abgleich")) renderEinstellungen();
}

/**
 * Holt die Ablage, führt zusammen, legt ab. vonHand: Ergebnis immer melden; sonst nur Neues und
 * echte Fehler, eine fehlende Verbindung wird still nachgeholt. text(neu) ersetzt die Erfolgsmeldung.
 */
async function abgleichStarten({ vonHand = false, text = null } = {}) {
  const status = abgleich.status;
  if (!status || !abgleichMoeglich()) return;
  if (abgleich.laeuft) { abgleich.nochmal = true; return; }
  abgleich.laeuft = true;
  clearTimeout(abgleich.timer);
  const vorher = stabil(zustand.bestand);
  const jetzt = new Date().toISOString();
  try {
    if (!abgleich.schluessel || abgleich.schluessel.geheimnis !== status.geheimnis) {
      abgleich.schluessel = { geheimnis: status.geheimnis, ...(await ableiten(status.geheimnis)) };
    }
    const { dokumentId, schluessel } = abgleich.schluessel;
    const r = await abgleichen({ ablage: new Ablage(), dokumentId, schluessel, lokal: zustand.bestand, jetzt });
    if (abgleich.status !== status) return;   // inzwischen beendet oder neu gekoppelt
    let ergebnis = r.bestand;
    if (stabil(zustand.bestand) !== vorher) {   // während des Abgleichs gespeichert: nichts davon verlieren
      ergebnis = zusammenfuehren(zustand.bestand, ergebnis, jetzt).bestand;
      abgleich.nochmal = true;
    }
    abgleich.gemeldet = null;
    abgleichSchreiben({ ...status, letzter: jetzt, fehler: null, ausstehend: false, groesse: r.groesse });
    const meldung = text ? text(r.neu)
      : vonHand ? (r.neu ? `Abgeglichen: ${eintraegeText(r.neu)} vom anderen Gerät.` : "Abgeglichen.")
        : r.neu ? `Vom anderen Gerät übernommen: ${eintraegeText(r.neu)}.` : null;
    if (meldung) melden("ok", meldung);
    if (kanonisch(ergebnis) !== kanonisch(zustand.bestand)) {
      zustand.bestand = ergebnis;
      bestandSchreiben();
      render();
    } else {
      abgleichStandZeigen();
    }
  } catch (e) {
    if (abgleich.status !== status) return;
    const art = e instanceof AblageFehler ? e.art : "inhalt";
    abgleichSchreiben({ ...status, ausstehend: true, fehler: art === "offline" ? null : { art, text: e.message, zeit: jetzt } });
    if (vonHand || (art !== "offline" && abgleich.gemeldet !== art)) {
      abgleich.gemeldet = art;
      melden(art === "offline" ? "warn" : "fehler", `Abgleich: ${e.message}${art === "offline" ? " Er wird nachgeholt." : ""}`);
    }
    abgleichStandZeigen();
  } finally {
    abgleich.laeuft = false;
    if (abgleich.nochmal) { abgleich.nochmal = false; abgleichPlanen(500); }
  }
}

/** Kopplungslink (#koppeln=…) geöffnet: dieses Gerät mit der Ablage verbinden. → true, wenn der Link da war */
function kopplungAusLink() {
  if (location.hash === "#abgleich") {   // Zugang zu „Ablage anlegen“ auf ungekoppelten Geräten
    history.replaceState(null, "", location.pathname + location.search);
    abgleich.frei = true;
    ansichtWechseln("einstellungen", ["abgleich"]);
    return false;
  }
  const treffer = /^#koppeln=([A-Za-z0-9_-]{43})$/.exec(location.hash);
  if (!treffer) return false;
  history.replaceState(null, "", location.pathname + location.search);   // Geheimnis nicht in der Adresse lassen
  const geheimnis = treffer[1];
  if (!abgleichMoeglich()) { melden("fehler", "In diesem Browser ist kein Abgleich möglich."); return true; }
  if (abgleich.status && abgleich.status.geheimnis === geheimnis) { abgleichStarten({ vonHand: true }); return true; }
  if (abgleich.status && !window.confirm("Dieses Gerät ist schon mit einer anderen Ablage gekoppelt. Zur neuen wechseln? Die Einträge auf diesem Gerät bleiben.")) return true;
  abgleichSchreiben({ geheimnis, letzter: null, fehler: null, ausstehend: true, groesse: 0 });
  abgleich.gemeldet = null;
  abgleichStarten({ vonHand: true, text: (neu) => `Gekoppelt. ${neu ? `${eintraegeText(neu)} vom anderen Gerät übernommen.` : "Die Geräte gleichen jetzt ab."}` });
  return true;
}

function seiteAbgleich(box) {
  seitenKopf(box, "Einstellungen", () => seiteOeffnen([]), "Abgleich");
  const { status } = abgleich;
  if (!abgleichMoeglich()) {
    box.append(el("p", { text: "In diesem Browser ist kein Abgleich möglich." }));
    return;
  }
  if (!status) {
    box.append(el("p", { text: "Hält Einträge, Stundenplan und Einstellungen auf mehreren Geräten gleich. Die Daten liegen verschlüsselt im Internet. Lesen können sie nur gekoppelte Geräte." }));
    box.append(gruppe(zeile("Ablage anlegen", "Auf dem Gerät, das schon Einträge und Einstellungen hat", ablageAnlegen, { pfeil: false })));
    box.append(el("p", { text: "Danach den Link an das andere Gerät schicken und dort öffnen. Mehr ist nicht nötig." }));
    return;
  }
  if (status.fehler) box.append(el("div", { class: "hinweis fehler" }, el("p", { text: status.fehler.text })));
  box.append(gruppe(
    zeile("Anderes Gerät koppeln", "Link per AirDrop oder Nachricht schicken", kopplungTeilen, { pfeil: false }),
    zeile("Jetzt abgleichen", abgleichZusammenfassung(status, new Date()), () => abgleichStarten({ vonHand: true }), { pfeil: false }),
  ));
  box.append(el("p", { text: "Den Link auf dem anderen Gerät öffnen. Wer den Link hat, kann die Einträge lesen. Deshalb nur an eigene Geräte schicken." }));
  if (status.groesse > ABLAGE_FAST_VOLL) box.append(el("p", { text: "Die Ablage ist fast voll. Bitte melden, dann wird sie aufgeteilt." }));
  box.append(gruppe(zeile("Abgleich auf diesem Gerät beenden", null, abgleichBeenden, { pfeil: false, klasse: "gefahr" })));
  box.append(el("p", { text: "Die Einträge auf diesem Gerät bleiben. Die anderen Geräte gleichen weiter ab." }));
}

function ablageAnlegen() {
  const jetzt = new Date().toISOString();
  // Alle Blöcke stempeln: beim ersten Koppeln gibt dieses Gerät Anzeigenamen und Einstellungen vor.
  zustand.bestand.staende = Object.fromEntries(STAND_BLOECKE.map((b) => [b, jetzt]));
  bestandSchreiben();
  abgleichSchreiben({ geheimnis: geheimnisErzeugen(), letzter: null, fehler: null, ausstehend: true, groesse: 0 });
  abgleich.gemeldet = null;
  renderEinstellungen();
  abgleichStarten({ vonHand: true, text: () => "Ablage angelegt. Jetzt „Anderes Gerät koppeln“ antippen." });
}

async function kopplungTeilen() {
  const url = new URL(`./#koppeln=${abgleich.status.geheimnis}`, location.href).href;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Unterrichtsarchiv koppeln", url });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;   // Teilen abgebrochen
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    melden("ok", "Link kopiert. Auf dem anderen Gerät öffnen.");
  } catch {
    window.prompt("Diesen Link auf dem anderen Gerät öffnen:", url);
  }
}

function abgleichBeenden() {
  if (!window.confirm("Abgleich auf diesem Gerät beenden? Die Einträge hier bleiben. Neu koppeln geht mit dem Link von einem gekoppelten Gerät.")) return;
  clearTimeout(abgleich.timer);
  abgleichSchreiben(null);
  abgleich.schluessel = null;
  melden("ok", "Abgleich auf diesem Gerät beendet.");
  renderEinstellungen();
}

function overrideSetzen(tag, kurs, wert) {
  const overrides = zustand.bestand.einstellungen.wochenplan.overrides;
  if (wert) {
    (overrides[tag] = overrides[tag] || {})[kurs] = wert;
  } else if (overrides[tag]) {
    delete overrides[tag][kurs];
    if (!Object.keys(overrides[tag]).length) delete overrides[tag];
  }
  speichern();
  renderEinstellungen();
}

// ---------------------------------------------------------------------------
// Aktionen
// ---------------------------------------------------------------------------

function exportieren() {
  const blob = new Blob([exportText(zustand.bestand)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: exportDateiname(heuteIso()) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  melden("ok", "Export gestartet. Die Datei liegt in den Downloads.");
}

function archivLoeschen() {
  const n = zustand.bestand.eintraege.length;
  // Mit Abgleich endet er auf diesem Gerät, sonst käme beim nächsten Abgleich alles zurück.
  const mitAbgleich = abgleich.status ? " Der Abgleich auf diesem Gerät endet, die anderen Geräte behalten ihre Daten." : "";
  if (!window.confirm(`Wirklich alle ${n} Einträge löschen? Anzeigenamen, Klausurdaten und Einstellungen gehen mit. Vorher exportieren, falls noch nicht geschehen.${mitAbgleich}`)) return;
  if (storage) loeschen(storage);
  if (abgleich.status) { clearTimeout(abgleich.timer); abgleichSchreiben(null); abgleich.schluessel = null; }
  zustand.bestand = leererBestand();
  gespeichert = kopie(zustand.bestand);
  zustand.filter = FILTER_LEER();
  zustand.filterOffen = false;
  zustand.monatAuf = {};
  zustand.vorschauDatum = null;
  zustand.entwurf = ENTWURF_LEER();
  zustand.bearbeiten = null;
  zustand.ansicht = "archiv";
  zustand.vorher = "archiv";
  zustand.seite = [];
  melden("ok", "Archiv gelöscht.");
  render();
}

// ---------------------------------------------------------------------------
// Verdrahtung
// ---------------------------------------------------------------------------

const dateiQuelle = new DateiQuelle($("datei"));
const empfangsQuelle = new EmpfangsQuelle(window);

function verdrahten() {
  $("knopf-einstellungen").addEventListener("click", () => {
    ansichtWechseln(zustand.ansicht === "einstellungen" ? zustand.vorher : "einstellungen");
  });
  // Archiv antippen, während eine Kursseite offen ist, führt zur Kursliste zurück.
  $("reiter-archiv").addEventListener("click", () => {
    if (zustand.ansicht === "archiv" && zustand.filter.kurs) zurKursliste();
    else ansichtWechseln("archiv");
  });
  $("reiter-vorschau").addEventListener("click", () => { zustand.vorschauDatum = null; ansichtWechseln("vorschau"); });
  $("reiter-eintragen").addEventListener("click", () => { zustand.bearbeiten = null; ansichtWechseln("eintragen"); });
  $("suche").addEventListener("input", () => { zustand.filter.suche = $("suche").value; renderListe(); });
  $("filter-knopf").addEventListener("click", () => { zustand.filterOffen = !zustand.filterOffen; renderFilter(); });

  const callbacks = {
    onDaten: datenVerarbeiten,
    onFehler: (text) => melden("fehler", text),
    onWarten: (laeuft) => melden(laeuft ? "ok" : "warn", laeuft
      ? "Warte auf die Daten aus dem Schulmanager-Tab …"
      : "In 20 Sekunden ist nichts angekommen. Im Schulmanager-Tab steht oben rechts, was passiert ist. Falls dort eine Datei heruntergeladen wurde: Einstellungen → Daten → Importieren."),
  };
  for (const quelle of [dateiQuelle, empfangsQuelle]) {
    if (quelle.verfuegbar()) quelle.starten(callbacks);
  }

  // Abgleich nur zu diesen Anlässen, kein Takt: Zurückwechseln in den Tab, Safari holt die Seite
  // aus dem Verlauf-Cache, Netz ist wieder da.
  // Beim Zurückkehren: Erinnerung neu prüfen (die Uhrzeit kann inzwischen erreicht sein), dann abgleichen.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { renderErinnerung(); abgleichStarten(); } });
  window.addEventListener("pageshow", (e) => { if (e.persisted) { renderErinnerung(); abgleichStarten(); } });
  window.addEventListener("online", () => abgleichStarten());
}

laden();
verdrahten();
render();
if (zustand.speicherFehler) melden("fehler", zustand.speicherFehler);
if (!kopplungAusLink()) abgleichStarten();

const lokal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const parameter = new URLSearchParams(location.search);

// navigator.standalone gibt es nur auf iOS; lokal lässt sich der Hinweis mit ?webapp=1 ansehen.
if (navigator.standalone === true || (lokal && parameter.has("webapp"))) renderWebAppHinweis();

// PWA-Hülle: nur die App-Shell wird gecacht (siehe sw.js). Lokal beim Entwickeln nicht
// registrieren, sonst liefert der Cache alte Dateien; mit ?sw=1 lässt es sich erzwingen.
if ("serviceWorker" in navigator && (!lokal || parameter.has("sw"))) {
  navigator.serviceWorker.register("./sw.js").catch(() => { /* ohne SW läuft alles trotzdem */ });
}
