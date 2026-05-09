/**
 * ReichweitenCalc.ts – Berechnet die Reichweite eines Medikamentenbestands
 *
 * Reichweite (Tage) = aktueller_bestand / (einzeldosis × einnahmen_pro_tag)
 *
 * Beispiel: 28 Tabletten, 0.5 pro Einnahme, 2x täglich → 28 / (0.5 × 2) = 28 Tage
 */

import type { MedikamentRow } from '../database/Database';

export interface ReichweiteInfo {
  tage: number;           // Reichweite in Tagen (0 = leer, -1 = unendlich)
  leerDatum: Date | null; // Datum an dem der Bestand aufgebraucht ist
  istKritisch: boolean;   // Reichweite < 7 Tage
  istLeer: boolean;       // Bestand == 0 oder Reichweite == 0
  textKurz: string;       // z.B. "28 Tage", "unbegrenzt", "leer"
  textLang: string;       // z.B. "Reicht noch bis 23.06.2026"
}

/**
 * Berechnet die Reichweite eines Medikaments
 */
export function calculateReichweite(med: MedikamentRow): ReichweiteInfo {
  const bestand = med.aktueller_bestand || 0;
  const dosis = med.einzeldosis || 0;

  // Einnahmen pro Tag aus einnahme_uhrzeiten ermitteln
  let einnahmenProTag = 1; // Standard: 1x täglich
  try {
    const slots = JSON.parse(med.einnahme_uhrzeiten || '[]');
    if (Array.isArray(slots) && slots.length > 0) {
      einnahmenProTag = slots.length;
    }
  } catch {
    einnahmenProTag = 1;
  }

  // Bestand leer
  if (bestand <= 0) {
    return {
      tage: 0,
      leerDatum: null,
      istKritisch: true,
      istLeer: true,
      textKurz: 'leer',
      textLang: 'Bestand ist aufgebraucht',
    };
  }

  // Keine Dosis oder 0 → unbegrenzt (z.B. Bedarfsmedikament)
  if (dosis <= 0) {
    return {
      tage: -1,
      leerDatum: null,
      istKritisch: false,
      istLeer: false,
      textKurz: 'unbegrenzt',
      textLang: 'Bedarfsmedikament – keine feste Dosierung',
    };
  }

  const tagesverbrauch = dosis * einnahmenProTag;
  const tage = Math.floor(bestand / tagesverbrauch);

  // Leer-Datum berechnen
  const leerDatum = new Date();
  leerDatum.setDate(leerDatum.getDate() + tage);

  const istLeer = tage <= 0;
  const istKritisch = tage > 0 && tage <= 7;

  // Formatierung
  let textKurz: string;
  let textLang: string;

  if (istLeer) {
    textKurz = 'heute leer';
    textLang = 'Bestand reicht nicht mehr für heute';
  } else if (tage === 1) {
    textKurz = '1 Tag';
    textLang = 'Reicht nur noch für heute';
  } else {
    textKurz = `${tage} Tage`;
    textLang = `Reicht noch bis ${formatDate(leerDatum)}`;
  }

  return {
    tage,
    leerDatum,
    istKritisch,
    istLeer,
    textKurz,
    textLang,
  };
}

/**
 * Formatiert ein Datum im deutschen Format: 23.06.2026
 */
function formatDate(d: Date): string {
  const tag = String(d.getDate()).padStart(2, '0');
  const monat = String(d.getMonth() + 1).padStart(2, '0');
  const jahr = d.getFullYear();
  return `${tag}.${monat}.${jahr}`;
}

/**
 * Formatiert die Stärke-Anzeige (Premium)
 * z.B. "500 mg", "10 ml", "25 µg", "100 IE"
 */
export function formatStaerke(wert: number, einheit: string): string | null {
  if (!wert || wert <= 0 || !einheit) {
    return null;
  }
  // Dezimalstellen nur wenn nötig
  const formatted = Number.isInteger(wert) ? String(wert) : wert.toFixed(1).replace(/\.0$/, '');
  return `${formatted} ${einheit}`;
}
