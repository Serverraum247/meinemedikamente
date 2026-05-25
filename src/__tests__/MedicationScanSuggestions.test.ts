import { buildMedicationScanSuggestion } from '../utils/MedicationScanSuggestions';

describe('buildMedicationScanSuggestion', () => {
  it('extracts known medication name, ingredient and strength from blister OCR', () => {
    const suggestion = buildMedicationScanSuggestion({
      textLines: [
        'Biso Lich 5 mg',
        'Bisoprolol',
        'Tabletten',
        'Zentiva Pharma',
      ],
    });

    expect(suggestion.suggestedName).toBe('Biso Lich');
    expect(suggestion.suggestedActiveIngredient).toBe('Bisoprolol');
    expect(suggestion.suggestedStrengthValue).toBe('5');
    expect(suggestion.suggestedStrengthUnit).toBe('mg');
  });

  it('keeps combination ingredients with strengths together', () => {
    const suggestion = buildMedicationScanSuggestion({
      textLines: [
        'Candecor comp. 16 mg / 12,5 mg',
        'Candesartancilexetil / Hydrochlorothiazid',
      ],
    });

    expect(suggestion.suggestedName).toBe('Candecor comp.');
    expect(suggestion.suggestedActiveIngredient).toBe('Candesartan 16 mg + Hydrochlorothiazid 12,5 mg');
    expect(suggestion.suggestedStrengthValue).toBeUndefined();
  });

  it('extracts PZN from barcode or text', () => {
    expect(buildMedicationScanSuggestion({ barcode: 'PZN - 00078597' }).scannedPZN).toBe('00078597');
    expect(buildMedicationScanSuggestion({ textLines: ['PZN 00078597'] }).scannedPZN).toBe('00078597');
  });
});
