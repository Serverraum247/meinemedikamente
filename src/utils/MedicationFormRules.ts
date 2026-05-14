import { parseDeFloat } from './FloatUtils';
import type { EinnahmeSlot } from './Einnahmeplan';

export const STRENGTH_UNITS = ['mg', 'µg', 'g', 'ml', 'IE', 'mmol', '%'] as const;

export function shouldAutoEnableStockDeduction(erinnerungAktiv: boolean, bestandText: string): boolean {
  const bestand = parseDeFloat(bestandText);
  return erinnerungAktiv && Number.isFinite(bestand) && bestand > 0;
}

export function hasValidReminderTime(erinnerungAktiv: boolean, einnahmePlan: EinnahmeSlot[]): boolean {
  if (!erinnerungAktiv) {
    return true;
  }

  return einnahmePlan.some(slot => isValidTime(slot.uhrzeit));
}

function isValidTime(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return Boolean(match);
}
