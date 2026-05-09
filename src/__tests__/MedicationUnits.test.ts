import {
  FREE_MEDICATION_UNITS,
  MEDICATION_UNITS,
  PREMIUM_MEDICATION_UNITS,
  formatMedicationUnit,
  isPremiumMedicationUnit,
} from '../constants/MedicationUnits';

describe('MEDICATION_UNITS', () => {
  it('covers common solid, liquid, topical, transdermal and injection units', () => {
    expect(MEDICATION_UNITS).toEqual(
      expect.arrayContaining([
        'Tabletten',
        'Kapseln',
        'Tropfen',
        'ml',
        'Hübe',
        'g',
        'Pflaster',
        'Zäpfchen',
        'Ampullen',
        'Spritzen',
      ]),
    );
  });

  it('keeps simple common units free and advanced units premium-only', () => {
    expect(FREE_MEDICATION_UNITS).toEqual(['Tabletten', 'Kapseln', 'Tropfen', 'ml', 'Stück']);
    expect(PREMIUM_MEDICATION_UNITS).toEqual(['Hübe', 'g', 'Pflaster', 'Zäpfchen', 'Ampullen', 'Spritzen']);
    expect(isPremiumMedicationUnit('ml')).toBe(false);
    expect(isPremiumMedicationUnit('Hübe')).toBe(true);
  });

  it('keeps the singular label for one tablet only', () => {
    expect(formatMedicationUnit(1, 'Tabletten')).toBe('Tablette');
    expect(formatMedicationUnit(2, 'Tabletten')).toBe('Tabletten');
    expect(formatMedicationUnit(1, 'ml')).toBe('ml');
  });
});
