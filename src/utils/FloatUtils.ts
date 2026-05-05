/**
 * FloatUtils.ts – Testbare Float-Arithmetik für Medikamentenbestände
 *
 * Alle Funktionen sind rein (keine Seiteneffekte) und damit
 * ohne Datenbank-Abhaengigkeit testbar.
 *
 * WICHTIG: Alle Berechnungen runden auf 2 Nachkommastellen,
 * um IEEE 754 Floating-Point-Ungenauigkeiten zu vermeiden.
 */

/**
 * Hilfsfunktion: Auf 2 Nachkommastellen runden
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Bestand nach Einnahme reduzieren
 * Bestand_Neu = Bestand_Alt - Einzeldosis
 * Ergebnis wird auf 2 Nachkommastellen gerundet
 */
export function reduceBestand(bestand: number, einzeldosis: number): number {
  const result = round2(bestand - einzeldosis);
  return Math.max(0, result); // Kein negativer Bestand
}

/**
 * Bestand nach Nachkauf erhoehen
 */
export function increaseBestand(bestand: number, packungsgroesse: number): number {
  return round2(bestand + packungsgroesse);
}

/**
 * Verbleibende Kalendertage berechnen, bis der Bestand aufgebraucht ist.
 *
 * Berechnung: bestand / (einzeldosis * einnahmenProTag)
 * Gerundet auf 2 Nachkommastellen, dann Math.floor für ganze Tage.
 *
 * Beispiele:
 *   28 Tabletten, 1.0/Tag, 1x = 28 Tage
 *   14.5 Tabletten, 0.5/Tag, 1x = 29 Tage
 *   30 Tabletten, 1.0/Tag, 2x/Tag = 15 Tage
 *   28.5 Tabletten, 0.5/Tag, 2x/Tag = 28 Tage (28.5 / 1.0 = 28.5 -> 28)
 */
export function calculateTageBisLeer(
  bestand: number,
  einzeldosis: number,
  einnahmenProTag: number = 1
): number {
  const tagesverbrauch = einzeldosis * einnahmenProTag;
  if (tagesverbrauch <= 0) return 0;
  // Zuerst runden (gegen Float-Ungenauigkeit), dann floor
  const rohTage = round2(bestand / tagesverbrauch);
  return Math.floor(rohTage);
}

/**
 * Konkretes Datum berechnen, an dem der Bestand leer ist.
 *
 * @param bestand Aktueller Bestand (Float)
 * @param einzeldosis Einzeldosis pro Einnahme (Float)
 * @param einnahmenProTag Wie oft pro Tag wird eingenommen?
 * @returns Datum als ISO-String (YYYY-MM-DD)
 */
export function calculateLeerDatum(
  bestand: number,
  einzeldosis: number,
  einnahmenProTag: number = 1
): string {
  const tage = calculateTageBisLeer(bestand, einzeldosis, einnahmenProTag);
  const leerDatum = new Date();
  leerDatum.setDate(leerDatum.getDate() + tage);
  return leerDatum.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Prüfen, ob eine Nachfuellung vor einem bestimmten Datum noetig ist.
 *
 * Verwendet für Arzt-Urlaub-Prävention:
 *   "Wird das Leer-Datum VOR oder AM Ende des Urlaubs + Puffer erreicht?"
 *
 * @param bestand Aktueller Bestand
 * @param einzeldosis Einzeldosis
 * @param einnahmenProTag Einnahmen pro Tag
 * @param urlaubEnde ISO-Datum des Urlaubs-Endes
 * @param pufferTage Sicherheits-Puffer in Tagen (default: 3)
 * @returns true = Warnung noetig, false = alles OK
 */
export function isNachfuellungVorUrlaubNoetig(
  bestand: number,
  einzeldosis: number,
  einnahmenProTag: number,
  urlaubEnde: string,
  pufferTage: number = 3
): boolean {
  const leerDatum = calculateLeerDatum(bestand, einzeldosis, einnahmenProTag);
  const urlaubEndeMitPuffer = new Date(urlaubEnde);
  urlaubEndeMitPuffer.setDate(urlaubEndeMitPuffer.getDate() + pufferTage);
  const urlaubStr = urlaubEndeMitPuffer.toISOString().split('T')[0];
  return leerDatum <= urlaubStr;
}

/**
 * Prüfen, ob der Bestand unter der Warnschwelle liegt
 */
export function isUnterWarnschwelle(bestand: number, warnschwelle: number): boolean {
  return bestand <= warnschwelle;
}

/**
 * Einnahmen zählen, die noch möglich sind
 */
export function remainingEinnahmen(bestand: number, einzeldosis: number): number {
  if (einzeldosis <= 0) return 0;
  // Runden gegen Float-Ungenauigkeit bei der Division
  return Math.floor(round2(bestand / einzeldosis));
}
