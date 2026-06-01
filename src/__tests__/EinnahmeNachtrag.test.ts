import type { MedikamentRow } from '../database/Database';
import {
  buildOffeneEinnahmeNachtraege,
  buildNachtragTimestamp,
} from '../services/EinnahmeNachtragService';

function med(overrides: Partial<MedikamentRow> = {}): MedikamentRow {
  return {
    id: 'med-1',
    name: 'Biso Lich',
    zusatz: 'Bisoprolol',
    person_id: 'person-1',
    aktueller_bestand: 20,
    einzeldosis: 1,
    einheit: 'Tabletten',
    pzn: '',
    packungsgroesse: 100,
    warnung_ab_bestand: 7,
    sync_status: 0,
    erinnerung_aktiv: 1,
    einnahme_uhrzeiten: JSON.stringify([{ slot: 'morgens', uhrzeit: '08:00' }]),
    auto_abzug_aktiv: 1,
    fruehe_einnahme_erlaubt: 1,
    arzt_id: '',
    staerke_wert: 5,
    staerke_einheit: 'mg',
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
    ...overrides,
  };
}

describe('EinnahmeNachtragService', () => {
  it('findet offene Einnahmen der letzten sieben Tage nach Datum gruppiert', () => {
    const groups = buildOffeneEinnahmeNachtraege({
      medikamente: [
        med({ id: 'med-1', name: 'Biso Lich' }),
        med({ id: 'med-2', name: 'Candecor' }),
        med({ id: 'med-3', name: 'Lercanidipin' }),
      ],
      vorhandeneEinnahmen: [],
      personId: 'person-1',
      startDate: new Date('2026-05-25T10:00:00'),
      endDate: new Date('2026-05-31T10:00:00'),
    });

    expect(groups).toHaveLength(7);
    expect(groups[0].datumIso).toBe('2026-05-31');
    expect(groups[0].items.map(item => item.medikamentName)).toEqual([
      'Biso Lich',
      'Candecor',
      'Lercanidipin',
    ]);
  });

  it('beruecksichtigt Wochentage und mehrere Slots getrennt', () => {
    const groups = buildOffeneEinnahmeNachtraege({
      medikamente: [
        med({
          id: 'med-weekday',
          name: 'Mo Mi Fr Medikament',
          einnahme_uhrzeiten: JSON.stringify([
            { slot: 'morgens', uhrzeit: '08:00', wochentage: [1, 3, 5] },
            { slot: 'abends', uhrzeit: '18:00', dosis: 0.5, wochentage: [1, 3, 5] },
          ]),
        }),
      ],
      vorhandeneEinnahmen: [],
      personId: 'person-1',
      startDate: new Date('2026-05-25T10:00:00'),
      endDate: new Date('2026-05-31T10:00:00'),
    });

    expect(groups.map(group => group.datumIso)).toEqual([
      '2026-05-29',
      '2026-05-27',
      '2026-05-25',
    ]);
    expect(groups[0].items.map(item => `${item.slot}:${item.dosis}`)).toEqual([
      'morgens:1',
      'abends:0.5',
    ]);
  });

  it('filtert bereits protokollierte Slots heraus', () => {
    const groups = buildOffeneEinnahmeNachtraege({
      medikamente: [
        med({
          id: 'med-1',
          einnahme_uhrzeiten: JSON.stringify([
            { slot: 'morgens', uhrzeit: '08:00' },
            { slot: 'abends', uhrzeit: '18:00' },
          ]),
        }),
      ],
      vorhandeneEinnahmen: [
        {
          medikament_id: 'med-1',
          person_id: 'person-1',
          timestamp: '2026-05-31 08:00:00',
          slot: 'morgens',
        },
      ],
      personId: 'person-1',
      startDate: new Date('2026-05-31T10:00:00'),
      endDate: new Date('2026-05-31T10:00:00'),
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].items.map(item => item.slot)).toEqual(['abends']);
  });

  it('baut stabile Nachtrag-Zeitstempel aus Datum und Slot-Uhrzeit', () => {
    expect(buildNachtragTimestamp('2026-05-31', '08:00')).toBe('2026-05-31 08:00:00');
    expect(buildNachtragTimestamp('2026-05-31', undefined)).toBe('2026-05-31 12:00:00');
  });
});
