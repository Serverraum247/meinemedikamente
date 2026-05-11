import { parseDeFloat } from './FloatUtils';

export const STRENGTH_UNITS = ['mg', 'µg', 'g', 'ml', 'IE', 'mmol', '%'] as const;

export function shouldAutoEnableStockDeduction(erinnerungAktiv: boolean, bestandText: string): boolean {
  const bestand = parseDeFloat(bestandText);
  return erinnerungAktiv && Number.isFinite(bestand) && bestand > 0;
}
