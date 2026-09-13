# Unterrichtsarchiv

Speichert die Unterrichtsinhalte und Hausaufgaben aus dem Schulmanager dauerhaft im Browser.
Sie lassen sich nach Kurs, Datum oder Stichwort wiederfinden. Zum Beispiel vor einer Klausur:
Was war in Mathe seit der letzten Klausur dran?

- **App öffnen:** <https://babypython67.github.io/unterrichtsarchiv/>
- **Lesezeichen holen:** <https://babypython67.github.io/unterrichtsarchiv/install.html>

Das Unterrichtsarchiv ist ein privates Projekt und gehört nicht zu Schulmanager Online.
Wie es technisch funktioniert, steht in [docs/technik.md](docs/technik.md). Was sich zuletzt
geändert hat, steht unten im [Verlauf](#verlauf).

## Erste Schritte

1. Die [Lesezeichen-Seite](https://babypython67.github.io/unterrichtsarchiv/install.html) öffnen
   und der Anleitung für das eigene Gerät folgen (Computer, iPhone/iPad oder Android).
2. Im Schulmanager einloggen.
3. Dort das Lesezeichen antippen. Die App öffnet sich und übernimmt die Daten. Klappt der Wechsel
   nicht, führt „Zum Unterrichtsarchiv“ in der Box oben rechts zur App.

Die App holt nichts von selbst. Das Lesezeichen also ab und zu antippen, zum Beispiel einmal pro
Woche. Was einmal im Archiv ist, bleibt dort, auch wenn es im Schulmanager später verschwindet.

### Am iPhone

- Das Lesezeichen in den **Favoriten** ablegen. Dann erscheint es als Kachel, sobald man im
  Schulmanager in die Adressleiste tippt.
- Symbol auf dem Home-Bildschirm: die App in Safari öffnen, Teilen → „Zum Home-Bildschirm“ und
  dabei den Schalter **„Als Web-App öffnen“ ausschalten**. Ist er an, hat das Symbol einen eigenen
  Speicher und bekommt keine Daten vom Lesezeichen.

## Archiv

Das Archiv beginnt mit der Liste der Kurse. Jede Zeile zeigt, wie viele Einträge der Kurs hat und
von wann der letzte ist. Antippen öffnet die Seite des Kurses: die neuesten Einträge oben, der
neueste Monat aufgeklappt, ältere Monate öffnen sich beim Antippen. „‹ Archiv“ führt zurück.

Suche und Filter gibt es in der Kursliste und auf jeder Kursseite. In der Kursliste wirken sie über
alle Kurse, das Ergebnis steht dann nach Kurs sortiert. So lassen sich zum Beispiel alle
Hausaufgaben seit einem Datum auf einen Blick sehen. Auf der Seite eines Kurses wirken sie nur
dort.

Hinter „Filter“ lässt sich der Zeitraum wählen (Alles, Seit Klausur, Ab Datum) und die Liste auf
Einträge mit Hausaufgabe beschränken. Welche Filter gerade wirken, steht über der Liste. Antippen
nimmt einen Filter wieder weg. „Seit Klausur“ nutzt das Klausurdatum, das je Kurs eingetragen
wird: im Filter auf der Seite des Kurses oder unter Einstellungen → Kurse.

## Vorschau

Der Reiter „Vorschau“ zeigt, welche Kurse als Nächstes anstehen, in der Reihenfolge des Tages. Zu
jedem Kurs stehen die offene Hausaufgabe und das, was zuletzt dran war. Mit den Pfeilen geht es zu
den folgenden Schultagen. Auf Wunsch startet die App gleich mit der Vorschau (Einstellungen →
Beim Öffnen).

Den Stundenplan für diese und die nächste Woche holt das Lesezeichen mit.

- Fällt ein Kurs aus, steht er rot durchgestrichen an seiner Stelle.
- Vertretungen sind markiert.
- Klausuren anderer Kurse, die der Schulmanager allen anzeigt, blendet die App aus.
- Heißt ein Fach im Stundenplan anders als im Archiv, fragt die Vorschau einmal, welcher Kurs
  gemeint ist. Fächer, die nicht zum eigenen Unterricht gehören, lassen sich auf „Nicht
  anzeigen“ stellen.

Für Tage, die der Stundenplan noch nicht abdeckt, schätzt die App aus den bisherigen Einträgen,
welche Kurse an welchem Wochentag sind. Unter Einstellungen → Vorschau lassen sich der Wochenplan
korrigieren und Ferien oder freie Tage eintragen.

## Was im Archiv fehlen kann

Die App übernimmt nur, was Lehrkräfte im Schulmanager eintragen.

- Nicht alle Lehrkräfte tragen Unterrichtsinhalte ein. Manche Kurse haben deshalb kaum Einträge,
  oder dort steht „Kein Inhalt eingetragen“.
- Hausaufgaben, die nur im Unterricht genannt und nicht im Schulmanager eingetragen wurden, fehlen
  auch im Archiv.

Keine Hausaufgabe in der App heißt also nicht sicher, dass nichts auf ist.

Die Vorschau gleicht deshalb mit dem Stundenplan ab. Hat die letzte Stunde eines Kurses keinen
Eintrag, steht auf seiner Karte „Letzte Stunde fehlt“. War diese Stunde nach dem letzten Abruf,
steht oben ein Hinweis: dann einfach das Lesezeichen erneut antippen. Oben in der App zeigt die
Zeile mit dem Stand, wie viele Schulstunden seitdem waren.

## Daten

- Es gibt keinen Server und kein Konto. Die App fragt nie nach dem Passwort.
- Das Lesezeichen nutzt nur die Anmeldung, die im Schulmanager-Tab sowieso besteht.
- Alles bleibt im Browser auf dem eigenen Gerät. Niemand sonst sieht es.
- Noten, Fehlzeiten, Lehrkräfte und Namen von Mitschülern werden nicht gespeichert.
- Beim Löschen der Browserdaten ist auch das Archiv weg. Deshalb ab und zu sichern:
  Einstellungen → Daten → Exportieren. Die Datei lässt sich später oder auf einem anderen Gerät
  wieder importieren.

## Wenn etwas nicht klappt

- **Statt der App wird eine Datei heruntergeladen:** Der Browser hat das neue Fenster blockiert.
  Dann die App selbst öffnen und die Datei einlesen: Einstellungen → Daten → Importieren.
- **Kein Stundenplan in der Vorschau:** Das Lesezeichen ist noch das alte. Neu anlegen und die
  Build-Kennung vergleichen.
- **Die App auf dem Home-Bildschirm bleibt leer:** Sie wurde als Web-App hinzugefügt und hat einen
  eigenen Speicher. Falls dort Einträge liegen, erst exportieren. Dann das Symbol entfernen und neu
  hinzufügen, diesmal mit „Als Web-App öffnen“ aus.
- **Fehlermeldung im Schulmanager:** Oben rechts steht eine Box mit „Meldung kopieren“. Den Text
  an mich schicken.

## Verlauf

Nur Änderungen, die man bei der Benutzung merkt, die neuesten oben. Steht **Lesezeichen neu
anlegen** dabei, auf der Lesezeichen-Seite das Lesezeichen noch einmal anlegen, genau wie beim
ersten Mal. Ob es aktuell ist, zeigt die Build-Kennung: Sie steht auf der Lesezeichen-Seite und in
der Box, die nach dem Antippen im Schulmanager erscheint. Stimmen beide überein, passt es. Bei
allen anderen Änderungen reicht es, die App neu zu laden.

- **13.09.2026:** Das Archiv beginnt mit einer Kursliste. Jeder Kurs hat eine eigene Seite, die
  neuesten Einträge stehen oben, ältere Monate sind zugeklappt. Suche und Filter über alle Kurse
  gibt es weiterhin.
- **13.09.2026:** Das Lesezeichen holt den Stundenplan mit. Die Vorschau zeigt die Kurse in der
  Reihenfolge des Tages, markiert Ausfall und Vertretung und weist auf fehlende Einträge hin.
  Nach dem Antippen wechselt das Lesezeichen von selbst zur App. Einstellungen und Filter sind
  übersichtlicher. **Lesezeichen neu anlegen.**
- **11.09.2026:** Vorschau auf den nächsten Schultag.
- **11.09.2026:** Erste Version: Archiv nach Kursen, Suche, „Seit Klausur“, Export und Import.
