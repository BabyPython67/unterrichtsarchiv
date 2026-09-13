# Unterrichtsarchiv

Speichert die Unterrichtsinhalte und Hausaufgaben aus dem Schulmanager dauerhaft im Browser.
Sie lassen sich nach Kurs, Datum oder Stichwort wiederfinden. Zum Beispiel vor einer Klausur:
Was war in Mathe seit der letzten Klausur dran?

- **App öffnen:** <https://babypython67.github.io/unterrichtsarchiv/>
- **Lesezeichen holen:** <https://babypython67.github.io/unterrichtsarchiv/install.html>

## Neu seit der ersten Version

**Zuerst: Lesezeichen neu anlegen.** Auf der Lesezeichen-Seite das Lesezeichen noch einmal
anlegen, genau wie beim ersten Mal. Das alte kann weg, es holt den Stundenplan nicht mit. Ob die
aktuelle Version installiert ist, zeigt die Build-Kennung: Sie steht auf der Lesezeichen-Seite und
in der Box, die nach dem Antippen im Schulmanager erscheint. Stimmen beide überein, passt es.

### Vorschau auf den nächsten Schultag

Der neue Reiter „Vorschau“ zeigt, welche Kurse als Nächstes anstehen. Zu jedem Kurs stehen die
offene Hausaufgabe und das, was zuletzt dran war. Mit den Pfeilen geht es zu den folgenden
Schultagen. Auf Wunsch startet die App gleich mit der Vorschau (Einstellungen → Beim Öffnen).

### Stundenplan aus dem Schulmanager

Das Lesezeichen holt jetzt auch den Stundenplan für diese und die nächste Woche. Die Vorschau
zeigt die Kurse damit in der Reihenfolge des Tages.

- Fällt ein Kurs aus, steht er rot durchgestrichen an seiner Stelle.
- Vertretungen sind markiert.
- Klausuren anderer Kurse, die der Schulmanager allen anzeigt, blendet die App aus.
- Heißt ein Fach im Stundenplan anders als im Archiv, fragt die Vorschau einmal, welcher Kurs
  gemeint ist. Fächer, die nicht zum eigenen Unterricht gehören, lassen sich auf „Nicht
  anzeigen“ stellen.

Für Tage, die der Stundenplan noch nicht abdeckt, schätzt die App aus den bisherigen Einträgen,
welche Kurse an welchem Wochentag sind. Unter Einstellungen → Vorschau lassen sich der Wochenplan
korrigieren und Ferien oder freie Tage eintragen.

### Filter im Archiv

Über der Liste stehen nur noch die Suche und der Knopf „Filter“. Dahinter lässt sich der Zeitraum
wählen (Alles, Seit Klausur, Ab Datum) und die Liste auf Einträge mit Hausaufgabe beschränken.
Welche Filter gerade wirken, steht über der Liste. Antippen nimmt einen Filter wieder weg.

„Seit Klausur“ nutzt das Klausurdatum, das je Kurs eingetragen wird: direkt im Filter, wenn oben
ein Kurs gewählt ist, oder unter Einstellungen → Kurse.

### Übersichtlichere Einstellungen

Die Einstellungen sind jetzt eine kurze Liste: Beim Öffnen, Kurse, Vorschau, Daten. Jede Zeile
zeigt den aktuellen Stand, die Details kommen nach dem Antippen.

## Erste Schritte

1. Die [Lesezeichen-Seite](https://babypython67.github.io/unterrichtsarchiv/install.html) öffnen
   und der Anleitung für das eigene Gerät folgen (Computer, iPhone/iPad oder Android).
2. Im Schulmanager einloggen.
3. Dort das Lesezeichen antippen. Die App öffnet sich in einem neuen Tab und übernimmt die Daten.

Die App holt nichts von selbst. Das Lesezeichen also ab und zu antippen, zum Beispiel einmal pro
Woche. Was einmal im Archiv ist, bleibt dort, auch wenn es im Schulmanager später verschwindet.

Am Handy lässt sich die App zum Startbildschirm hinzufügen. Dann öffnet sie sich wie eine normale
App.

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
- **Fehlermeldung im Schulmanager:** Oben rechts steht eine Box mit „Meldung kopieren“. Den Text
  an mich schicken.

Das Unterrichtsarchiv ist ein privates Projekt und gehört nicht zu Schulmanager Online.
Wie es technisch funktioniert, steht in [docs/technik.md](docs/technik.md).
