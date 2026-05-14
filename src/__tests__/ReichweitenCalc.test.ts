import type { MedikamentRow } from '../database/Database';
import { calculateReichweite } from '../utils/ReichweitenCalc';

function med(overrides: Partial<MedikamentRow>): MedikamentRow {
  return {
    id: 'med-test',
    name: 'Test Medikament',
    zusatz: '',
    person_id: 'person-default-001',
    aktueller_bestand: 0,
    einzeldosis: 1,
    einheit: 'Tabletten',
    pzn: '',
    packungsgroesse: 0,
    warnung_ab_bestand: 7,
    sync_status: 0,
    erinnerung_aktiv: 0,
    einnahme_uhrzeiten: '[]',
    auto_abzug_aktiv: 0,
    arzt_id: '',
    staerke_wert: 0,
    staerke_einheit: '',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('calculateReichweite', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-09T12:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('calculates a once-daily forecast', () => {
    const result = calculateReichweite(med({ aktueller_bestand: 10, einzeldosis: 1 }));

    expect(result.tage).toBe(10);
    expect(result.textKurz).toBe('10 Tage');
    expect(result.textLang).toBe('Vorrat reicht bis 19.05.2026');
  });

  it('calculates multiple daily slots', () => {
    const result = calculateReichweite(med({
      aktueller_bestand: 10,
      einzeldosis: 1,
      einnahme_uhrzeiten: JSON.stringify([
        { slot: 'morgens', uhrzeit: '08:00' },
        { slot: 'abends', uhrzeit: '20:00' },
      ]),
    }));

    expect(result.tage).toBe(5);
    expect(result.istKritisch).toBe(true);
  });

  it('uses individual slot doses for half-tablet forecasts', () => {
    const result = calculateReichweite(med({
      aktueller_bestand: 14,
      einzeldosis: 1,
      einnahme_uhrzeiten: JSON.stringify([
        { slot: 'morgens', uhrzeit: '08:00', dosis: 0.5 },
        { slot: 'abends', uhrzeit: '20:00', dosis: 0.5 },
      ]),
    }));

    expect(result.tage).toBe(14);
    expect(result.textKurz).toBe('14 Tage');
  });

  it('calculates forecast by calendar days for medication taken three weekdays per week', () => {
    const result = calculateReichweite(med({
      aktueller_bestand: 6,
      einzeldosis: 1,
      einnahme_uhrzeiten: JSON.stringify([
        { slot: 'morgens', uhrzeit: '08:00', wochentage: [1, 3, 5] },
      ]),
    }));

    expect(result.tage).toBe(13);
    expect(result.textKurz).toBe('13 Tage');
    expect(result.textLang).toBe('Vorrat reicht bis 22.05.2026');
  });
});
