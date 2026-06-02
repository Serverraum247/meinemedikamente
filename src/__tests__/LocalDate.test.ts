import { dateFromLocalDateKey, getLocalDateKey, msUntilNextLocalDay } from '../utils/LocalDate';

describe('LocalDate', () => {
  it('builds date keys from local date parts', () => {
    expect(getLocalDateKey(new Date(2026, 5, 2, 8, 30))).toBe('2026-06-02');
  });

  it('parses a local date key as local midnight', () => {
    const date = dateFromLocalDateKey('2026-06-02');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(2);
    expect(date.getHours()).toBe(0);
  });

  it('schedules shortly after the next local midnight', () => {
    expect(msUntilNextLocalDay(new Date(2026, 5, 1, 23, 59, 0))).toBe(62000);
    expect(msUntilNextLocalDay(new Date(2026, 5, 2, 0, 0, 3))).toBeGreaterThan(1000);
  });
});
