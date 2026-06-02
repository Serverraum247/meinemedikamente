export type HomeActionStatusKind = 'missed' | 'todayOpen' | 'done';
export type HomeActionSeverity = 'critical' | 'warning' | 'attention' | 'success';

export interface HomeMissedGroup {
  datumIso: string;
  itemCount: number;
}

export interface BuildHomeActionStatusInput {
  missedGroups: HomeMissedGroup[];
  todayOpenCount: number;
  plannedTodayCount: number;
  loggedTodayCount: number;
}

export interface HomeActionStatus {
  kind: HomeActionStatusKind;
  severity: HomeActionSeverity;
  title: string;
  message: string;
  actionLabel?: string;
  missedDayCount?: number;
  missedItemCount?: number;
}

export function buildHomeActionStatus(input: BuildHomeActionStatusInput): HomeActionStatus {
  const missedDayCount = input.missedGroups.length;

  if (missedDayCount > 0) {
    const missedItemCount = input.missedGroups.reduce((sum, group) => sum + group.itemCount, 0);
    return {
      kind: 'missed',
      severity: missedDayCount > 1 ? 'critical' : 'warning',
      title: 'Einnahmen fehlen',
      message: missedDayCount > 1
        ? 'Für mehrere Tage fehlen geplante Einnahmen.'
        : 'Für gestern sind geplante Einnahmen nicht protokolliert.',
      actionLabel: 'Jetzt nachtragen',
      missedDayCount,
      missedItemCount,
    };
  }

  if (input.todayOpenCount > 0) {
    return {
      kind: 'todayOpen',
      severity: 'attention',
      title: 'Heute noch offen',
      message: input.todayOpenCount === 1
        ? 'Eine Einnahme kann bestätigt werden.'
        : `${input.todayOpenCount} Einnahmen können bestätigt werden.`,
      actionLabel: 'Heute bestätigen',
    };
  }

  return {
    kind: 'done',
    severity: 'success',
    title: 'Heute erledigt',
    message: input.plannedTodayCount > 0
      ? 'Alle geplanten Einnahmen sind protokolliert.'
      : 'Heute keine feste Einnahme geplant.',
    actionLabel: undefined,
  };
}

export function formatProtocolEntryCount(count: number): string {
  return `${count} ${count === 1 ? 'Eintrag' : 'Einträge'} im heutigen Protokoll`;
}
