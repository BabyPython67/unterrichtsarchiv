// Datei-Import: der Nutzer wählt eine oder mehrere JSON-Dateien (Download des Bookmarklets
// oder eine Export-Datei des Viewers). Welche Art es ist, entscheidet kern/importieren.js.

export class DateiQuelle {
  constructor(input) {
    this.name = "Datei";
    this.input = input;
  }

  verfuegbar() {
    return !!this.input && typeof File !== "undefined";
  }

  starten({ onDaten, onFehler }) {
    this.input.addEventListener("change", async () => {
      const dateien = [...this.input.files];
      this.input.value = "";
      for (const datei of dateien) {
        let objekt;
        try {
          objekt = JSON.parse(await datei.text());
        } catch (e) {
          onFehler(`${datei.name}: kein gültiges JSON (${e.message}).`);
          continue;
        }
        onDaten(objekt, { quelle: this.name, datei: datei.name });
      }
    });
  }

  oeffnen() {
    this.input.click();
  }
}
