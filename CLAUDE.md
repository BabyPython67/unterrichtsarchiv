# Unterrichtsarchiv — Hinweise für Claude Code

Eigenständiges Projekt, nicht verwandt mit anderen Repos im Workspace.

## Regeln, die nicht verhandelbar sind

- Kein Server, kein Backend, keine Entgegennahme von Schulmanager-Passwörtern. Das Bookmarklet
  nutzt nur die bestehende Session im eingeloggten Tab.
- Das Repo ist öffentlich und enthält nur Code. Keine Nutzerdaten, keine Schüler-IDs, keine
  Namen. Die Fixtures in `referenz/` sind anonymisiert (Schüler-ID = 0).
- Ein Abruf pro Klick. Kein Polling, keine Retry-Schleifen, bei HTTP 429 abbrechen.
- Anwesenheiten, Noten, Lehrkräfte, Namen von Mitschülern werden beim Normalisieren verworfen.
- Kursalias nur beim Anzeigen anwenden, nie in die Einträge schreiben.
- Keine Stundennummer anzeigen oder erfinden. `position` ist interner Schlüsselteil.

## Arbeitsweise

- `kern/` bleibt frei von DOM und `window`. Jede Logikänderung dort bekommt einen Test.
- `npm test` vor jedem Commit. Nach Änderungen an `bookmarklet/src.js`, `bookmarklet/helfer.js`,
  `index.html`, `ui/` oder `sw.js`: `npm run build` (sonst schlägt der Build-Stale-Test fehl).
- Direkt auf `main` committen und pushen; GitHub Pages liefert den Branch aus.
- Nutzer kennt sich wenig mit Code aus: Erklärungen laienverständlich, technische Details nur
  auf Nachfrage.
