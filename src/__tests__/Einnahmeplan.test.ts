import {
  getDosisFuerSlot,
  parseEinnahmeplan,
  serializeEinnahmeplan,
  setSlotTaeglich,
  tagesdosisBerechnenFuerDatum,
  toggleSlotWochentag,
  type EinnahmeSlot,
} from '../utils/Einnahmeplan';

describe('Einnahmeplan', () => {
  it('keeps selected weekdays through serialization', () => {
    const serialized = serializeEinnahmeplan([
      { slot: 'morgens', uhrzeit: '08:00', dosis: 0.5, wochentage: [5, 1, 3] },
    ]);

    expect(parseEinnahmeplan(serialized)).toEqual([
      { slot: 'morgens', uhrzeit: '08:00', dosis: 0.5, wochentage: [1, 3, 5] },
    ]);
  });

  it('calculates dose only on selected weekdays', () => {
    const plan: EinnahmeSlot[] = [
      { slot: 'morgens', uhrzeit: '08:00', dosis: 0.5, wochentage: [1, 3, 5] },
    ];

    expect(tagesdosisBerechnenFuerDatum(plan, 1, new Date('2026-05-11T12:00:00'))).toBe(0.5);
    expect(tagesdosisBerechnenFuerDatum(plan, 1, new Date('2026-05-12T12:00:00'))).toBe(0);
  });

  it('keeps seven explicitly selected weekdays selected', () => {
    const plan: EinnahmeSlot[] = [
      { slot: 'morgens', uhrzeit: '08:00', wochentage: [1, 2, 3, 4, 5, 6] },
    ];

    const result = toggleSlotWochentag(plan, 'morgens', 7);

    expect(result).toEqual([{ slot: 'morgens', uhrzeit: '08:00', wochentage: [1, 2, 3, 4, 5, 6, 7] }]);
  });

  it('switches a slot back to daily intake explicitly', () => {
    const plan: EinnahmeSlot[] = [
      { slot: 'morgens', uhrzeit: '08:00', wochentage: [1, 3, 5] },
    ];

    const result = setSlotTaeglich(plan, 'morgens');

    expect(result).toEqual([{ slot: 'morgens', uhrzeit: '08:00' }]);
  });

  it('returns the slot dose for automatic stock deduction', () => {
    const plan: EinnahmeSlot[] = [
      { slot: 'morgens', uhrzeit: '08:00', dosis: 0.5 },
      { slot: 'abends', uhrzeit: '20:00', dosis: 1 },
    ];

    expect(getDosisFuerSlot(plan, 'morgens', 1)).toBe(0.5);
    expect(getDosisFuerSlot(plan, 'mittags', 1)).toBe(1);
  });
});
