export type MedicationTestPresetKey = 'tablet' | 'liquid' | 'spray' | 'weekday';

export interface MedicationTestPreset {
  name: string;
  unit: string;
  singleDose: string;
  stock: string;
  packageSize: string;
  warningThreshold: string;
}

export const MEDICATION_TEST_PRESETS: Record<MedicationTestPresetKey, MedicationTestPreset> = {
  tablet: {
    name: 'Ibuprofen Test',
    unit: 'Tabletten',
    singleDose: '1',
    stock: '20',
    packageSize: '20',
    warningThreshold: '7',
  },
  liquid: {
    name: 'Paracetamol Saft',
    unit: 'ml',
    singleDose: '5',
    stock: '100',
    packageSize: '100',
    warningThreshold: '10',
  },
  spray: {
    name: 'Salbutamol Spray',
    unit: 'Hübe',
    singleDose: '2',
    stock: '200',
    packageSize: '200',
    warningThreshold: '20',
  },
  weekday: {
    name: 'Wochentag Test',
    unit: 'Tabletten',
    singleDose: '1',
    stock: '6',
    packageSize: '6',
    warningThreshold: '2',
  },
};

export function getMedicationTestPreset(key: MedicationTestPresetKey): MedicationTestPreset {
  return MEDICATION_TEST_PRESETS[key];
}
