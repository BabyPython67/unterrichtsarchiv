// Viewer: Zustand, Verdrahtung, Rendering. Alle Datenlogik kommt aus kern/, die Quellen aus
// quellen/. Es wird nichts per innerHTML eingefügt — Texte aus den Daten laufen immer durch
// textContent bzw. createTextNode.

import { lesen, schreiben, loeschen, defektSichern, exportText, exportDateiname, leererBestand } from "../kern/speicher.js";
import { importieren } from "../kern/importieren.js";
import { filtern, gruppieren, kurseZaehlen, kurseSortiert, anzeigename, zerlegen, wochentag, datumLesbar, WOCHENTAGE } from "../kern/filtern.js";
import { baueDigest, digestKopfzeile, herkunftZeile, syncStatus, planFunktion, schultagSuchen, datumPlus, isoDatum, vorTagenText, ermittleWochenplan, mitStandard } from "../kern/logik.js";
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

const FILTER_LEER = () => ({ kurs: null, abDatum: "", suche: "", nurHausaufgabe: false, seitKlausur: false });

const zustand = {
  bestand: leererBestand(),
  speicherFehler: null,
  filter: FILTER_LEER(),
  ansicht: "archiv",      // "archiv" | "vorschau" | "einstellungen"
  vorher: "archiv",       // wohin „Zurück“ aus den Einstellungen führt
  vorschauDatum: null,    // null = nächster Schultag automatisch, sonst per Pfeil gewählter Tag
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
  const text = r.art === "export"
    ? `Export-Datei übernommen${woher}: ${neu} neu, ${geaendert} geändert, ${unveraendert} unverändert.`
    : `Abruf übernommen${woher}: ${neu} neu, ${geaendert} geändert, ${unveraendert} unverändert.`;
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
  $("liste-bereich").hidden = a !== "archiv";
  $("vorschau").hidden = a !== "vorschau";
  $("einstellungen").hidden = a !== "einstellungen";
  if (a === "einstellungen") {
    renderEinstellungen();
  } else if (a === "vorschau") {
    renderVorschau();
  } else {
    renderKlausur();
    renderKurse();
    renderWerkzeuge();
    renderListe();
  }
}

function ansichtWechseln(ziel) {
  if (ziel !== "einstellungen") zustand.vorher = ziel;
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
  $("stand").textContent = teile.join(" · ");
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

// ---- Archiv ----------------------------------------------------------------

function renderKlausur() {
  const box = $("klausur");
  box.textContent = "";
  const { filter } = zustand;
  const { klausurschnitt, kursAlias, eintraege } = zustand.bestand;
  box.classList.toggle("aktiv", filter.seitKlausur);

  const knopf = el("button", {
    type: "button", class: "gross", "aria-pressed": String(filter.seitKlausur),
    onclick: () => { filter.seitKlausur = !filter.seitKlausur; renderKlausur(); renderListe(); },
  }, "Seit letzter Klausur");

  const zeile = el("div", { class: "klausur-zeile" }, knopf);

  if (filter.kurs) {
    const datum = klausurschnitt[filter.kurs] || "";
    const name = anzeigename(filter.kurs, kursAlias);
    const eingabe = el("input", { type: "date", value: datum, "aria-label": `Klausurdatum für ${name}` });
    eingabe.addEventListener("change", () => {
      if (eingabe.value) klausurschnitt[filter.kurs] = eingabe.value;
      else delete klausurschnitt[filter.kurs];
      speichern();
      renderKlausur();
      renderListe();
    });
    zeile.append(
      el("label", { class: "feld" }, el("span", { text: `${name}: Klausur am` }), eingabe),
      el("p", { class: "info", text: datum
        ? `Zeigt alles ab dem ${datumLesbar(datum)}.`
        : "Noch kein Klausurdatum für diesen Kurs. Datum eintragen, dann wirkt der Schalter." }),
    );
  } else {
    const alle = Object.keys(kurseZaehlen(eintraege));
    const mitDatum = alle.filter((k) => klausurschnitt[k]).length;
    zeile.append(el("p", { class: "info", text: alle.length
      ? `Je Kurs ab dem eingetragenen Klausurdatum. ${mitDatum} von ${alle.length} Kursen haben eins — Kurs antippen, um es zu setzen.`
      : "Sobald Einträge da sind, lässt sich je Kurs ein Klausurdatum setzen." }));
  }
  box.append(zeile);
}

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
      renderKurse(); renderKlausur(); renderListe();
    },
  }, el("span", { text: name }), el("span", { class: "n", text: String(n) }));
  leiste.append(chip(null, "Alle", eintraege.length));
  for (const kurs of kurseSortiert(Object.keys(zaehler), kursAlias)) {
    leiste.append(chip(kurs, anzeigename(kurs, kursAlias), zaehler[kurs]));
  }
}

function renderWerkzeuge() {
  const { filter } = zustand;
  if ($("suche").value !== filter.suche) $("suche").value = filter.suche;
  if ($("ab").value !== filter.abDatum) $("ab").value = filter.abDatum;
  $("nur-ha").setAttribute("aria-pressed", String(filter.nurHausaufgabe));
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
    ausgabe.append(el("p", { class: "leer-hinweis", text: "Keine Einträge für diese Filter. Zeitraum weiter zurücksetzen oder nach einem anderen Wort suchen." }));
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
      el("div", { class: "knoepfe" }, el("button", { type: "button", onclick: () => ansichtWechseln("einstellungen") }, "Einstellungen")),
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
  if (zustand.vorschauDatum) {
    box.append(el("div", { class: "knopfreihe mitte" },
      el("button", { type: "button", onclick: () => { zustand.vorschauDatum = null; renderVorschau(); } }, "Zum nächsten Schultag")));
  }

  const sync = syncStatus(bestand.sync, jetzt, einst);
  if (sync.art !== "ok") {
    box.append(el("div", { class: `hinweis ${sync.art === "fehler" ? "fehler" : "warn"}` },
      sync.text, el("a", { href: `${SCHULMANAGER_ORIGIN}/`, target: "_blank", rel: "noopener" }, "Schulmanager öffnen")));
  }

  if (!digest.kurse.length) {
    box.append(el("p", { class: "leer-hinweis", text: "Kein Unterricht an diesem Tag." }));
  }
  for (const k of digest.kurse) box.append(k.zuordnungFehlt ? zuordnungKarte(k) : kursKarte(k));
  if (digest.entfallen.length) {
    box.append(el("p", { class: "entfallen" }, "Entfällt: ", digest.entfallen.map((k, i) => [i ? ", " : null, el("s", { text: k.name })])));
  }
}

function kursKarte(k) {
  const kopf = el("div", { class: "karte-kopf" }, el("h3", { text: k.name }));
  if (k.status === "vertretung") kopf.append(el("span", { class: "marke", text: "Vertretung" }));
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

/** Fach aus dem Stundenplan, das noch keinem Archiv-Kurs zugeordnet ist. */
function zuordnungKarte(k) {
  const { bestand } = zustand;
  const kurse = kurseSortiert(Object.keys(kurseZaehlen(bestand.eintraege)), bestand.kursAlias);
  const auswahl = el("select", { "aria-label": `Archiv-Kurs für ${k.fach}` },
    el("option", { value: "", text: "Kurs wählen" }),
    kurse.map((kurs) => el("option", { value: kurs, text: anzeigename(kurs, bestand.kursAlias) })));
  auswahl.addEventListener("change", () => {
    if (!auswahl.value) return;
    bestand.kurszuordnung[k.fach] = { kurs: auswahl.value, quelle: "manuell", bestaetigt: true };
    speichern();
    renderVorschau();
  });
  return el("article", { class: "karte" },
    el("div", { class: "karte-kopf" }, el("h3", { text: k.name }), el("span", { class: "marke leise", text: "nicht zugeordnet" })),
    el("p", { class: "karte-meta", text: "Steht im Stundenplan, gehört aber noch zu keinem Kurs im Archiv." }),
    el("div", { class: "zeile-eingabe" }, auswahl),
  );
}

// ---- Einstellungen ---------------------------------------------------------

function renderEinstellungen() {
  const box = $("einstellungen");
  box.textContent = "";
  const { bestand } = zustand;
  const kurse = kurseSortiert(Object.keys(kurseZaehlen(bestand.eintraege)), bestand.kursAlias);

  box.append(el("div", { class: "knopfreihe" }, el("button", { type: "button", onclick: () => ansichtWechseln(zustand.vorher) }, zustand.vorher === "vorschau" ? "← Zurück zur Vorschau" : "← Zurück zum Archiv")));
  box.append(el("h2", { text: "Einstellungen" }));

  if (zustand.speicherFehler) {
    box.append(el("div", { class: "meldung fehler" }, el("div", { class: "text" }, el("p", { text: zustand.speicherFehler }))));
  }

  box.append(el("h3", { text: "Kurse" }));
  box.append(el("p", { text: "Anzeigename je Kurs (der Originalname bleibt gespeichert) und Datum der letzten Klausur." }));
  if (!kurse.length) box.append(el("p", { text: "Noch keine Kurse — erst Daten abrufen oder importieren." }));
  const tabelle = el("div", { class: "kurs-tabelle" });
  for (const kurs of kurse) {
    const alias = el("input", { type: "text", value: bestand.kursAlias[kurs] || "", placeholder: kurs, "aria-label": `Anzeigename für ${kurs}` });
    alias.addEventListener("change", () => {
      const v = alias.value.trim();
      if (v && v !== kurs) bestand.kursAlias[kurs] = v; else delete bestand.kursAlias[kurs];
      speichern(); renderStand();
    });
    const klausur = el("input", { type: "date", value: bestand.klausurschnitt[kurs] || "", "aria-label": `Klausurdatum für ${kurs}` });
    klausur.addEventListener("change", () => {
      if (klausur.value) bestand.klausurschnitt[kurs] = klausur.value; else delete bestand.klausurschnitt[kurs];
      speichern();
    });
    tabelle.append(el("div", { class: "kurs-zeile" },
      el("div", { class: "roh" }, anzeigename(kurs, bestand.kursAlias), bestand.kursAlias[kurs] ? el("small", { text: kurs }) : null),
      el("label", {}, "Anzeigename", alias),
      el("label", {}, "Letzte Klausur", klausur),
    ));
  }
  box.append(tabelle);

  renderEinstellungenVorschau(box, kurse);

  box.append(el("h3", { text: "Daten" }));
  box.append(el("p", { text: "Der Browser-Speicher ist flüchtig. Regelmäßig exportieren, die Datei lässt sich hier jederzeit wieder importieren." }));
  box.append(el("div", { class: "knopfreihe" },
    el("button", { type: "button", onclick: exportieren }, "Als JSON exportieren"),
    el("button", { type: "button", onclick: () => dateiQuelle.oeffnen() }, "Datei importieren"),
    el("button", { type: "button", class: "gefahr", onclick: archivLoeschen }, "Archiv löschen"),
  ));

  box.append(el("h3", { text: "Lesezeichen" }));
  box.append(el("p", {}, "Das Lesezeichen holt die Daten aus dem eingeloggten Schulmanager-Tab. ", el("a", { href: "./install.html" }, "Anleitung und Installation")));
}

function renderEinstellungenVorschau(box, kurse) {
  const { bestand } = zustand;
  const einst = bestand.einstellungen;

  box.append(el("h3", { text: "Vorschau" }));
  const start = (wert, text) => el("button", {
    type: "button", "aria-pressed": String(einst.startReiter === wert),
    onclick: () => { einst.startReiter = wert; speichern(); renderEinstellungen(); },
  }, text);
  box.append(el("p", { text: "Ansicht beim Öffnen." }), el("div", { class: "knopfreihe" }, start("archiv", "Archiv"), start("vorschau", "Vorschau")));

  const beginn = el("input", { type: "time", value: einst.schulbeginn, "aria-label": "Unterrichtsbeginn" });
  beginn.addEventListener("change", () => {
    if (!/^\d{2}:\d{2}$/.test(beginn.value)) return;
    einst.schulbeginn = beginn.value;
    speichern();
  });
  box.append(el("p", { text: "Bis zu dieser Uhrzeit zeigt die Vorschau den heutigen Tag, danach den nächsten Schultag." }),
    el("div", { class: "zeile-eingabe" }, el("label", { class: "feld" }, "Unterrichtsbeginn", beginn)));

  box.append(el("h3", { text: "Wochenplan" }));
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

  box.append(el("h3", { text: "Freie Tage" }));
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
  zustand.vorschauDatum = null;
  zustand.ansicht = "archiv";
  zustand.vorher = "archiv";
  melden("ok", "Archiv gelöscht.");
  render();
}

// ---------------------------------------------------------------------------
// Verdrahtung
// ---------------------------------------------------------------------------

const dateiQuelle = new DateiQuelle($("datei"));
const empfangsQuelle = new EmpfangsQuelle(window);

function verdrahten() {
  $("knopf-import").addEventListener("click", () => dateiQuelle.oeffnen());
  $("knopf-einstellungen").addEventListener("click", () => {
    ansichtWechseln(zustand.ansicht === "einstellungen" ? zustand.vorher : "einstellungen");
  });
  $("reiter-archiv").addEventListener("click", () => ansichtWechseln("archiv"));
  $("reiter-vorschau").addEventListener("click", () => { zustand.vorschauDatum = null; ansichtWechseln("vorschau"); });
  $("suche").addEventListener("input", () => { zustand.filter.suche = $("suche").value; renderListe(); });
  $("ab").addEventListener("change", () => { zustand.filter.abDatum = $("ab").value; renderListe(); });
  $("nur-ha").addEventListener("click", () => {
    zustand.filter.nurHausaufgabe = !zustand.filter.nurHausaufgabe;
    renderWerkzeuge(); renderListe();
  });
  $("reset").addEventListener("click", () => {
    zustand.filter = FILTER_LEER();
    render();
  });

  const callbacks = {
    onDaten: datenVerarbeiten,
    onFehler: (text) => melden("fehler", text),
    onWarten: (laeuft) => melden(laeuft ? "ok" : "warn", laeuft
      ? "Warte auf die Daten aus dem Schulmanager-Tab …"
      : "In 20 Sekunden ist nichts angekommen. Im Schulmanager-Tab steht oben rechts, was passiert ist. Falls dort eine Datei heruntergeladen wurde: hier auf „Importieren“ tippen."),
  };
  for (const quelle of [dateiQuelle, empfangsQuelle]) {
    if (quelle.verfuegbar()) quelle.starten(callbacks);
  }
}

laden();
verdrahten();
render();
if (zustand.speicherFehler) melden("fehler", zustand.speicherFehler);

// PWA-Hülle: nur die App-Shell wird gecacht (siehe sw.js). Lokal beim Entwickeln nicht
// registrieren, sonst liefert der Cache alte Dateien; mit ?sw=1 lässt es sich erzwingen.
const lokal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
if ("serviceWorker" in navigator && (!lokal || new URLSearchParams(location.search).has("sw"))) {
  navigator.serviceWorker.register("./sw.js").catch(() => { /* ohne SW läuft alles trotzdem */ });
}
