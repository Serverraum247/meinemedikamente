import type { ArztRow, ArztUrlaubRow, MedikamentRow } from '../database/Database';
import {
  calculateUrlaubsWarnungenForData,
  findRezeptTerminUrlaubsKonflikt,
} from '../database/UrlaubController';

function med(overrides: Partial<MedikamentRow>): MedikamentRow {
  return {
    id: 'med-1',
    name: 'Test Medikament',
    zusatz: '',
    person_id: 'person-default-001',
    aktueller_bestand: 10,
    einzeldosis: 1,
    einheit: 'Tabletten',
    pzn: '',
    packungsgroesse: 0,
    warnung_ab_bestand: 7,
    sync_status: 0,
    erinnerung_aktiv: 1,
    einnahme_uhrzeiten: '[]',
    auto_abzug_aktiv: 1,
    fruehe_einnahme_erlaubt: 1,
    arzt_id: 'arzt-1',
    staerke_wert: 0,
    staerke_einheit: '',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

const doctor: ArztRow = {
  id: 'arzt-1',
  name: 'Hausarzt Müller',
  telefon: '',
  email: '',
  adresse: '',
  fachgebiet: 'Hausarzt',
  created_at: '',
};

function urlaub(overrides: Partial<ArztUrlaubRow>): ArztUrlaubRow {
  return {
    id: 'urlaub-1',
    person_id: 'person-default-001',
    praxis_name: 'Hausarzt Müller',
    telefon: '',
    urlaub_start: '2026-07-01',
    urlaub_ende: '2026-07-14',
    created_at: '',
    ...overrides,
  };
}

describe('calculateUrlaubsWarnungenForData', () => {
  it('warns when medication runs out before the assigned doctor vacation starts', () => {
    const warnings = calculateUrlaubsWarnungenForData(
      [med({ aktueller_bestand: 51 })],
      [urlaub({})],
      [doctor],
      new Date('2026-05-10T12:00:00.000Z'),
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0].hinweis).toBe('Bitte vor dem Arzturlaub Tabletten besorgen.');
  });

  it('ignores vacations from another doctor when a medication has an assigned doctor', () => {
    const warnings = calculateUrlaubsWarnungenForData(
      [med({ arzt_id: 'arzt-1', aktueller_bestand: 51 })],
      [urlaub({ praxis_name: 'Andere Praxis' })],
      [doctor],
      new Date('2026-05-10T12:00:00.000Z'),
    );

    expect(warnings).toEqual([]);
  });

  it('blocks a prescription pickup date during the assigned doctor vacation', () => {
    const conflict = findRezeptTerminUrlaubsKonflikt(
      [med({ arzt_id: 'arzt-1' })][0],
      [urlaub({ arzt_id: 'arzt-1', urlaub_start: '2026-08-10', urlaub_ende: '2026-08-20' })],
      [doctor],
      '2026-08-12',
    );

    expect(conflict?.id).toBe('urlaub-1');
  });

  it('allows a prescription pickup date outside the doctor vacation', () => {
    const conflict = findRezeptTerminUrlaubsKonflikt(
      [med({ arzt_id: 'arzt-1' })][0],
      [urlaub({ arzt_id: 'arzt-1', urlaub_start: '2026-08-10', urlaub_ende: '2026-08-20' })],
      [doctor],
      '2026-08-09',
    );

    expect(conflict).toBeNull();
  });
});
