import { calculateLeerDatum } from './FloatUtils';

export const REZEPT_TERMIN_TAGE_VOR_LEER = 7;

export interface RezeptTerminBerechnung {
  leerDatumIso: string;
  terminDatumIso: string;
}

export function calculateRezeptTerminFromStock(
  bestand: number,
  einzeldosis: number,
  einnahmenProTag: number = 1,
  tageVorLeer: number = REZEPT_TERMIN_TAGE_VOR_LEER,
): RezeptTerminBerechnung {
  return calculateRezeptTerminFromLeerDatum(
    calculateLeerDatum(bestand, einzeldosis, einnahmenProTag),
    tageVorLeer,
  );
}

export function calculateRezeptTerminFromLeerDatum(
  leerDatum: string | Date,
  tageVorLeer: number = REZEPT_TERMIN_TAGE_VOR_LEER,
): RezeptTerminBerechnung {
  const leerDatumIso = typeof leerDatum === 'string' ? leerDatum : toIsoDate(leerDatum);
  const terminDatum = new Date(`${leerDatumIso}T12:00:00`);
  terminDatum.setDate(terminDatum.getDate() - tageVorLeer);

  return {
    leerDatumIso,
    terminDatumIso: toIsoDate(terminDatum),
  };
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
