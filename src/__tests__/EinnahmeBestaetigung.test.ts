import { findBestaetigbarenSlotHeute } from '../utils/EinnahmeBestaetigung';
import type { EinnahmeSlot, TageszeitSlot } from '../utils/Einnahmeplan';

const plan: EinnahmeSlot[] = [
  { slot: 'morgens', uhrzeit: '08:00' },
  { slot: 'abends', uhrzeit: '18:00' },
];

describe('findBestaetigbarenSlotHeute', () => {
  it('erlaubt standardmaessig eine Einnahme vor der geplanten Uhrzeit', () => {
    const slot = findBestaetigbarenSlotHeute({
      plan,
      eingenommeneSlots: new Set<TageszeitSlot>(),
      jetzt: new Date('2026-05-25T07:30:00'),
      frueheEinnahmeErlaubt: true,
    });

    expect(slot?.slot).toBe('morgens');
  });

  it('sperrt eine vorzeitige Einnahme, wenn sie fuer das Medikament deaktiviert ist', () => {
    const slot = findBestaetigbarenSlotHeute({
      plan,
      eingenommeneSlots: new Set<TageszeitSlot>(),
      jetzt: new Date('2026-05-25T07:30:00'),
      frueheEinnahmeErlaubt: false,
    });

    expect(slot).toBeNull();
  });

  it('erlaubt faellige Einnahmen auch bei deaktivierter frueher Einnahme', () => {
    const slot = findBestaetigbarenSlotHeute({
      plan,
      eingenommeneSlots: new Set<TageszeitSlot>(),
      jetzt: new Date('2026-05-25T08:30:00'),
      frueheEinnahmeErlaubt: false,
    });

    expect(slot?.slot).toBe('morgens');
  });

  it('ueberspringt bereits protokollierte Slots', () => {
    const slot = findBestaetigbarenSlotHeute({
      plan,
      eingenommeneSlots: new Set<TageszeitSlot>(['morgens']),
      jetzt: new Date('2026-05-25T09:00:00'),
      frueheEinnahmeErlaubt: true,
    });

    expect(slot?.slot).toBe('abends');
  });
});
