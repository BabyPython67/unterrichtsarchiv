# Unterrichtsarchiv — Hinweise für Claude Code

Eigenständiges Projekt, nicht verwandt mit anderen Repos im Workspace.

## Regeln, die nicht verhandelbar sind

- Kein eigener Server, keine Entgegennahme von Schulmanager-Passwörtern. Das Bookmarklet nutzt
  nur die bestehende Session im eingeloggten Tab.
- Einziger Online-Speicher ist die Ablage für den Abgleich zwischen Geräten (Firestore,
  `quellen/ablage.js`). Dorthin geht der Bestand nur Ende-zu-Ende-verschlüsselt
  (`kern/verschluesselung.js`). Das Geheimnis liegt unter eigenem Schlüssel im localStorage, nie
  im Bestand, im Export oder in einer URL, außer im Fragment des Kopplungslinks.
- Das Repo ist öffentlich und enthält nur Code. Keine Nutzerdaten, keine Schüler-IDs, keine
  Namen. Die Fixtures in `referenz/` sind anonymisiert (Schüler-ID = 0).
- Ein Abruf pro Klick. Kein Polling, keine Retry-Schleifen, bei HTTP 429 abbrechen.
- Anwesenheiten, Noten, Lehrkräfte, Namen von Mitschülern werden beim Normalisieren verworfen.
  Das gilt auch für den Stundenplan-Cache: keine Lehrkraft, kein Name.
- Kursalias nur beim Anzeigen anwenden, nie in die Einträge schreiben.
- Keine Stundennummer anzeigen oder erfinden. `position` ist interner Schlüsselteil, `stunde`
  im Stundenplan-Cache dient nur der Reihenfolge.
- Zwei Datenarten, zwei Regeln: `eintraege` ist das Archiv und schrumpft nie. `stundenplan`
  ist ein Cache, ein neuer Abruf ersetzt die Tage im Fenster vollständig. Nie vermischen.
- Einzige Ausnahme vom Schrumpfen: selbst eingetragene Einträge (`position` ab 1001, siehe
  `kern/mergen.js`). Nur sie lassen sich in der App ändern und löschen, Einträge aus dem
  Schulmanager nie. Gelöschte eigene Einträge hinterlassen einen Grabstein (`geloescht`), damit
  das Löschen beim Abgleich auf den anderen Geräten ankommt.
- Zusammenführen zweier Bestände nur in `kern/abgleich.js` (`zusammenfuehren`). Stempel für den
  Abgleich setzt nur `aenderungenStempeln` beim Speichern, nie Code in `ui/` von Hand.
- Digest-Logik nur in `kern/logik.js` (`baueDigest`). Viewer und spätere Kurzbefehle nutzen
  dieselbe Funktion, keine zweite Implementierung.

## Oberfläche

- Hausaufgabe ist Inhalt, kein Nebentext: volle Schriftgröße und Textfarbe. Leise Schrift nur
  für Datum, Alter, Herkunft.
- Keine Emoji, keine Floskeln, keine Deko. Kurze Sätze, deutsch.
- Wording „Einträge“, nie „Stunden“.

## Arbeitsweise

- `kern/` bleibt frei von DOM und `window`. Jede Logikänderung dort bekommt einen Test.
- `npm test` vor jedem Commit. Nach Änderungen an `bookmarklet/src.js`, `bookmarklet/helfer.js`,
  `index.html`, `ui/`, `kern/` oder `sw.js`: `npm run build` (sonst schlägt der Build-Stale-Test fehl).
- Direkt auf `main` committen und pushen; GitHub Pages liefert den Branch aus.
- Nutzer kennt sich wenig mit Code aus: Erklärungen laienverständlich, technische Details nur
  auf Nachfrage. Nach jedem Schritt: Geändert, Warum, Auswirkung, Zu prüfen.
