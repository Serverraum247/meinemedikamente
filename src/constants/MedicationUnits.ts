export const FREE_MEDICATION_UNITS = [
  'Tabletten',
  'Kapseln',
  'Tropfen',
  'ml',
  'Stück',
] as const;

export const PREMIUM_MEDICATION_UNITS = [
  'Hübe',
  'g',
  'Pflaster',
  'Zäpfchen',
  'Ampullen',
  'Spritzen',
] as const;

export const MEDICATION_UNITS = [
  ...FREE_MEDICATION_UNITS,
  ...PREMIUM_MEDICATION_UNITS,
] as const;

export type MedicationUnit = (typeof MEDICATION_UNITS)[number];

export function isPremiumMedicationUnit(unit: string): boolean {
  return (PREMIUM_MEDICATION_UNITS as readonly string[]).includes(unit);
}

export function formatMedicationUnit(amount: number, unit: string): string {
  if (unit === 'Tabletten' && amount === 1) {
    return 'Tablette';
  }
  return unit;
}
