/**
 * FloatUtils.ts – Testbare Float-Arithmetik fuer Medikamentenbestaende
 *
 * Alle Funktionen sind rein (keine Seiteneffekte) und damit
 * ohne Datenbank-Abhaengigkeit testbar.
 */

/**
 * Bestand nach Einnahme reduzieren
 * Bestand_Neu = Bestand_Alt - Einzeldosis
 * Ergebnis wird auf 2 Nachkommastellen gerundet (IEEE 754 Genauigkeit)
 */
export function reduceBestand(bestand: number, einzeldosis: number): number {
  const raw = bestand - einzeldosis;
  // Auf 2 Nachkommastellen runden gegen Floating-Point-Ungenauigkeiten
  const result = Math.round(raw * 100) / 100;
  return Math.max(0, result); // Kein negativer Bestand
}

/**
 * Bestand nach Nachkauf erhoehen
 */
export function increaseBestand(bestand: number, packungsgroesse: number): number {
  const raw = bestand + packungsgroesse;
  return Math.round(raw * 100) / 100;
}

/**
 * Tage berechnen, bis der Bestand aufgebraucht ist
 */
export function calculateTageBisLeer(
  bestand: number,
  einzeldosis: number,
  einnahmenProTag: number = 1
): number {
  const tagesverbrauch = einzeldosis * einnahmenProTag;
  if (tagesverbrauch <= 0) return 0;
  return Math.floor(bestand / tagesverbrauch);
}

/**
 * Pruefen, ob der Bestand unter der Warnschwelle liegt
 */
export function isUnterWarnschwelle(bestand: number, warnschwelle: number): boolean {
  return bestand <= warnschwelle;
}

/**
 * Einnahmen zaehlen, die noch moeglich sind
 */
export function remainingEinnahmen(bestand: number, einzeldosis: number): number {
  if (einzeldosis <= 0) return 0;
  return Math.floor(bestand / einzeldosis);
}
