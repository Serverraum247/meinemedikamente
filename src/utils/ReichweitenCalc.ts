/**
 * ReichweitenCalc.ts – Berechnet die Reichweite eines Medikamentenbestands
 *
 * Reichweite (Tage) = aktueller_bestand / (einzeldosis × einnahmen_pro_tag)
 *
 * Beispiel: 28 Tabletten, 0.5 pro Einnahme, 2x täglich → 28 / (0.5 × 2) = 28 Tage
 */

import type { MedikamentRow } from '../database/Database';
import {
  parseEinnahmeplan,
  planHatWochentage,
  tagesdosisBerechnen,
  tagesdosisBerechnenFuerDatum,
} from './Einnahmeplan';

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

  const plan = parseEinnahmeplan(med.einnahme_uhrzeiten || '[]');

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

  const reichweite = planHatWochentage(plan)
    ? berechneWochentagsReichweite(bestand, plan, dosis)
    : berechneTaeglicheReichweite(bestand, plan, dosis);
  const { tage, leerDatum } = reichweite;

  if (tage < 0 || !leerDatum) {
    return {
      tage: -1,
      leerDatum: null,
      istKritisch: false,
      istLeer: false,
      textKurz: 'unbegrenzt',
      textLang: 'Kein geplanter Verbrauch',
    };
  }

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

function berechneTaeglicheReichweite(
  bestand: number,
  plan: ReturnType<typeof parseEinnahmeplan>,
  dosis: number
): Pick<ReichweiteInfo, 'tage' | 'leerDatum'> {
  const tagesverbrauch = plan.length > 0
    ? tagesdosisBerechnen(plan, dosis)
    : dosis;
  const tage = Math.floor(bestand / tagesverbrauch);
  const leerDatum = new Date();
  leerDatum.setDate(leerDatum.getDate() + tage);
  return { tage, leerDatum };
}

function berechneWochentagsReichweite(
  bestand: number,
  plan: ReturnType<typeof parseEinnahmeplan>,
  dosis: number
): Pick<ReichweiteInfo, 'tage' | 'leerDatum'> {
  let rest = bestand;
  const start = new Date();
  start.setHours(12, 0, 0, 0);

  for (let tage = 1; tage <= 36500; tage++) {
    const datum = new Date(start);
    datum.setDate(start.getDate() + tage);

    const verbrauch = tagesdosisBerechnenFuerDatum(plan, dosis, datum);
    if (verbrauch <= 0) continue;

    rest -= verbrauch;
    if (rest <= 0) {
      return { tage, leerDatum: datum };
    }
  }

  return { tage: -1, leerDatum: null };
}

/**
 * Formatiert die Stärke-Anzeige
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
