import {
  buildHomeActionStatus,
  formatProtocolEntryCount,
  type HomeMissedGroup,
} from '../utils/HomeActionStatus';

const yesterdayOnly: HomeMissedGroup[] = [
  { datumIso: '2026-06-01', itemCount: 3 },
];

const multipleDays: HomeMissedGroup[] = [
  { datumIso: '2026-06-01', itemCount: 3 },
  { datumIso: '2026-05-31', itemCount: 2 },
];

describe('HomeActionStatus', () => {
  it('prioritizes missed past intakes over today open intakes', () => {
    expect(buildHomeActionStatus({
      missedGroups: yesterdayOnly,
      todayOpenCount: 2,
      plannedTodayCount: 3,
      loggedTodayCount: 0,
    })).toEqual({
      kind: 'missed',
      severity: 'warning',
      title: 'Einnahmen fehlen',
      message: 'Für gestern sind geplante Einnahmen nicht protokolliert.',
      actionLabel: 'Jetzt nachtragen',
      missedDayCount: 1,
      missedItemCount: 3,
    });
  });

  it('uses critical severity when missed intakes span more than one day', () => {
    expect(buildHomeActionStatus({
      missedGroups: multipleDays,
      todayOpenCount: 0,
      plannedTodayCount: 3,
      loggedTodayCount: 0,
    })).toEqual({
      kind: 'missed',
      severity: 'critical',
      title: 'Einnahmen fehlen',
      message: 'Für mehrere Tage fehlen geplante Einnahmen.',
      actionLabel: 'Jetzt nachtragen',
      missedDayCount: 2,
      missedItemCount: 5,
    });
  });

  it('shows today open when no older missed intakes exist', () => {
    expect(buildHomeActionStatus({
      missedGroups: [],
      todayOpenCount: 1,
      plannedTodayCount: 3,
      loggedTodayCount: 0,
    })).toEqual({
      kind: 'todayOpen',
      severity: 'attention',
      title: 'Heute noch offen',
      message: 'Eine Einnahme kann bestätigt werden.',
      actionLabel: 'Heute bestätigen',
    });
  });

  it('shows done when no action is pending', () => {
    expect(buildHomeActionStatus({
      missedGroups: [],
      todayOpenCount: 0,
      plannedTodayCount: 3,
      loggedTodayCount: 0,
    })).toEqual({
      kind: 'done',
      severity: 'success',
      title: 'Heute erledigt',
      message: 'Alle geplanten Einnahmen sind protokolliert.',
      actionLabel: undefined,
    });
  });

  it('formats protocol count with German umlaut plural', () => {
    expect(formatProtocolEntryCount(0)).toBe('0 Einträge im heutigen Protokoll');
    expect(formatProtocolEntryCount(1)).toBe('1 Eintrag im heutigen Protokoll');
    expect(formatProtocolEntryCount(2)).toBe('2 Einträge im heutigen Protokoll');
  });
});
