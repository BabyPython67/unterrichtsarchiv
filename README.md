# Unterrichtsarchiv

Sammelt Unterrichtsinhalte und Hausaufgaben aus Schulmanager Online dauerhaft im eigenen
Browser und macht sie nach Kurs, Datum und Suchwort durchsuchbar. Zweck: Vorbereitung auf
Klausuren und Abitur — „Was wurde in Mathe seit der letzten Klausur behandelt?"

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
   Lesezeichen stattdessen `unterricht-JJJJ-MM-TT.json` herunter. Diese Datei im Viewer über
   „Importieren“ einlesen. Dasselbe funktioniert mit Export-Dateien des Viewers.

Der Viewer ist als PWA installierbar („Zum Startbildschirm“). Der Service Worker cached nur
die App-Dateien, nie Nutzerdaten; nach jedem Deploy mit geänderter Shell bekommt er einen
neuen Cache-Namen und räumt den alten weg. `install.html` und der Lesezeichen-Code werden bei
bestehender Verbindung immer frisch geholt, damit nach einem Update nie ein altes Lesezeichen
gezogen wird. Statusbox und `install.html` zeigen dieselbe Build-Kennung (acht Zeichen); weicht
sie ab, ist das Lesezeichen veraltet und muss neu gezogen werden.

## Aufbau

```
kern/          reine Logik ohne Browser-Zugriff: Erkennung, Normalisierung, Merge, Filter, Speicher
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

Ein `localStorage`-Schlüssel `unterrichtsarchiv:v1`:

```
schemaVersion, letzterAbruf, kursAlias, klausurschnitt,
eintraege[]: { id, kurs, datum, thema, hausaufgabe, position, ersterfasst, geaendert }
```

`id` ist `kurs|datum|position`. Schulmanager liefert keine Stundennummer, nur „Inhalt an
diesem Tag". `position` ist deshalb eine laufende Nummer je Kurs und Tag in Lieferreihenfolge
und wird nirgends angezeigt. Kursnamen werden roh gespeichert, ein Alias wirkt nur beim Anzeigen.

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

## Rahmen

Ein Abruf pro Klick, kein Hintergrund-Sync. Vor der Weitergabe an Mitschüler eine kurze Mail
an den Schulmanager-Support. Anwesenheiten, Noten und Namen werden nie gespeichert.
