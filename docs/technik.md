# Unterrichtsarchiv: Technik

Wie die App funktioniert, wie sie gebaut und geprüft wird. Für die Benutzung reicht die
[README](../README.md).

- Kein Server, kein Konto, kein Passwort. Die Daten liegen nur im Browser des Nutzers.
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

**Einstellungen.** Eine Übersicht mit einer Zeile je Thema (Beim Öffnen, Kurse, Vorschau,
Daten), jeweils mit dem aktuellen Stand darunter. Details stehen auf Unterseiten.

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
fehlgeschlagen, erscheint stattdessen ein roter Hinweis mit Link zum Schulmanager. Die Vorschau
zeigt weder Stundennummer noch Uhrzeit; die Nummer aus dem Stundenplan bestimmt nur die
Reihenfolge.

**Lücken.** Je Kurs sucht `baueDigest` im gemessenen Stundenplan den letzten Tag vor dem
gezeigten Tag, an dem der Kurs stattfand (ohne Entfall, „Nicht anzeigen“ und freie Tage). Ohne
Uhrzeiten gilt der heutige Tag ab Unterrichtsbeginn als gehalten. Hat das Archiv für diesen oder
einen späteren Tag keinen Eintrag, trägt die Karte die Marke „Letzte Stunde fehlt“. Die Ursache
steht bewusst nicht dabei: Entweder hat die Lehrkraft nichts eingetragen, oder der Abruf war
vorher. Lag die Stunde nach dem letzten Abruf (am selben Tag nur, wenn der Abruf vor
Unterrichtsbeginn war), ersetzt ein gelber Hinweis „Seit dem letzten Abruf am … war Unterricht.“
die leise Abrufzeile. Er und der rote Fehlerhinweis haben den Link zum Schulmanager und
„Wie geht das?“, das eine Kurzanleitung zum Lesezeichen aufklappt (Schritt je Gerät nach
User-Agent). Die Stand-Zeile oben zählt die gehaltenen Schulstunden seit dem letzten Abruf
(`stundenSeitAbruf`); reicht der Stundenplan nicht bis heute, heißt es „mehr als“.

## Aufbau

```
kern/          reine Logik ohne Browser-Zugriff: Erkennung, Normalisierung, Merge, Filter, Speicher,
               Schultag-Vorschau (logik.js: Wochenplan, nächster Schultag, Digest, Statuszeilen)
quellen/       Abrufschicht: Empfang per postMessage, Datei-Import (austauschbar)
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
eintraege[]:   { id, kurs, datum, thema, hausaufgabe, position, ersterfasst, geaendert }
stundenplan:   { abgerufenAm, fenster: { von, bis }, tage: { "JJJJ-MM-TT": [ { stunde, fach, raum, status } ] } }
kurszuordnung: { "<Fach im Stundenplan>": { kurs, quelle: "auto" | "manuell", bestaetigt } }
sync:          { letzterLauf, letzterErfolg, letzterFehler: { zeit, art, text }, quelle }
einstellungen: { wochenplan: { fensterTage, overrides }, freieTage, schulbeginn, altSchwelleTage,
                 stundenplanStaleTage, startReiter, syncWarnungNachTagen }
```

`id` ist `kurs|datum|position`. Schulmanager liefert keine Stundennummer, nur „Inhalt an
diesem Tag". `position` ist deshalb eine laufende Nummer je Kurs und Tag in Lieferreihenfolge
und wird nirgends angezeigt. Kursnamen werden roh gespeichert, ein Alias wirkt nur beim Anzeigen.

Selbst eingetragene Einträge sind normale Einträge mit `thema: ""` und `position` ab 1001
(`EIGENE_POSITION_AB` in `kern/mergen.js`). Der Schulmanager zählt je Kurs und Tag ab 1, ein Abruf
trifft ihre ID deshalb nie, und sie stehen unter den Einträgen der Lehrkraft. Ein eigenes Feld
braucht es nicht: Prüfung beim Lesen, Export und Import behalten sie unverändert. Sie zählen wie
jeder Eintrag, schließen also auch „Letzte Stunde fehlt“.

Zwei Arten von Daten, zwei Regeln: `eintraege` ist das Archiv und schrumpft nie. `stundenplan`
ist ein Cache; ein neuer Abruf ersetzt die Tage im abgerufenen Fenster vollständig, damit
entfallene Stunden auch wieder verschwinden. Der Cache enthält weder Lehrkraft noch IDs noch
Kommentare, nur Stunde, Fach, Raum, Status; `stunde` dient nur der Reihenfolge und wird nicht
angezeigt. Als Fach gilt der Name aus dem Stundenplan (`subject.name`, sonst das Kurskürzel);
der ist mit dem Kursnamen aus dem Klassenbuch identisch, deshalb passt die Zuordnung meist von
selbst. `kurs: null` in `kurszuordnung` heißt „nicht anzeigen“.

Der Export enthält Archiv, Alias, Klausurschnitte und Einstellungen, aber weder den
Stundenplan-Cache noch den Sync-Status. Beim Import einer Export-Datei gewinnen bei den
Einstellungen die lokalen Werte; freie Tage werden vereinigt.

## Merge-Regeln

Beim Import einer neuen Antwort: unbekannte ID einfügen, gleicher Text nichts tun, anderer
Text ersetzen und `geaendert` setzen, fehlende Einträge behalten. Das Archiv schrumpft nie.
Ein leeres Feld in der Antwort überschreibt keinen gespeicherten Text.

Einzige Ausnahme vom Schrumpfen: eigene Einträge lassen sich ändern und löschen. Ändern mit
anderem Kurs oder Tag legt den Eintrag unter neuem Schlüssel an, `ersterfasst` bleibt. Bekannte
Grenze: Legen zwei Geräte am selben Tag für denselben Kurs je einen eigenen Eintrag an, haben beide
die ID `…|1001`. Beim Import einer Export-Datei ersetzt dann der eine Text den anderen.

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

Ein Abruf pro Klick, kein Hintergrund-Sync. Anwesenheiten, Noten, Lehrkräfte und Namen von
Mitschülern werden nie gespeichert.
