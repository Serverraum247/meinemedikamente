import {
  getMedicationTestPreset,
  MEDICATION_TEST_PRESETS,
} from '../constants/MedicationTestPresets';

describe('MedicationTestPresets', () => {
  it('provides a tablet preset with a deterministic stock value', () => {
    const preset = getMedicationTestPreset('tablet');

    expect(preset.name).toBe('Ibuprofen Test');
    expect(preset.unit).toBe('Tabletten');
    expect(preset.singleDose).toBe('1');
    expect(preset.stock).toBe('20');
  });

  it('provides a liquid preset with a deterministic ml stock value', () => {
    const preset = getMedicationTestPreset('liquid');

    expect(preset.name).toBe('Paracetamol Saft');
    expect(preset.unit).toBe('ml');
    expect(preset.singleDose).toBe('5');
    expect(preset.stock).toBe('100');
  });

  it('provides a premium spray preset with a deterministic stock value', () => {
    const preset = getMedicationTestPreset('spray');

    expect(preset.name).toBe('Salbutamol Spray');
    expect(preset.unit).toBe('Hübe');
    expect(preset.singleDose).toBe('2');
    expect(preset.stock).toBe('200');
  });

  it('provides a weekday preset for Mo/Mi/Fr UI E2E', () => {
    const preset = getMedicationTestPreset('weekday');

    expect(preset.name).toBe('Wochentag Test');
    expect(preset.unit).toBe('Tabletten');
    expect(preset.singleDose).toBe('1');
    expect(preset.stock).toBe('6');
  });

  it('keeps every preset addressable by key for Maestro flows', () => {
    expect(Object.keys(MEDICATION_TEST_PRESETS).sort()).toEqual(['liquid', 'spray', 'tablet', 'weekday']);
  });
});
