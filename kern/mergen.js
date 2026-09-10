// Merge neuer Zeilen in den Bestand nach Dispatch §6. Entspricht speichern() im Prototyp.
//
//   ID unbekannt                      -> einfügen, ersterfasst = heute
//   ID bekannt, Text identisch        -> nichts
//   ID bekannt, Text abweichend       -> Text ersetzen, geaendert = heute
//   ID bekannt, Hausaufgabe neu dazu  -> Feld ergänzen, geaendert = heute
//   ID im Bestand, fehlt in Antwort   -> behalten (Archiv schrumpft nie)
//
// Zusatzregel im selben Geist: ein LEERES Feld in der neuen Antwort überschreibt nie einen
// vorhandenen Text. Sonst würde eine halb fehlgeschlagene Antwort (z. B. nur Hausaufgaben,
// Inhalte-Teilanfrage mit Fehler) gespeicherte Themen löschen.
// Reine Funktion: Eingaben werden nicht verändert.

export function mergen(bestand, zeilen, heute) {
  const index = new Map(bestand.map((e) => [e.id, { ...e }]));
  let neu = 0, geaendert = 0, unveraendert = 0;
  for (const z of zeilen) {
    const thema = z.thema || "";
    const hausaufgabe = z.hausaufgabe || "";
    const alt = index.get(z.id);
    if (!alt) {
      index.set(z.id, {
        id: z.id, kurs: z.kurs, datum: z.datum, thema, hausaufgabe, position: z.position,
        ersterfasst: z.ersterfasst || heute,
        geaendert: z.geaendert || null,
      });
      neu++;
      continue;
    }
    const neuesThema = thema && thema !== alt.thema ? thema : alt.thema;
    const neueHa = hausaufgabe && hausaufgabe !== alt.hausaufgabe ? hausaufgabe : alt.hausaufgabe;
    if (neuesThema !== alt.thema || neueHa !== alt.hausaufgabe) {
      alt.thema = neuesThema;
      alt.hausaufgabe = neueHa;
      alt.geaendert = heute;
      geaendert++;
    } else {
      unveraendert++;
    }
  }
  return { eintraege: [...index.values()], neu, geaendert, unveraendert };
}
