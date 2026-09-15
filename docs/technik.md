# Unterrichtsarchiv: Technik

Wie die App funktioniert, wie sie gebaut und geprüft wird. Für die Benutzung reicht die
[README](../README.md).

- Kein eigener Server, kein Konto, kein Passwort. Die Daten liegen im Browser des Nutzers, mit
  eingeschaltetem Abgleich zusätzlich verschlüsselt in einer Ablage (Firestore).
- Ein Lesezeichen (Bookmarklet) holt die Daten aus dem Tab, in dem man ohnehin eingeloggt ist.
- Der Viewer läuft als statische Seite auf GitHub Pages und enthält nur Code, keine Daten.

## Ablauf eines Abrufs

1. `install.html` öffnen und den Link in die Lesezeichenleiste ziehen (am Handy: die Adresse
   aus dem Textfeld als Lesezeichen speichern, Anleitung steht auf der Seite).
2. Im Schulmanager einloggen und dort das Lesezeichen anklicken. Es öffnet den Viewer in einem
   neuen Tab, holt Inhalte, Hausaufgaben und Stundenplan mit der bestehenden Sitzung ab und
   schickt sie per `postMessage` an den Viewer. Oben rechts im Schulmanager-Tab erscheint eine
   Statusbox mit „Meldung kopieren“ für Fehlermeldungen. Bestätigt der Viewer den Empfang,
   erscheint dort der Link „Zum Unterrichtsarchiv“. Das Lesezeichen öffnet den Viewer im
   Fenster namens `unterrichtsarchiv`. Gibt es diesen Tab noch vom letzten Mal, lädt iOS-Safari
   den Viewer dort im Hintergrund, der Schulmanager bleibt vorn; ohne ihn kommt ein neuer Tab nach
   vorn. Ein Link auf das benannte Fenster zeigte am iPhone keine Reaktion (2026-09-13). Der Link
   öffnet die App deshalb im Schulmanager-Tab selbst und schließt den Tab, den das Lesezeichen
   geöffnet hat. Ist der Schulmanager-Tab bei der Bestätigung noch sichtbar
   (`document.visibilityState`), passiert das von selbst. Die Daten sind zu dem Zeitpunkt schon
   gespeichert. Der Viewer wartet nur mit `?empfang=1` auf Daten, der Link öffnet ihn ohne diesen
   Zusatz. Heißt der Schulmanager-Tab selbst `unterrichtsarchiv`, leert das Lesezeichen den Namen
   vor dem Öffnen, sonst würde es sich selbst ersetzen.
3. Kommt der Viewer nicht an die Daten (Popup blockiert, 15 s ohne Antwort), lädt das
   Lesezeichen stattdessen `unterricht-JJJJ-MM-TT.json` herunter. Diese Datei im Viewer unter
   Einstellungen → Daten → „Importieren“ einlesen. Dasselbe funktioniert mit Export-Dateien des
   Viewers.

Das Manifest steht bewusst auf `display: browser`, `apple-mobile-web-app-capable` fehlt. Eine
iOS-Web-App vom Home-Bildschirm hat einen eigenen Speicher, getrennt von Safari, und bekäme vom
Lesezeichen nie Daten (am 2026-09-13 auf dem iPhone bestätigt). Ein Symbol auf dem Home-Bildschirm
soll deshalb Safari öffnen; die Anleitung sagt, den Schalter „Als Web-App öffnen“ auszuschalten.
Läuft der Viewer trotzdem als iOS-Web-App (`navigator.standalone`), zeigt er oben einen Hinweis
mit den Schritten; lokal lässt er sich mit `?webapp=1` ansehen. Der Service Worker cached nur
die App-Dateien, nie Nutzerdaten; nach jedem Deploy mit geänderter Shell bekommt er einen
neuen Cache-Namen und räumt den alten weg. `install.html` und der Lesezeichen-Code werden bei
bestehender Verbindung immer frisch geholt, damit nach einem Update nie ein altes Lesezeichen
gezogen wird. Statusbox und `install.html` zeigen dieselbe Build-Kennung (acht Zeichen); weicht
sie ab, ist das Lesezeichen veraltet und muss neu gezogen werden.

## Viewer

**Archiv.** Zwei Ebenen. Ohne Suche und Filter steht die Kursliste da, eine Zeile je Kurs mit
Anzahl und letztem Eintrag (`kursListe`). Antippen öffnet die Kursseite (`filter.kurs`) mit
Zurück-Knopf; der Reiter „Archiv“ führt ebenfalls zur Liste. Auf beiden Ebenen stehen oben die
Suche und der Knopf „Filter“. Der Knopf klappt einen Bereich auf: Zeitraum (Alles, Seit Klausur,
Ab Datum) und Einträge (Alle, Mit Hausaufgabe). In der Kursliste wirken Suche und Filter über
alle Kurse; das Ergebnis steht nach Kurs gruppiert unter einer Zeile wie „12 Einträge in
4 Kursen“ (`trefferZeile`). „Seit Klausur“ wirkt je Kurs ab dem eingetragenen Klausurdatum;
„Ab Datum“ und „Seit Klausur“ schließen sich aus. Bei zugeklapptem Bereich stehen wirkende Filter
als Marken über der Liste, Antippen entfernt sie. Die Zahl am Knopf zählt diese Filter; die Suche
sieht man ohnehin und zählt nicht. Der Wechsel zwischen Liste und Kursseite beginnt mit leerer
Suche und ohne Filter.

Einträge stehen neueste zuerst, nach Monaten. Grenzen Suche, „Ab Datum“ oder ein wirkendes
Klausurdatum die Liste ein (`eingegrenzt`), sind alle Monate offen. Sonst ist je Kurs nur der
neueste Monat offen, ältere öffnen sich per Antippen; das bleibt bis zum Neuladen gemerkt.
„Mit Hausaufgabe“ allein klappt nichts auf, weil die Liste über ein Schuljahr lang bleibt.

**Eintragen.** Hausaufgaben, die nicht im Schulmanager stehen, lassen sich selbst notieren: Kurs,
Hausaufgabe, „Aufgegeben am“. Das Datum ist der Tag des Aufgebens, nicht der Abgabe. Vorbelegt ist
der letzte Tag, dessen Unterricht schon begonnen hat (`eintragDatum`). Das Auswahlfeld zeigt zuerst
die Kurse dieses Tages, dann alle weiteren, auch Fächer aus dem Stundenplan ohne jeden Eintrag
(`kurseZumEintragen`). Wer so ein Fach wählt, ordnet es beim Speichern dem gleichnamigen Kurs zu.
Über dem Formular stehen als Vorschläge die Kurse des Tages ohne Hausaufgabe
(`kurseOhneHausaufgabe`, nur gemessene Tage). Lag der letzte Abruf nach Beginn des Tages, heißt
das „ohne Hausaufgabe im Schulmanager“, sonst steht dabei, dass noch nicht abgerufen wurde. Unter
dem Formular stehen die fünf neuesten eigenen Einträge. Im Archiv tragen eigene Einträge
„Selbst eingetragen · Ändern“, auf der Vorschau-Karte steht „selbst eingetragen“ in der
Meta-Zeile. Ändern und Löschen gibt es nur für eigene Einträge.

**Abgabedatum.** Das freiwillige Feld „Bis“ setzt `bis` am eigenen Eintrag (muss nach dem Tag des
Aufgebens liegen). Die Knöpfe darüber sind „Nächste Stunde“ (leer) und die nächsten drei Tage mit
Unterricht des Kurses (`naechsteStunden`, ohne Entfall und freie Tage). In der Vorschau sammelt
`hausaufgabenAmTag` je Kurs: aus der letzten Stunde alles ohne `bis` oder mit Abgabe ab dem
gezeigten Tag, dazu eigene Einträge früherer Stunden mit Aufgabetag < Tag ≤ `bis`. Der Digest
liefert das als `kurse[].hausaufgaben: [{ text, bis }]`; die Karte zeigt Aufgaben mit `bis` einzeln
mit leisem „bis …“. Der Schulmanager liefert kein Abgabedatum, deshalb gibt es `bis` nur bei
eigenen Einträgen.

**Aktualisieren.** Unter dem Titel steht in Archiv, Vorschau und Eintragen der Stand
(`zeitKurz`, ohne Anzahl der Einträge, die steht in der Kursliste), der Rückstand „seitdem N Schulstunden“ und der Link
„Aktualisieren“ zum Schulmanager. Zeigt `erinnerung` gerade eine Box, entfallen Rückstand und Link
in der Zeile; die Box trägt denselben Link.

**Neu seit dem letzten Abruf.** `mergen` liefert neben den Zählern `neueIds`, `geaenderteIds`
und `hausaufgabeNeuIds` (Hausaufgabe kam zu einem Eintrag ohne Hausaufgabe dazu). Nach einem Abruf
baut `abrufBericht` (kern/neuigkeiten.js) daraus einen Bericht, dazu `planAenderungen`: Entfall
und Vertretung ab heute, die im alten Stundenplan-Cache nicht so standen (leerer alter Cache:
nichts). Der Bericht liegt unter `unterrichtsarchiv:neu` im localStorage, nicht im Bestand, also
weder im Export noch in der Ablage; der nächste Abruf ersetzt ihn. `berichtAnsicht` entscheidet,
was die Box zeigt: „erst“ (vorher kein Eintrag aus dem Schulmanager: nur Anzahl, keine Marken),
„leer“ (statt Box eine kurze Meldung), „liste“ (bis 5 Einträge: Hausaufgaben, Inhalte, Stundenplan)
oder „kompakt“ (Hausaufgaben einzeln, der Rest je Kurs gezählt, ab 5 Kursen „und N weitere“).
Die Box bleibt bis „Schließen“ (`offen`). Antippen einer Zeile klappt sie zu einer Zeile mit
`zusammenfassung` zu (`zustand.neuZu`, nur bis zum Neuladen), der Titel klappt sie wieder auf. Im Archiv setzt `eintragMarke` „neu“ oder „geändert“ am
Datum, die Kursliste hängt `neuJeKurs` an. Das Lesezeichen bekommt weiter nur die Zähler zurück.
Export-Dateien laufen nicht über den Bericht.

**Einstellungen.** Eine Übersicht mit einer Zeile je Thema (Beim Öffnen, Kurse, Vorschau,
Daten, Abgleich), jeweils mit dem aktuellen Stand darunter. Details stehen auf Unterseiten.

## Schultag-Vorschau

Der Reiter „Vorschau“ zeigt den nächsten Schultag: bis zum Unterrichtsbeginn (Standard 08:00)
den heutigen Tag, danach den nächsten. Wochenenden, freie Tage und Tage ohne Kurse werden
übersprungen, höchstens 14 Tage weit. Je Kurs steht die Hausaufgabe zuerst und in voller
Schrift, darunter das letzte Thema und wann der Eintrag war. Liegt der letzte Eintrag länger
als 21 Tage zurück, ist das Datum markiert. Die Pfeile blättern zu weiteren Schultagen. In den
Einstellungen („Beim Öffnen“) lässt sich die Vorschau als Startansicht wählen.

Woher die Vorschau weiß, welche Kurse an einem Tag sind, steht in der Zeile unter dem Datum:

1. **Gemessen**: der Stundenplan aus Schulmanager. Das Lesezeichen holt ihn im selben Abruf mit
   (`schedules/get-actual-lessons`, Montag der laufenden Woche bis Sonntag der Folgewoche). Die
   Kurse stehen in der Reihenfolge des Tages. Ein entfallender Kurs erscheint als neutrale Karte mit
   rot durchgestrichenem Namen an der Stelle seiner ersten Stunde (`tagesablauf` in `kern/logik.js`), die Kopfzeile zählt ihn
   mit („· 1 entfällt“). Vertretungen sind markiert. Fächer aus dem Stundenplan werden den
   Kursen im Archiv zugeordnet: gleiche Namen automatisch, sonst fragt die Karte nach. „Nicht
   anzeigen“ blendet ein Fach in der Vorschau aus (Einstellungen → Vorschau → Fächer im
   Stundenplan). Klausuren und andere Sondertermine fremder Kurse, die Schulmanager der ganzen
   Klasse mitliefert (dort grün), lässt der Viewer weg; Termine der eigenen Kurse bleiben.
2. **Abgeleitet**: aus den Einträgen der letzten 56 Tage, also welcher Kurs an welchem Wochentag
   regelmäßig Einträge hatte. Unsichere Treffer sind markiert.
3. **Manuell**: unter Einstellungen → Vorschau → Wochenplan lässt sich je Wochentag ein Kurs
   fest setzen oder ausschließen. Das gewinnt gegen die Ableitung.

Darunter steht leise, wann zuletzt abgerufen wurde, ab drei Tagen als „evtl. veraltet“ markiert.
Nennt die Herkunft-Zeile denselben Abruf schon, entfällt die Zeile. Ist der letzte Abruf
fehlgeschlagen, entfällt sie auch; dann steht oben die rote Erinnerung (siehe unten). Die Vorschau
zeigt weder Stundennummer noch Uhrzeit; die Nummer aus dem Stundenplan bestimmt nur die
Reihenfolge.

**Lücken.** Je Kurs sucht `baueDigest` im gemessenen Stundenplan den letzten Tag vor dem
gezeigten Tag, an dem der Kurs stattfand (ohne Entfall, „Nicht anzeigen“ und freie Tage). Ohne
Uhrzeiten gilt der heutige Tag ab Unterrichtsbeginn als gehalten. Hat das Archiv für diesen oder
einen späteren Tag keinen Eintrag, trägt die Karte die Marke „Letzte Stunde fehlt“. Die Ursache
steht bewusst nicht dabei: Entweder hat die Lehrkraft nichts eingetragen, oder der Abruf war
vorher. Die Stand-Zeile oben im Archiv zählt die gehaltenen Schulstunden seit dem letzten Abruf
(`stundenSeitAbruf`); reicht der Stundenplan nicht bis heute, heißt es „mehr als“.

**Erinnerung.** Unter den Reitern Archiv, Vorschau und Eintragen steht bei Rückstand eine
Erinnerung (`erinnerung` in `kern/logik.js`), die sich nicht wegtippen lässt. Rot, solange der
letzte Abruf fehlgeschlagen ist. Gelb, wenn seit dem letzten Abruf Unterricht war („Seit dem Abruf
am Mo 14.09. waren 5 Schulstunden.“), gezählt wie bei `stundenSeitAbruf` (ein Tag gilt nur als nach
dem Abruf, wenn der Abruf vorher lag oder am selben Tag vor Unterrichtsbeginn). Stunden von heute
zählen erst ab „Erinnerung ab“ (Einstellungen → Vorschau, Standard 15:00), frühere Tage sofort.
Reicht der Stundenplan nicht so weit und liegt der Abruf mehr als `syncWarnungNachTagen` Tage
zurück, heißt sie „Letzter Abruf vor … Tagen.“, an freien Tagen nicht. Sie hat den Link zum
Schulmanager und „Wie geht das?“, das eine Kurzanleitung zum Lesezeichen aufklappt (Schritt je
Gerät nach User-Agent). Neu geprüft wird bei jedem Rendern und beim Zurückkehren in den Tab; ein
Abruf, auch per Abgleich von einem anderen Gerät, lässt sie verschwinden. Die Marke „Letzte Stunde
fehlt“ auf den Karten der Vorschau bleibt davon unberührt.

## Abgleich zwischen Geräten

Optional, unter Einstellungen → Abgleich. Ein Gerät legt die Ablage an und schickt den
Kopplungslink an die anderen Geräte (`navigator.share`, sonst Zwischenablage). Danach gleichen alle
gekoppelten Geräte über ein Dokument in Firestore ab.

Vorerst privat: Die Zeile „Abgleich“ erscheint nur auf gekoppelten Geräten, auf anderen erst nach
Öffnen von `./#abgleich`. Das allein hält niemanden ab, deshalb verbieten die Regeln das Anlegen
neuer Dokumente (`allow create: if false`). Die bestehende Ablage lässt sich weiter lesen und
schreiben. Für eine neue Ablage `create` vorübergehend wie `update` erlauben.

**Schlüssel.** `geheimnisErzeugen` liefert 32 Zufallsbytes (base64url, 43 Zeichen). Per
HKDF-SHA-256 (`ableiten` in `kern/verschluesselung.js`) ergeben sich daraus die Dokument-ID
(64 Hex-Zeichen) und ein AES-GCM-Schlüssel (256 Bit). Das Geheimnis liegt im localStorage unter
`unterrichtsarchiv:abgleich`, zusammen mit dem Stand des letzten Abgleichs, nie im Bestand und nie
im Export. Der Kopplungslink trägt es im Fragment (`#koppeln=…`), das der Browser nicht an GitHub
schickt; der Viewer entfernt es nach dem Lesen per `history.replaceState`. Wer den Link hat, kann
die Ablage lesen und schreiben.

**Ablage.** Firestore-Projekt `daten-ablage---u-archiv`, Datenbank `(default)` in `europe-west3`,
Spark-Tarif ohne Zahlungsmittel. `quellen/ablage.js` spricht die REST-Schnittstelle ohne SDK an.
Ein Dokument `ablagen/<Dokument-ID>` mit genau drei Feldern: `daten` (base64url von AES-GCM über ein
Formatbyte und das gzip-JSON des ganzen Bestands), `iv` und `version`. Firestore sieht nur
Chiffretext, Größe und Zeitpunkte. Geschrieben wird mit Vorbedingung (`currentDocument.updateTime`
bzw. `exists=false`). Hat ein anderes Gerät dazwischen geschrieben, holt `abgleichen` neu, führt
zusammen und versucht es bis zu dreimal. Unveränderte Stände werden nicht erneut geschrieben. Über
900 000 Zeichen wird nicht geschrieben (Firestore erlaubt 1 MiB je Dokument), ab 700 000 warnt die
Seite Abgleich.

Regeln in der Firebase-Konsole:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /ablagen/{id} {
      allow get, delete: if id.size() == 64;
      allow update: if id.size() == 64
        && request.resource.data.keys().hasOnly(['daten', 'iv', 'version'])
        && request.resource.data.daten is string
        && request.resource.data.daten.size() < 900000;
      allow create, list: if false;
    }
  }
}
```

Projekt-ID und API-Schlüssel stehen in `quellen/ablage.js`. Bei Firebase sind sie nicht geheim,
geschützt wird über die Regeln. Live geprüft am 2026-09-14: Anlegen und Lesen, veralteter Stand
abgewiesen (400 FAILED_PRECONDITION), Auflisten, kurze IDs und Zusatzfelder verboten (403).

**Zusammenführen** (`zusammenfuehren` in `kern/abgleich.js`, Ergebnis unabhängig von der Reihenfolge):

- Einträge aus dem Schulmanager: vereinigen. Ein leeres Feld überschreibt nie, bei abweichendem
  Text gewinnt das jüngere `geaendert`. Das Archiv schrumpft nie.
- Eigene Einträge: das jüngere `geaendertUm` gewinnt. Gelöschte hinterlassen in `geloescht` einen
  Grabstein, der ältere Stände schlägt. Grabsteine über 180 Tage fallen weg.
- Stundenplan: das Fenster des jüngeren Abrufs ersetzt die Tage des älteren (`stundenplanUebernehmen`).
- `kurszuordnung` je Fach, manuell schlägt automatisch. `kursAlias`, `klausurschnitt` und
  `einstellungen` kommen als Ganzes vom Gerät mit dem jüngeren Stand in `staende`. Ohne Stand auf
  beiden Seiten werden die Schlüssel vereinigt. „Ablage anlegen“ setzt alle Stände, damit beim
  ersten Koppeln das anlegende Gerät die Einstellungen vorgibt.
- `letzterAbruf` und `sync`: jeweils der jüngste Zeitpunkt; ein Fehler vor dem letzten Erfolg fällt weg.

Stempel setzt niemand von Hand: `speichern()` vergleicht mit dem zuletzt geschriebenen Bestand
(`aenderungenStempeln`) und stempelt neue oder geänderte eigene Einträge, verschwundene eigene
Einträge und geänderte Blöcke. Was aus der Ablage kommt, wird ohne Stempel geschrieben.

**Wann.** Beim Öffnen, beim Zurückwechseln in den Tab (`visibilitychange`, `pageshow`), wenn das
Netz zurückkommt, und zwei Sekunden nach jedem Speichern. Kein Takt, keine Schleife. Ohne
Verbindung steht „wartet auf Verbindung“ in der Übersicht, nachgeholt wird beim nächsten Anlass.
Andere Fehler stehen rot auf der Seite Abgleich und werden einmal gemeldet. „Archiv löschen“
beendet den Abgleich auf diesem Gerät, sonst käme alles aus der Ablage zurück.

## Aufbau

```
kern/          reine Logik ohne Browser-Zugriff: Erkennung, Normalisierung, Merge, Filter, Speicher,
               Schultag-Vorschau (logik.js: Wochenplan, nächster Schultag, Digest, Statuszeilen),
               Abgleich (abgleich.js: Zusammenführen, Stempel), Verschlüsselung (WebCrypto)
quellen/       Abrufschicht: Empfang per postMessage, Datei-Import (austauschbar), Firestore-Ablage
ui/            Viewer-Oberfläche
bookmarklet/   Quelle (src.js, helfer.js) und gebauter Einzeiler (bookmarklet.js) des Lesezeichens
referenz/      echte, anonymisierte API-Antworten als Testdaten
tests/         node --test, läuft ohne Abhängigkeiten
tools/         Build (Bookmarklet, Service-Worker-Version), Icons, lokaler Server, Schulmanager-Attrappe
docs/          diese Datei
```

Keine npm-Abhängigkeiten. `npm test` führt die Tests aus, `npm run build` baut das
Bookmarklet und stempelt den Service Worker, `npm run serve` startet einen lokalen Server.

Nach Änderungen an `bookmarklet/`, `index.html`, `install.html`, `ui/`, `kern/`, `quellen/`
oder `manifest.json` muss `npm run build` laufen: `bookmarklet/bookmarklet.js` und die
`VERSION` in `sw.js` sind committete Build-Ergebnisse, ein Test schlägt fehl, wenn sie
veraltet sind.

## Lokal prüfen

```
npm run serve                      # Viewer auf http://localhost:8080
node tools/serve.mjs 8081 tools/fake-schulmanager
node tools/build.mjs --viewer http://localhost:8080/ --origin http://localhost:8081 \
  --out tools/fake-schulmanager/bookmarklet-test.js
```

`http://localhost:8081` ist eine Schulmanager-Attrappe: sie stellt `/api/login-status` und
`/api/calls` mit den Fixtures nach und führt den Testbuild aus. Schalter simulieren einen
blockierten Popup, eine falsche Teilantwort (404), Rate-Limit (429) und zwei Schüler.
Der Viewer akzeptiert localhost-Absender nur, wenn er selbst auf localhost läuft.

## Datenmodell

Ein `localStorage`-Schlüssel `unterrichtsarchiv:v1`, Schema-Version 2. Version 1 wird beim
Lesen migriert und einmal zurückgeschrieben.

```
schemaVersion, letzterAbruf, kursAlias, klausurschnitt,
eintraege[]:   { id, kurs, datum, thema, hausaufgabe, position, ersterfasst, geaendert, geaendertUm? }
stundenplan:   { abgerufenAm, fenster: { von, bis }, tage: { "JJJJ-MM-TT": [ { stunde, fach, raum, status } ] } }
kurszuordnung: { "<Fach im Stundenplan>": { kurs, quelle: "auto" | "manuell", bestaetigt } }
sync:          { letzterLauf, letzterErfolg, letzterFehler: { zeit, art, text }, quelle }
einstellungen: { wochenplan: { fensterTage, overrides }, freieTage, schulbeginn, altSchwelleTage,
                 stundenplanStaleTage, startReiter, syncWarnungNachTagen }
geloescht:     { "<id>": Zeitpunkt }      Grabsteine gelöschter eigener Einträge (Abgleich)
staende:       { kurszuordnung?, kursAlias?, klausurschnitt?, einstellungen?: Zeitpunkt }
```

`geaendertUm`, `geloescht` und `staende` kamen mit dem Abgleich dazu, ohne neue Schema-Version:
Fehlen sie, gelten sie als leer. `geaendertUm` tragen nur eigene Einträge.

`id` ist `kurs|datum|position`. Schulmanager liefert keine Stundennummer, nur „Inhalt an
diesem Tag". `position` ist deshalb eine laufende Nummer je Kurs und Tag in Lieferreihenfolge
und wird nirgends angezeigt. Kursnamen werden roh gespeichert, ein Alias wirkt nur beim Anzeigen.

Selbst eingetragene Einträge sind normale Einträge mit `thema: ""` und `position` ab 1001
(`EIGENE_POSITION_AB` in `kern/mergen.js`). Der Schulmanager zählt je Kurs und Tag ab 1, ein Abruf
trifft ihre ID deshalb nie, und sie stehen unter den Einträgen der Lehrkraft. Ein Merkmal „eigen“
braucht es nicht: Prüfung beim Lesen, Export und Import behalten sie unverändert. Sie zählen wie
jeder Eintrag, schließen also auch „Letzte Stunde fehlt“. Einziges Zusatzfeld ist das freiwillige
Abgabedatum `bis` („YYYY-MM-DD“, nach `datum`); `pruefeBestand` verwirft es an Einträgen aus dem
Schulmanager und bei ungültigem Datum.

Zwei Arten von Daten, zwei Regeln: `eintraege` ist das Archiv und schrumpft nie. `stundenplan`
ist ein Cache; ein neuer Abruf ersetzt die Tage im abgerufenen Fenster vollständig, damit
entfallene Stunden auch wieder verschwinden. Der Cache enthält weder Lehrkraft noch IDs noch
Kommentare, nur Stunde, Fach, Raum, Status; `stunde` dient nur der Reihenfolge und wird nicht
angezeigt. Als Fach gilt der Name aus dem Stundenplan (`subject.name`, sonst das Kurskürzel);
der ist mit dem Kursnamen aus dem Klassenbuch identisch, deshalb passt die Zuordnung meist von
selbst. `kurs: null` in `kurszuordnung` heißt „nicht anzeigen“.

Der Export enthält Archiv, Alias, Klausurschnitte und Einstellungen, aber weder den
Stundenplan-Cache noch den Sync-Status. Grabsteine und Stände kommen mit, das Kopplungsgeheimnis
nie. Beim Import einer Export-Datei gewinnen bei den Einstellungen die lokalen Werte; freie Tage
werden vereinigt.

## Merge-Regeln

Beim Import einer neuen Antwort: unbekannte ID einfügen, gleicher Text nichts tun, anderer
Text ersetzen und `geaendert` setzen, fehlende Einträge behalten. Das Archiv schrumpft nie.
Ein leeres Feld in der Antwort überschreibt keinen gespeicherten Text.

Einzige Ausnahme vom Schrumpfen: eigene Einträge lassen sich ändern und löschen. Ändern mit
anderem Kurs oder Tag legt den Eintrag unter neuem Schlüssel an, `ersterfasst` bleibt. Neue eigene
Einträge bekommen als `position` die Millisekunden des Anlegens, zwei Geräte vergeben also nie
dieselbe ID. Ältere Einträge mit 1001, 1002 … bleiben gültig. Haben zwei Geräte dieselbe alte ID
mit verschiedenem Text, behält der Abgleich beide.

Bekannte Grenze des Schlüssels: löscht die Lehrkraft den ersten von zwei Einträgen eines
Tages, rückt der zweite auf Position 1 (erscheint als geändert) und Position 2 bleibt als
Altbestand stehen.

## Stand der Prüfung im echten Schulmanager (2026-09-13)

Bestätigt:

- `get-topics` und `get-homework` antworten beide mit 200 in einem Abruf (35 Datensätze,
  nach dem Zusammenführen 30 Einträge). Antwortet eine Teilanfrage nicht mit 200, nennt die
  Statusbox weiterhin den Namen.
- `/api/login-status` antwortet per POST (Body `{}`), GET liefert 404. Die Antwort hat die
  Form `{ isAuthenticated, user: { …, associatedStudent: { id, … } } }`. Die Sitzungsdaten im
  Browser (Schlüssel `user`, `jwt`) enthalten keine Zuordnung, deshalb ist login-status der
  reguläre Weg. Bei mehreren Schülern fragt das Lesezeichen nach.
- Die Übergabe an den Viewer per postMessage funktioniert; Schulmanager blockt das geöffnete
  Fenster nicht. Der Download-Rückfall bleibt für den Fall, dass sich das ändert.
- `schedules/get-actual-lessons` mit `student`, `start`, `end` antwortet mit 200 (2026-09-13,
  66 Datensätze für zwei Wochen). Sondertermine fremder Lerngruppen kommen mit und werden beim
  Umrechnen verworfen: ihre Gruppen-IDs kommen in keiner regulären oder entfallenden Stunde vor.
  Antwortet die Teilanfrage nicht mit 200, meldet der Viewer es und arbeitet ohne Stundenplan weiter.

Weiter offen:

- Ob der Server die Sitzung über das Cookie oder das Token im Storage erkennt, ist unbekannt.
  Beides wird mitgeschickt und das reicht. 401 oder 403 → „Sitzung nicht erkannt“.
- `bundleVersion` fand das Lesezeichen weder in der Seite noch im Speicher noch in den ersten
  drei eigenen Skripten; der Rückfallwert `a6ef588fd2` wurde vom Server angenommen. Lehnt der
  Server ihn nach einem Schulmanager-Update ab, meldet die Statusbox den HTTP-Fehler samt Wert.
- Schlägt die Schüler-Zuordnung fehl, zeigt die Statusbox eine Diagnose: Storage-Schlüsselnamen,
  Feldnamen der Sitzungsdaten (nie Werte), ob ein Token da ist und welche API-Pfade die Seite
  selbst aufruft.

## Rahmen

Ein Abruf im Schulmanager pro Klick, kein Hintergrund-Sync. Der Abgleich zwischen Geräten läuft
nur zu festen Anlässen (Öffnen, Zurückwechseln, Speichern), nie in einer Schleife. Anwesenheiten, Noten, Lehrkräfte und Namen von
Mitschülern werden nie gespeichert.
