import type { ArztRow, MedikamentRow, PersonRow } from '../database/Database';

const mockRequestPermissions = jest.fn();
const mockSaveEvent = jest.fn();

jest.mock('react-native-calendar-events', () => ({
  __esModule: true,
  default: {
    requestPermissions: mockRequestPermissions,
    checkPermissions: jest.fn(),
    saveEvent: mockSaveEvent,
  },
  requestPermissions: mockRequestPermissions,
  checkPermissions: jest.fn(),
  saveEvent: mockSaveEvent,
}));

const { buildMedicationPlanExport } = require('../services/MedicationPlanExportService');
const { erstelleRezeptAbholtermin } = require('../services/KalenderService');

const persons: PersonRow[] = [
  person('person-daniel', 'Daniel Brußig', 1),
  person('person-maria', 'Maria Test', 0),
  person('person-peter', 'Peter Test', 0),
];

const doctors: ArztRow[] = [
  doctor('arzt-daniel', 'Hausarzt Daniel'),
  doctor('arzt-maria', 'Hausarzt Maria'),
  doctor('arzt-peter', 'Hausarzt Peter'),
];

const medications = persons.flatMap((currentPerson, personIndex) =>
  Array.from({ length: 10 }, (_, medicationIndex) =>
    medication({
      id: `med-${currentPerson.id}-${medicationIndex + 1}`,
      name: `Medikament ${personIndex + 1}.${medicationIndex + 1}`,
      person_id: currentPerson.id,
      arzt_id: doctors[personIndex].id,
      aktueller_bestand: 100 + medicationIndex,
    }),
  ),
);

describe('Mehrpersonen-Lastfall', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('haelt 10 Medikamente pro Person sauber getrennt', () => {
    expect(medications).toHaveLength(30);

    for (const currentPerson of persons) {
      const visibleMedications = medications.filter(med => med.person_id === currentPerson.id);

      expect(visibleMedications).toHaveLength(10);
      expect(visibleMedications.every(med => med.person_id === currentPerson.id)).toBe(true);
    }
  });

  it('exportiert bei 3 Personen nur den Plan der aktuell ausgewaehlten Person', () => {
    const selectedPerson = persons[1];
    const exportPlan = buildMedicationPlanExport({
      person: selectedPerson,
      medications,
      doctors,
      generatedAt: new Date('2026-05-14T10:00:00.000'),
    });

    expect(exportPlan.text).toContain('Medikamentenplan für Maria Test');
    expect(exportPlan.text.match(/^(\d+)\. Medikament 2\./gm)).toHaveLength(10);
    expect(exportPlan.text).toContain('Hausarzt Maria');

    expect(exportPlan.text).not.toContain('Medikament 1.');
    expect(exportPlan.text).not.toContain('Medikament 3.');
    expect(exportPlan.text).not.toContain('Hausarzt Daniel');
    expect(exportPlan.text).not.toContain('Hausarzt Peter');
  });

  it('erstellt Kalendertermine appweit ohne personenbezogenen Kalender', async () => {
    mockRequestPermissions.mockResolvedValue('authorized');
    mockSaveEvent
      .mockResolvedValueOnce('calendar-event-1')
      .mockResolvedValueOnce('calendar-event-2');

    await expect(
      erstelleRezeptAbholtermin('Medikament Daniel', 20, 1, 1, 7, '2026-06-30'),
    ).resolves.toBe('calendar-event-1');
    await expect(
      erstelleRezeptAbholtermin('Medikament Maria', 30, 1, 1, 7, '2026-07-15'),
    ).resolves.toBe('calendar-event-2');

    expect(mockSaveEvent).toHaveBeenCalledTimes(2);
    for (const [, options] of mockSaveEvent.mock.calls) {
      expect(options).not.toHaveProperty('calendarId');
    }
  });
});

function person(id: string, name: string, ist_standard: number): PersonRow {
  return {
    id,
    name,
    avatar_emoji: '👤',
    avatar_uri: '',
    ist_standard,
    created_at: '2026-05-14T10:00:00.000Z',
  };
}

function doctor(id: string, name: string): ArztRow {
  return {
    id,
    name,
    telefon: '0681 123456',
    email: 'praxis@example.de',
    adresse: '',
    fachgebiet: 'Hausarzt',
    created_at: '2026-05-14T10:00:00.000Z',
  };
}

function medication(overrides: Partial<MedikamentRow>): MedikamentRow {
  return {
    id: 'med-1',
    name: 'Testmedikament',
    zusatz: 'Wirkstoff Test 5 mg',
    person_id: 'person-daniel',
    aktueller_bestand: 100,
    einzeldosis: 1,
    einheit: 'Tabletten',
    pzn: '',
    packungsgroesse: 100,
    warnung_ab_bestand: 10,
    sync_status: 0,
    erinnerung_aktiv: 1,
    einnahme_uhrzeiten: JSON.stringify([{ slot: 'morgens', uhrzeit: '08:00', dosis: 1 }]),
    auto_abzug_aktiv: 1,
    fruehe_einnahme_erlaubt: 1,
    arzt_id: '',
    staerke_wert: 5,
    staerke_einheit: 'mg',
    created_at: '2026-05-14T10:00:00.000Z',
    updated_at: '2026-05-14T10:00:00.000Z',
    ...overrides,
  };
}
