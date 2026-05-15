import type { MedikamentRow } from '../database/Database';
import { entferneRezeptTermin, synchronisiereRezeptTermin } from '../services/RezeptTerminService';

const mockGetSetting = jest.fn();
const mockSetSetting = jest.fn();
const mockDeleteSetting = jest.fn();
const mockErstelleRezeptAbholtermin = jest.fn();
const mockEntferneKalenderEvent = jest.fn();
const mockUrlaubsKonflikt = jest.fn();

jest.mock('../services/SettingsService', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  getSettingsByPrefix: jest.fn(),
  setSetting: (...args: unknown[]) => mockSetSetting(...args),
  deleteSetting: (...args: unknown[]) => mockDeleteSetting(...args),
}));

jest.mock('../services/KalenderService', () => ({
  erstelleRezeptAbholtermin: (...args: unknown[]) => mockErstelleRezeptAbholtermin(...args),
  entferneKalenderEvent: (...args: unknown[]) => mockEntferneKalenderEvent(...args),
}));

jest.mock('../database/UrlaubController', () => ({
  getRezeptTerminUrlaubsKonflikt: (...args: unknown[]) => mockUrlaubsKonflikt(...args),
}));

function createMedikament(overrides: Partial<MedikamentRow> = {}): MedikamentRow {
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
    einnahme_uhrzeiten: JSON.stringify([{ slot: 'morgens', uhrzeit: '08:00', dosis: 1 }]),
    auto_abzug_aktiv: 0,
    arzt_id: 'arzt-1',
    staerke_wert: 5,
    staerke_einheit: 'mg',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('RezeptTerminService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-15T12:00:00.000Z'));
    jest.clearAllMocks();
    mockEntferneKalenderEvent.mockResolvedValue(true);
    mockUrlaubsKonflikt.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('aktualisiert eine bestehende Rezept-Erinnerung nach Bestandsaenderung', async () => {
    mockGetSetting.mockResolvedValue(
      JSON.stringify({
        terminDatumIso: '2026-05-28',
        leerDatumIso: '2026-06-04',
        eventId: 'event-1',
        createdAt: '2026-05-01T10:00:00.000Z',
      }),
    );
    mockErstelleRezeptAbholtermin.mockResolvedValue('event-1');

    const result = await synchronisiereRezeptTermin(createMedikament({ aktueller_bestand: 30 }));

    expect(result.status).toBe('updated');
    expect(mockErstelleRezeptAbholtermin).toHaveBeenCalledWith(
      'Biso Lich',
      30,
      1,
      1,
      7,
      '2026-06-14',
      'event-1',
    );
    expect(mockSetSetting).toHaveBeenCalledTimes(1);
  });

  it('entfernt eine bestehende Rezept-Erinnerung bei Urlaubskonflikt', async () => {
    mockGetSetting.mockResolvedValue(
      JSON.stringify({
        terminDatumIso: '2026-05-28',
        leerDatumIso: '2026-06-04',
        eventId: 'event-1',
        createdAt: '2026-05-01T10:00:00.000Z',
      }),
    );
    mockUrlaubsKonflikt.mockResolvedValue({
      id: 'urlaub-1',
      person_id: 'person-1',
      arzt_id: 'arzt-1',
      praxis_name: 'Hausarzt',
      telefon: '',
      urlaub_start: '2026-06-07',
      urlaub_ende: '2026-06-10',
      created_at: '2026-01-01T00:00:00.000Z',
    });

    const result = await synchronisiereRezeptTermin(createMedikament({ aktueller_bestand: 23 }));

    expect(result.status).toBe('removed_conflict');
    expect(mockEntferneKalenderEvent).toHaveBeenCalledWith('event-1');
    expect(mockDeleteSetting).toHaveBeenCalledWith('rezept_termin:med-1');
    expect(mockErstelleRezeptAbholtermin).not.toHaveBeenCalled();
  });

  it('laesst eine bereits passende Rezept-Erinnerung unveraendert', async () => {
    mockGetSetting.mockResolvedValue(
      JSON.stringify({
        terminDatumIso: '2026-06-07',
        leerDatumIso: '2026-06-14',
        eventId: 'event-1',
        createdAt: '2026-05-01T10:00:00.000Z',
      }),
    );

    const result = await synchronisiereRezeptTermin(createMedikament({ aktueller_bestand: 30 }));

    expect(result.status).toBe('unchanged');
    expect(mockErstelleRezeptAbholtermin).not.toHaveBeenCalled();
    expect(mockSetSetting).not.toHaveBeenCalled();
    expect(mockDeleteSetting).not.toHaveBeenCalled();
  });

  it('entfernt einen bestehenden Rezept-Termin inklusive Kalendereintrag', async () => {
    await entferneRezeptTermin('med-1', 'event-1');

    expect(mockEntferneKalenderEvent).toHaveBeenCalledWith('event-1');
    expect(mockDeleteSetting).toHaveBeenCalledWith('rezept_termin:med-1');
  });
});
