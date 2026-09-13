// Viewer: Zustand, Verdrahtung, Rendering. Alle Datenlogik kommt aus kern/, die Quellen aus
// quellen/. Es wird nichts per innerHTML eingefügt — Texte aus den Daten laufen immer durch
// textContent bzw. createTextNode.

import { lesen, schreiben, loeschen, defektSichern, exportText, exportDateiname, leererBestand } from "../kern/speicher.js";
import { importieren } from "../kern/importieren.js";
import { filtern, gruppieren, kurseZaehlen, kurseSortiert, anzeigename, zerlegen, wochentag, datumLesbar, WOCHENTAGE } from "../kern/filtern.js";
import {
  baueDigest, digestKopfzeile, tagesablauf, herkunftZeile, syncZeile, planFunktion, schultagSuchen, datumPlus, isoDatum, vorTagenText,
  ermittleWochenplan, mitStandard, lueckeText, stundenSeitAbruf, stundenSeitAbrufText,
} from "../kern/logik.js";
import {
  kurseZusammenfassung, vorschauZusammenfassung, wochenplanZusammenfassung, freieTageZusammenfassung,
  faecherImStundenplan, faecherZusammenfassung, datenZusammenfassung,
} from "../kern/zusammenfassung.js";
import { SCHULMANAGER_ORIGIN } from "../quellen/quelle.js";
import { DateiQuelle } from "../quellen/dateiQuelle.js";
import { EmpfangsQuelle } from "../quellen/empfangsQuelle.js";

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
const FILTER_LEER = () => ({ kurs: null, abDatum: "", suche: "", nurHausaufgabe: false, seitKlausur: false, zeitraum: "alles" });

const zustand = {
  bestand: leererBestand(),
  speicherFehler: null,
  filter: FILTER_LEER(),
  filterOffen: false,     // Filterbereich im Archiv aufgeklappt
  ansicht: "archiv",     // "archiv" | "vorschau" | "einstellungen"
  vorher: "archiv",       // wohin „Zurück“ aus den Einstellungen führt
  seite: [],              // Unterseite der Einstellungen, siehe renderEinstellungen
  vorschauDatum: null,    // null = nächster Schultag automatisch, sonst per Pfeil gewählter Tag
  abrufHilfeOffen: false, // Kurzanleitung zum Lesezeichen im Hinweis der Vorschau aufgeklappt
  meldung: null,
};

function laden() {
  if (!storage) { zustand.speicherFehler = "Der Browser-Speicher ist nicht verfügbar. Daten gehen beim Schließen verloren."; return; }
  const { bestand, fehler, migriert } = lesen(storage);
  zustand.bestand = bestand;
  zustand.speicherFehler = fehler;
  if (fehler) defektSichern(storage);
  else if (migriert) speichern();   // Schema 1 → 2 einmal zurückschreiben
  zustand.ansicht = bestand.einstellungen.startReiter === "vorschau" ? "vorschau" : "archiv";
  zustand.vorher = zustand.ansicht;
}

function speichern() {
  if (!storage) return;
  try {
    schreiben(storage, zustand.bestand);
  } catch (e) {
    melden("fehler", `Speichern fehlgeschlagen: ${e.message}. Bitte jetzt exportieren.`);
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
  const a = zustand.ansicht;
  $("knopf-einstellungen").setAttribute("aria-pressed", String(a === "einstellungen"));
  $("reiter-archiv").setAttribute("aria-pressed", String(a === "archiv"));
  $("reiter-vorschau").setAttribute("aria-pressed", String(a === "vorschau"));
  $("stand").hidden = a !== "archiv";
  $("liste-bereich").hidden = a !== "archiv";
  $("vorschau").hidden = a !== "vorschau";
  $("einstellungen").hidden = a !== "einstellungen";
  if (a === "einstellungen") {
    renderEinstellungen();
  } else if (a === "vorschau") {
    renderVorschau();
  } else {
    renderKurse();
    renderFilter();
    renderListe();
  }
}

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

/** Hinweis in der Vorschau: Text, Link zum Schulmanager und eine zugeklappte Kurzanleitung zum Lesezeichen. */
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

function renderKurse() {
  const leiste = $("kursleiste");
  leiste.textContent = "";
  const { eintraege, kursAlias } = zustand.bestand;
  const zaehler = kurseZaehlen(eintraege);
  const chip = (kurs, name, n) => el("button", {
    type: "button", "aria-pressed": String(zustand.filter.kurs === kurs),
    "aria-label": `${name}, ${n} ${n === 1 ? "Eintrag" : "Einträge"}`,
    onclick: () => {
      zustand.filter.kurs = zustand.filter.kurs === kurs ? null : kurs;
      renderKurse(); renderFilter(); renderListe();
    },
  }, el("span", { text: name }), el("span", { class: "n", text: String(n) }));
  leiste.append(chip(null, "Alle", eintraege.length));
  for (const kurs of kurseSortiert(Object.keys(zaehler), kursAlias)) {
    leiste.append(chip(kurs, anzeigename(kurs, kursAlias), zaehler[kurs]));
  }
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

/** Unter „Seit Klausur“: mit gewähltem Kurs dessen Klausurdatum (dasselbe wie unter Einstellungen → Kurse), sonst der Stand. */
function klausurFeld() {
  const { filter } = zustand;
  const { klausurschnitt, kursAlias, eintraege } = zustand.bestand;
  const box = el("div", { class: "filter-unter" });
  if (!filter.kurs) {
    const alle = Object.keys(kurseZaehlen(eintraege));
    const mitDatum = alle.filter((k) => klausurschnitt[k]).length;
    box.append(el("p", { class: "info", text: `Je Kurs ab dem eingetragenen Klausurdatum. ${mitDatum} von ${alle.length} Kursen haben eins. Kurs oben antippen, um es zu setzen.` }));
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

  const treffer = filtern(bestand.eintraege, filter, bestand.klausurschnitt);
  if (!treffer.length) {
    ausgabe.append(el("div", { class: "leer-hinweis" },
      el("p", { text: "Keine Einträge für diese Auswahl." }),
      el("div", { class: "knoepfe" }, el("button", { type: "button", onclick: () => { zustand.filter = FILTER_LEER(); render(); } }, "Alles zurücksetzen"))));
    return;
  }

  for (const gruppe of gruppieren(treffer, bestand.kursAlias)) {
    const block = el("section", { class: "kursblock" },
      el("h2", { text: gruppe.name }),
      el("div", { class: "spanne", text: `${gruppe.anzahl} ${gruppe.anzahl === 1 ? "Eintrag" : "Einträge"} · ${datumLesbar(gruppe.von)} bis ${datumLesbar(gruppe.bis)}` }),
    );
    for (const monat of gruppe.monate) {
      block.append(el("div", { class: "monat", text: monat.name }));
      for (const e of monat.eintraege) {
        const inhalt = el("div", { class: "inhalt" });
        if (e.thema) inhalt.append(el("div", { class: "thema" }, hervorheben(e.thema, filter.suche)));
        else inhalt.append(el("div", { class: "thema leer", text: "Kein Inhalt eingetragen" }));
        if (e.hausaufgabe) inhalt.append(el("div", { class: "ha" }, el("b", { text: "Hausaufgabe: " }), hervorheben(e.hausaufgabe, filter.suche)));
        block.append(el("div", { class: "eintrag" }, el("div", { class: "wann", text: wochentag(e.datum) }), inhalt));
      }
    }
    ausgabe.append(block);
  }
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

  // Abrufstand leise unter der Herkunft. Eine Box statt der Zeile, wenn der letzte Abruf fehlschlug
  // oder seitdem Unterricht war, zu dem ein Eintrag fehlt.
  const sync = syncZeile(digest, bestand.stundenplan, bestand.sync, jetzt, einst);
  const luecke = lueckeText(digest);
  if (sync && sync.art === "fehler") {
    box.append(abrufHinweis("fehler", sync.text));
  } else if (luecke) {
    box.append(abrufHinweis("warn", luecke));
  } else if (sync) {
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
  if (k.hausaufgabe) karte.append(el("div", { class: "karte-ha" }, el("b", { text: "Hausaufgabe: " }), k.hausaufgabe));
  if (k.thema) karte.append(el("p", { class: "karte-thema", text: k.thema }));
  else if (k.letztesDatum) karte.append(el("p", { class: "karte-thema leer", text: "Kein Inhalt eingetragen" }));
  if (k.letztesDatum) {
    karte.append(el("p", { class: "karte-meta" }, `Zuletzt ${wochentag(k.letztesDatum)} · `,
      el("span", { class: k.alt ? "alt" : null, text: vorTagenText(k.vorTagen) })));
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
  seitenKopf(box, zustand.vorher === "vorschau" ? "Vorschau" : "Archiv", () => ansichtWechseln(zustand.vorher), "Einstellungen");

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
  if (!window.confirm(`Wirklich alle ${n} Einträge löschen? Anzeigenamen, Klausurdaten und Einstellungen gehen mit. Vorher exportieren, falls noch nicht geschehen.`)) return;
  if (storage) loeschen(storage);
  zustand.bestand = leererBestand();
  zustand.filter = FILTER_LEER();
  zustand.filterOffen = false;
  zustand.vorschauDatum = null;
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
  $("reiter-archiv").addEventListener("click", () => ansichtWechseln("archiv"));
  $("reiter-vorschau").addEventListener("click", () => { zustand.vorschauDatum = null; ansichtWechseln("vorschau"); });
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
}

laden();
verdrahten();
render();
if (zustand.speicherFehler) melden("fehler", zustand.speicherFehler);

const lokal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const parameter = new URLSearchParams(location.search);

// navigator.standalone gibt es nur auf iOS; lokal lässt sich der Hinweis mit ?webapp=1 ansehen.
if (navigator.standalone === true || (lokal && parameter.has("webapp"))) renderWebAppHinweis();

// PWA-Hülle: nur die App-Shell wird gecacht (siehe sw.js). Lokal beim Entwickeln nicht
// registrieren, sonst liefert der Cache alte Dateien; mit ?sw=1 lässt es sich erzwingen.
if ("serviceWorker" in navigator && (!lokal || parameter.has("sw"))) {
  navigator.serviceWorker.register("./sw.js").catch(() => { /* ohne SW läuft alles trotzdem */ });
}
