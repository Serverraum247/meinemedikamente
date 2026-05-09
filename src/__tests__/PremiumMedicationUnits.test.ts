import { isPremiumMedicationUnit } from '../constants/MedicationUnits';

describe('premium medication unit gating', () => {
  it.each(['Tabletten', 'Kapseln', 'Tropfen', 'ml', 'Stück'])(
    'keeps %s available in free mode',
    unit => {
      expect(isPremiumMedicationUnit(unit)).toBe(false);
    },
  );

  it.each(['Hübe', 'g', 'Pflaster', 'Zäpfchen', 'Ampullen', 'Spritzen'])(
    'marks %s as premium-only',
    unit => {
      expect(isPremiumMedicationUnit(unit)).toBe(true);
    },
  );
});
