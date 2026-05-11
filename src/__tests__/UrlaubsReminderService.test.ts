import type { ArztUrlaubRow, MedikamentRow } from '../database/Database';
import {
  buildUrlaubsReminderTasks,
  createUrlaubsReminderKey,
} from '../services/UrlaubsReminderService';
import type { UrlaubsWarnung } from '../database/UrlaubController';

function med(overrides: Partial<MedikamentRow> = {}): MedikamentRow {
  return {
    id: 'med-1',
    name: 'Biso Lich',
    zusatz: 'Bisoprolol',
    person_id: 'person-default-001',
    aktueller_bestand: 20,
    einzeldosis: 1,
    einheit: 'Tabletten',
    pzn: '',
    packungsgroesse: 0,
    warnung_ab_bestand: 7,
    sync_status: 0,
    erinnerung_aktiv: 1,
    einnahme_uhrzeiten: '[]',
    auto_abzug_aktiv: 1,
    arzt_id: 'arzt-1',
    staerke_wert: 0,
    staerke_einheit: '',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function urlaub(overrides: Partial<ArztUrlaubRow> = {}): ArztUrlaubRow {
  return {
    id: 'urlaub-1',
    person_id: 'person-default-001',
    arzt_id: 'arzt-1',
    praxis_name: 'Hausarzt Müller',
    telefon: '',
    urlaub_start: '2026-05-24',
    urlaub_ende: '2026-06-07',
    created_at: '',
    ...overrides,
  };
}

function warnung(overrides: Partial<UrlaubsWarnung> = {}): UrlaubsWarnung {
  return {
    medikament: med(),
    leerDatum: new Date('2026-05-22T12:00:00.000Z'),
    urlaub: urlaub(),
    tageBisLeer: 12,
    hinweis: 'Bitte vor dem Arzturlaub Tabletten besorgen.',
    ...overrides,
  };
}

describe('buildUrlaubsReminderTasks', () => {
  const now = new Date('2026-05-10T12:00:00.000Z');

  it('creates a daily refill task 14 days before the doctor vacation starts', () => {
    const tasks = buildUrlaubsReminderTasks([warnung()], { now });

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      key: 'urlaubs-erinnerung:med-1:urlaub-1',
      stufeTage: 14,
      title: 'Rezept vor Arzturlaub besorgen',
      medikamentName: 'Biso Lich',
      praxisName: 'Hausarzt Müller',
    });
    expect(tasks[0].body).toContain('Biso Lich reicht nur bis 22.05.2026');
    expect(tasks[0].body).toContain('Hausarzt Müller ist ab 24.05.2026 im Urlaub');
  });

  it('does not create a task more than 21 days before the vacation starts', () => {
    const tasks = buildUrlaubsReminderTasks(
      [warnung({ urlaub: urlaub({ urlaub_start: '2026-06-15', urlaub_ende: '2026-06-30' }) })],
      { now },
    );

    expect(tasks).toEqual([]);
  });

  it('hides reminders that were marked done', () => {
    const key = createUrlaubsReminderKey(warnung());

    const tasks = buildUrlaubsReminderTasks([warnung()], {
      now,
      erledigtKeys: new Set([key]),
    });

    expect(tasks).toEqual([]);
  });

  it('hides reminders postponed for today only', () => {
    const key = createUrlaubsReminderKey(warnung());

    const todayTasks = buildUrlaubsReminderTasks([warnung()], {
      now,
      delayedTodayKeys: new Set([key]),
    });
    const tomorrowTasks = buildUrlaubsReminderTasks([warnung()], {
      now: new Date('2026-05-11T12:00:00.000Z'),
      delayedTodayKeys: new Set(),
    });

    expect(todayTasks).toEqual([]);
    expect(tomorrowTasks).toHaveLength(1);
  });
});
