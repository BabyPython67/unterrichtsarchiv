# Unterrichtsarchiv

Sammelt Unterrichtsinhalte und Hausaufgaben aus Schulmanager Online dauerhaft im eigenen
Browser und macht sie nach Kurs, Datum und Suchwort durchsuchbar. Zweck: Vorbereitung auf
Klausuren und Abitur — „Was wurde in Mathe seit der letzten Klausur behandelt?"

- Kein Server, kein Konto, kein Passwort. Die Daten liegen nur im Browser des Nutzers.
- Ein Lesezeichen (Bookmarklet) holt die Daten aus dem Tab, in dem man ohnehin eingeloggt ist.
- Der Viewer läuft als statische Seite auf GitHub Pages und enthält nur Code, keine Daten.

## Aufbau

```
kern/          reine Logik ohne Browser-Zugriff: Erkennung, Normalisierung, Merge, Filter, Speicher
quellen/       Abrufschicht: Empfang per postMessage, Datei-Import (austauschbar)
ui/            Viewer-Oberfläche
bookmarklet/   Quelle und gebauter Einzeiler des Lesezeichens
referenz/      echte, anonymisierte API-Antworten als Testdaten
tests/         node --test, läuft ohne Abhängigkeiten
tools/         Build (Bookmarklet, Service-Worker-Version), Icons, lokaler Server
```

Keine npm-Abhängigkeiten. `npm test` führt die Tests aus, `npm run build` baut das
Bookmarklet und stempelt den Service Worker, `npm run serve` startet einen lokalen Server.

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

## Rahmen

Ein Abruf pro Klick, kein Hintergrund-Sync. Vor der Weitergabe an Mitschüler eine kurze Mail
an den Schulmanager-Support. Anwesenheiten, Noten und Namen werden nie gespeichert.
