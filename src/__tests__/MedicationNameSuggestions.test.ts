import {
  formatMedicationNameSuggestion,
  getMedicationNameSuggestionMetadata,
  getMedicationNameSuggestions,
} from '../constants/MedicationNameSuggestions';

describe('getMedicationNameSuggestions', () => {
  it('suggests matching medication names offline by prefix', () => {
    expect(getMedicationNameSuggestions('Biso')).toContain('Biso Lich');
    expect(getMedicationNameSuggestions('cand')).toContain('Candecor comp.');
    expect(getMedicationNameSuggestions('lerc')).toContain('Lercanidipin-Omniapharm');
  });

  it('does not suggest dosage strengths', () => {
    const suggestions = getMedicationNameSuggestions('Biso').join(' ');

    expect(suggestions).not.toMatch(/\d+\s*mg/i);
  });

  it('keeps suggestions quiet until the user entered at least two characters', () => {
    expect(getMedicationNameSuggestions('B')).toEqual([]);
  });

  it('returns known active ingredients for offline medication names', () => {
    expect(getMedicationNameSuggestionMetadata('Biso Lich')?.activeIngredient).toBe('Bisoprolol');
    expect(getMedicationNameSuggestionMetadata('Candecor comp.')?.activeIngredient).toBe(
      'Candesartan 16 mg + Hydrochlorothiazid 12,5 mg',
    );
    expect(getMedicationNameSuggestionMetadata('Lercanidipin-Omniapharm')?.activeIngredient).toBe(
      'Lercanidipin',
    );
  });

  it('finds medication names when searching by active ingredient', () => {
    expect(getMedicationNameSuggestions('Bisoprolol')).toContain('Biso Lich');
    expect(getMedicationNameSuggestions('Hydrochlorothiazid')).toContain('Candecor comp.');
    expect(getMedicationNameSuggestions('Candesartan')).toContain('Candecor comp.');
  });

  it('formats suggestions with active ingredient when known', () => {
    expect(formatMedicationNameSuggestion('Biso Lich')).toBe('Biso Lich - Bisoprolol');
  });
});
