import { normalizeGermanDateInput, parseGermanDate } from '../utils/GermanDate';

describe('GermanDate', () => {
  it('normalizes comma or free digit input into German date format', () => {
    expect(normalizeGermanDateInput('30,06,2026')).toBe('30.06.2026');
    expect(normalizeGermanDateInput('30062026')).toBe('30.06.2026');
  });

  it('parses valid normalized German dates to ISO dates', () => {
    expect(parseGermanDate('30,06,2026')).toBe('2026-06-30');
  });

  it('rejects invalid dates', () => {
    expect(parseGermanDate('31.02.2026')).toBeNull();
  });
});
