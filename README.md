# Unterrichtsarchiv

Sammelt Unterrichtsinhalte und Hausaufgaben aus Schulmanager Online dauerhaft im eigenen
Browser und macht sie nach Kurs, Datum und Suchwort durchsuchbar. Zweck: Vorbereitung auf
Klausuren und Abitur — „Was wurde in Mathe seit der letzten Klausur behandelt?" Die Vorschau
zeigt dazu den nächsten Schultag: welche Kurse anstehen, was dort zuletzt dran war und welche
Hausaufgabe offen ist.

- Kein Server, kein Konto, kein Passwort. Die Daten liegen nur im Browser des Nutzers.
- Ein Lesezeichen (Bookmarklet) holt die Daten aus dem Tab, in dem man ohnehin eingeloggt ist.
- Der Viewer läuft als statische Seite auf GitHub Pages und enthält nur Code, keine Daten.

Viewer: <https://babypython67.github.io/unterrichtsarchiv/> ·
Lesezeichen anlegen: <https://babypython67.github.io/unterrichtsarchiv/install.html>

## Benutzung

1. `install.html` öffnen und den blauen Link in die Lesezeichenleiste ziehen (am Handy: die
   Adresse aus dem Textfeld als Lesezeichen speichern, Anleitung steht auf der Seite).
2. Im Schulmanager einloggen und dort das Lesezeichen anklicken. Es öffnet den Viewer in einem
   neuen Tab, holt Inhalte und Hausaufgaben mit der bestehenden Sitzung ab und schickt sie per
   `postMessage` an den Viewer. Oben rechts im Schulmanager-Tab erscheint eine Statusbox mit
   „Meldung kopieren“ für Fehlermeldungen.
3. Kommt der Viewer nicht an die Daten (Popup blockiert, 15 s ohne Antwort), lädt das
   Lesezeichen stattdessen `unterricht-JJJJ-MM-TT.json` herunter. Diese Datei im Viewer unter
   Einstellungen → Daten → „Importieren“ einlesen. Dasselbe funktioniert mit Export-Dateien des
   Viewers.

Die Einstellungen sind eine Übersicht mit einer Zeile je Thema (Beim Öffnen, Kurse, Vorschau,
Daten), jeweils mit dem aktuellen Stand darunter. Details stehen auf Unterseiten.

Der Viewer ist als PWA installierbar („Zum Startbildschirm“). Der Service Worker cached nur
die App-Dateien, nie Nutzerdaten; nach jedem Deploy mit geänderter Shell bekommt er einen
neuen Cache-Namen und räumt den alten weg. `install.html` und der Lesezeichen-Code werden bei
bestehender Verbindung immer frisch geholt, damit nach einem Update nie ein altes Lesezeichen
gezogen wird. Statusbox und `install.html` zeigen dieselbe Build-Kennung (acht Zeichen); weicht
sie ab, ist das Lesezeichen veraltet und muss neu gezogen werden.

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
   Kurse stehen in der Reihenfolge des Tages, entfallene Stunden durchgestrichen, Vertretungen
   markiert. Fächer aus dem Stundenplan werden den Kursen im Archiv zugeordnet: gleiche Namen
   automatisch, sonst fragt die Karte nach. „Nicht anzeigen“ blendet ein Fach in der Vorschau
   aus (Einstellungen → Vorschau → Fächer im Stundenplan).
2. **Abgeleitet**: aus den Einträgen der letzten 56 Tage, also welcher Kurs an welchem Wochentag
   regelmäßig Einträge hatte. Unsichere Treffer sind markiert.
3. **Manuell**: unter Einstellungen → Vorschau → Wochenplan lässt sich je Wochentag ein Kurs
   fest setzen oder ausschließen. Das gewinnt gegen die Ableitung.

Darunter steht leise, wann zuletzt abgerufen wurde, ab drei Tagen als „evtl. veraltet“ markiert.
Nennt die Herkunft-Zeile denselben Abruf schon, entfällt die Zeile. Ist der letzte Abruf
fehlgeschlagen, erscheint stattdessen ein roter Hinweis mit Link zum Schulmanager. Sie zeigt weder Stundennummer
noch Uhrzeit; die Nummer aus dem Stundenplan bestimmt nur die Reihenfolge.

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

Bekannte Grenze des Schlüssels: löscht die Lehrkraft den ersten von zwei Einträgen eines
Tages, rückt der zweite auf Position 1 (erscheint als geändert) und Position 2 bleibt als
Altbestand stehen.

## Stand der Prüfung im echten Schulmanager (2026-09-11)

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

Weiter offen:

- Ob der Server die Sitzung über das Cookie oder das Token im Storage erkennt, ist unbekannt.
  Beides wird mitgeschickt und das reicht. 401 oder 403 → „Sitzung nicht erkannt“.
- `bundleVersion` fand das Lesezeichen weder in der Seite noch im Speicher noch in den ersten
  drei eigenen Skripten; der Rückfallwert `a6ef588fd2` wurde vom Server angenommen. Lehnt der
  Server ihn nach einem Schulmanager-Update ab, meldet die Statusbox den HTTP-Fehler samt Wert.
- Schlägt die Schüler-Zuordnung fehl, zeigt die Statusbox eine Diagnose: Storage-Schlüsselnamen,
  Feldnamen der Sitzungsdaten (nie Werte), ob ein Token da ist und welche API-Pfade die Seite
  selbst aufruft.
- Der Stundenplan-Abruf ist aus einer mitgeschnittenen Antwort abgeleitet
  (`referenz/antwort-stundenplan.json`, anonymisiert). Die Form der Anfrage
  (`schedules/get-actual-lessons` mit `student`, `start`, `end`) ist noch nicht im echten
  Schulmanager bestätigt. Antwortet die Teilanfrage nicht mit 200, meldet der Viewer es und
  arbeitet ohne Stundenplan weiter.

## Rahmen

Ein Abruf pro Klick, kein Hintergrund-Sync. Vor der Weitergabe an Mitschüler eine kurze Mail
an den Schulmanager-Support. Anwesenheiten, Noten und Namen werden nie gespeichert.
