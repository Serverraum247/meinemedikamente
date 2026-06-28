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

  it('extracts structured package data from OCR text', () => {
    const suggestion = buildMedicationScanSuggestion({
      textLines: [
        'PC 04150096336005',
        'SN 9ZMBBNUAA',
        'Ch.-B. V43884',
        'verwendbar bis 07/2027',
      ],
    });

    expect(suggestion.scannedProduktCode).toBe('04150096336005');
    expect(suggestion.scannedPZN).toBe('09633600');
    expect(suggestion.scannedSeriennummer).toBe('9ZMBBNUAA');
    expect(suggestion.scannedCharge).toBe('V43884');
    expect(suggestion.scannedVerwendbarBis).toBe('2027-07-31');
  });

  it('extracts product data and expiry from a GS1 DataMatrix payload', () => {
    const suggestion = buildMedicationScanSuggestion({
      barcodes: [{
        format: 'data-matrix',
        value: '01041501004221201728113010HA5K00210361247721801',
      }],
      textLines: ['Jede Filmtablette enthält Lercanidipinhydrochlorid 10 mg'],
    });

    expect(suggestion.scannedProduktCode).toBe('04150100422120');
    expect(suggestion.scannedPZN).toBe('10042212');
    expect(suggestion.scannedCharge).toBe('HA5K00');
    expect(suggestion.scannedSeriennummer).toBe('0361247721801');
    expect(suggestion.scannedVerwendbarBis).toBe('2028-11-30');
  });
});
