import { hasValidReminderTime, shouldAutoEnableStockDeduction } from '../utils/MedicationFormRules';

describe('MedicationFormRules', () => {
  it('enables automatic stock deduction when reminders and stock are set', () => {
    expect(shouldAutoEnableStockDeduction(true, '28')).toBe(true);
    expect(shouldAutoEnableStockDeduction(true, '28,5')).toBe(true);
  });

  it('does not enable automatic stock deduction without reminder or stock', () => {
    expect(shouldAutoEnableStockDeduction(false, '28')).toBe(false);
    expect(shouldAutoEnableStockDeduction(true, '')).toBe(false);
    expect(shouldAutoEnableStockDeduction(true, '0')).toBe(false);
  });

  it('requires a valid reminder time when reminders are enabled', () => {
    expect(hasValidReminderTime(false, [])).toBe(true);
    expect(hasValidReminderTime(true, [])).toBe(false);
    expect(hasValidReminderTime(true, [{ slot: 'morgens', uhrzeit: '' }])).toBe(false);
    expect(hasValidReminderTime(true, [{ slot: 'morgens', uhrzeit: '25:99' }])).toBe(false);
    expect(hasValidReminderTime(true, [{ slot: 'morgens', uhrzeit: '08:00' }])).toBe(true);
  });
});
