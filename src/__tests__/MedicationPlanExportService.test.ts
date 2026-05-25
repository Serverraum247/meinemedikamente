import type { ArztRow, MedikamentRow, PersonRow } from '../database/Database';
import { buildMedicationPlanExport } from '../services/MedicationPlanExportService';

const person: PersonRow = {
  id: 'person-1',
  name: 'Daniel Brußig',
  avatar_emoji: '👤',
  avatar_uri: '',
  ist_standard: 1,
  created_at: '2026-05-10T10:00:00.000Z',
};

const otherPerson: PersonRow = {
  ...person,
  id: 'person-2',
  name: 'Andere Person',
};

const doctor: ArztRow = {
  id: 'arzt-1',
  name: 'Dr. Müller',
  telefon: '0681 123456',
  email: 'praxis@example.de',
  adresse: 'Saarbrücken',
  fachgebiet: 'Hausarzt',
  created_at: '2026-05-10T10:00:00.000Z',
};

function medication(overrides: Partial<MedikamentRow> = {}): MedikamentRow {
  return {
    id: 'med-1',
    name: 'Ramipril',
    zusatz: 'Blutdruck',
    person_id: person.id,
    aktueller_bestand: 200,
    einzeldosis: 0.5,
    einheit: 'Tabletten',
    pzn: '12345678',
    packungsgroesse: 100,
    warnung_ab_bestand: 10,
    sync_status: 0,
    erinnerung_aktiv: 1,
    einnahme_uhrzeiten: JSON.stringify([
      { slot: 'morgens', uhrzeit: '08:00', dosis: 0.5, wochentage: [1, 3, 5] },
      { slot: 'abends', uhrzeit: '20:00', dosis: 1 },
    ]),
    auto_abzug_aktiv: 1,
    fruehe_einnahme_erlaubt: 1,
    arzt_id: doctor.id,
    staerke_wert: 5,
    staerke_einheit: 'mg',
    created_at: '2026-05-10T10:00:00.000Z',
    updated_at: '2026-05-10T10:00:00.000Z',
    ...overrides,
  };
}

describe('MedicationPlanExportService', () => {
  it('builds a shareable medication plan for the selected person only', () => {
    const exportPlan = buildMedicationPlanExport({
      person,
      medications: [
        medication(),
        medication({ id: 'med-2', name: 'Fremdes Medikament', person_id: otherPerson.id }),
      ],
      doctors: [doctor],
      generatedAt: new Date('2026-05-10T09:30:00.000'),
    });

    expect(exportPlan.title).toBe('Mein MediPlan');
    expect(exportPlan.fileName).toBe('Medikamentenplan Daniel Brussig 10.05.2026.pdf');
    expect(exportPlan.text).toContain('Medikamentenplan für Daniel Brußig');
    expect(exportPlan.text).toContain('Erstellt am 10.05.2026, 09:30 Uhr');
    expect(exportPlan.text).toContain('Ramipril');
    expect(exportPlan.text).toContain('Wirkstoff: Blutdruck');
    expect(exportPlan.text).toContain('Stärke: 5 mg');
    expect(exportPlan.text).toContain('Dosis: 0,5 Tabletten');
    expect(exportPlan.text).toContain('Morgens 08:00 Uhr: 0,5 Tabletten (Mo, Mi, Fr)');
    expect(exportPlan.text).toContain('Abends 20:00 Uhr: 1 Tabletten (täglich)');
    expect(exportPlan.text).toContain('PZN: 12345678');
    expect(exportPlan.text).toContain('Arzt: Dr. Müller, Hausarzt, Tel. 0681 123456, E-Mail praxis@example.de');
    expect(exportPlan.text).toContain('Dieser Plan ersetzt keine ärztliche oder pharmazeutische Beratung.');
    expect(exportPlan.text).not.toContain('Fremdes Medikament');
  });

  it('does not export stock, range, warning threshold or technical ids', () => {
    const exportPlan = buildMedicationPlanExport({
      person,
      medications: [medication()],
      doctors: [doctor],
      generatedAt: new Date('2026-05-10T09:30:00.000'),
    });

    expect(exportPlan.text).not.toContain('Bestand');
    expect(exportPlan.text).not.toContain('Reichweite');
    expect(exportPlan.text).not.toContain('Warnschwelle');
    expect(exportPlan.text).not.toContain('200');
    expect(exportPlan.text).not.toContain('med-1');
    expect(exportPlan.text).not.toContain('person-1');
  });

  it('keeps combination medication active ingredients readable in the PDF text', () => {
    const exportPlan = buildMedicationPlanExport({
      person,
      medications: [
        medication({
          name: 'Candecor comp.',
          zusatz: 'Candesartan 16 mg + Hydrochlorothiazid 12,5 mg',
          staerke_wert: 0,
          staerke_einheit: '',
        }),
      ],
      doctors: [doctor],
      generatedAt: new Date('2026-05-10T09:30:00.000'),
    });

    expect(exportPlan.text).toContain('Candecor comp.');
    expect(exportPlan.text).toContain('Wirkstoffe:');
    expect(exportPlan.text).toContain('- Candesartan 16 mg');
    expect(exportPlan.text).toContain('- Hydrochlorothiazid 12,5 mg');
  });
});
