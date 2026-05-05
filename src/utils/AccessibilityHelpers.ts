/**
 * AccessibilityHelpers.ts – Plattformuebergreifende Accessibility-Hilfen
 *
 * announceChange(): Screenreader-Ansage bei Statusaenderungen
 * - iOS: AccessibilityInfo.announceForAccessibility()
 * - Android: Wird ueber accessibilityLiveRegion auf dem Ziel-Element abgebildet
 */

import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Dem Screenreader eine Aenderung ansagen.
 *
 * Verwendung: Nach erfolgreicher Aktion (Einnahme bestaetigt, etc.)
 *   import { announceChange } from '../utils/AccessibilityHelpers';
 *   announceChange('Ibuprofen wurde als eingenommen markiert');
 */
export function announceChange(message: string): void {
  if (Platform.OS === 'ios') {
    // iOS: Programmatische Ansage
    AccessibilityInfo.announceForAccessibility(message);
  }
  // Android: accessibilityLiveRegion auf dem Element erledigt das.
  // Diese Funktion ist fuer iOS + als Fallback fuer programmatische Ansagen.
  // Auf Android wird empfohlen, accessibilityLiveRegion="polite" auf das
  // sich aendernde Text-Element zu setzen.
}

/**
 * Pruefen ob ein Screenreader aktiv ist.
 * Nuetzlich um zusaetzliche Hinweise nur bei Screenreader-Nutzern anzuzeigen.
 */
export async function isScreenReaderActive(): Promise<boolean> {
  return AccessibilityInfo.isScreenReaderEnabled();
}
