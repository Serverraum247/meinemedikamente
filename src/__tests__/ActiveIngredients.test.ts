import {
  formatActiveIngredient,
  formatActiveIngredientStrengthSummary,
  parseActiveIngredients,
} from '../utils/ActiveIngredients';

describe('parseActiveIngredients', () => {
  it('splits a combination medication into two active ingredients with strengths', () => {
    const result = parseActiveIngredients('Candesartan 16 mg + Hydrochlorothiazid 12,5 mg');

    expect(result).toEqual([
      { name: 'Candesartan', strength: '16 mg' },
      { name: 'Hydrochlorothiazid', strength: '12,5 mg' },
    ]);
  });

  it('splits slash-separated active ingredients without strengths', () => {
    const result = parseActiveIngredients('Candesartan/Hydrochlorothiazid');

    expect(result).toEqual([
      { name: 'Candesartan' },
      { name: 'Hydrochlorothiazid' },
    ]);
  });

  it('keeps a single descriptive value as one active ingredient', () => {
    expect(parseActiveIngredients('Bisoprolol')).toEqual([{ name: 'Bisoprolol' }]);
    expect(parseActiveIngredients('Blutdruck')).toEqual([{ name: 'Blutdruck' }]);
  });
});

describe('formatActiveIngredient', () => {
  it('formats name and strength for display', () => {
    expect(formatActiveIngredient({ name: 'Candesartan', strength: '16 mg' })).toBe('Candesartan 16 mg');
    expect(formatActiveIngredient({ name: 'Bisoprolol' })).toBe('Bisoprolol');
  });

  it('formats a compact strength summary when all active ingredients contain strengths', () => {
    expect(formatActiveIngredientStrengthSummary('Candesartan 16 mg + Hydrochlorothiazid 12,5 mg')).toBe(
      '16 mg + 12,5 mg',
    );
    expect(formatActiveIngredientStrengthSummary('Bisoprolol')).toBeNull();
  });
});
