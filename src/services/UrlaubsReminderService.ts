import type { UrlaubsWarnung } from '../database/UrlaubController';
import { getSettingsByPrefix, setSetting } from './SettingsService';

const DONE_PREFIX = 'urlaubs_erinnerung_erledigt:';
const DELAYED_PREFIX = 'urlaubs_erinnerung_spaeter:';
const REMINDER_STAGES = [21, 14, 7, 3] as const;

export interface UrlaubsReminderTask {
  key: string;
  stufeTage: 21 | 14 | 7 | 3;
  title: string;
  body: string;
  medikamentName: string;
  praxisName: string;
  personId: string;
  urlaubStart: string;
  leerDatum: string;
  tageBisUrlaub: number;
  tageBisLeer: number;
}

interface BuildOptions {
  now?: Date;
  erledigtKeys?: Set<string>;
  delayedTodayKeys?: Set<string>;
}

export function createUrlaubsReminderKey(warnung: UrlaubsWarnung): string {
  return `urlaubs-erinnerung:${warnung.medikament.id}:${warnung.urlaub.id}`;
}

export function buildUrlaubsReminderTasks(
  warnungen: UrlaubsWarnung[],
  options: BuildOptions = {},
): UrlaubsReminderTask[] {
  const now = startOfDay(options.now ?? new Date());
  const erledigtKeys = options.erledigtKeys ?? new Set<string>();
  const delayedTodayKeys = options.delayedTodayKeys ?? new Set<string>();

  return warnungen
    .map(warnung => buildTask(warnung, now))
    .filter((task): task is UrlaubsReminderTask => task !== null)
    .filter(task => !erledigtKeys.has(task.key))
    .filter(task => !delayedTodayKeys.has(task.key))
    .sort((a, b) => {
      if (a.stufeTage !== b.stufeTage) return a.stufeTage - b.stufeTage;
      return a.tageBisLeer - b.tageBisLeer;
    });
}

export async function getUrlaubsReminderTasks(
  warnungen: UrlaubsWarnung[],
  now: Date = new Date(),
): Promise<UrlaubsReminderTask[]> {
  const [doneSettings, delayedSettings] = await Promise.all([
    getSettingsByPrefix(DONE_PREFIX),
    getSettingsByPrefix(`${DELAYED_PREFIX}${dateKey(now)}:`),
  ]);

  return buildUrlaubsReminderTasks(warnungen, {
    now,
    erledigtKeys: new Set(Object.keys(doneSettings).map(key => key.slice(DONE_PREFIX.length))),
    delayedTodayKeys: new Set(
      Object.keys(delayedSettings).map(key => key.slice(`${DELAYED_PREFIX}${dateKey(now)}:`.length)),
    ),
  });
}

export async function markUrlaubsReminderDone(taskKey: string): Promise<void> {
  await setSetting(`${DONE_PREFIX}${taskKey}`, new Date().toISOString());
}

export async function postponeUrlaubsReminderForToday(
  taskKey: string,
  now: Date = new Date(),
): Promise<void> {
  await setSetting(`${DELAYED_PREFIX}${dateKey(now)}:${taskKey}`, new Date().toISOString());
}

function buildTask(warnung: UrlaubsWarnung, now: Date): UrlaubsReminderTask | null {
  const urlaubStart = parseIsoDate(warnung.urlaub.urlaub_start);
  const leerDatum = startOfDay(warnung.leerDatum);
  const tageBisUrlaub = daysBetween(now, urlaubStart);
  if (tageBisUrlaub < 0 || tageBisUrlaub > 21) return null;

  const stufeTage = getReminderStage(tageBisUrlaub);
  if (!stufeTage) return null;

  const tageBisLeer = daysBetween(now, leerDatum);
  const medikamentName = warnung.medikament.name;
  const praxisName = warnung.urlaub.praxis_name;
  const urlaubStartText = formatDate(urlaubStart);
  const leerDatumText = formatDate(leerDatum);

  return {
    key: createUrlaubsReminderKey(warnung),
    stufeTage,
    title: 'Rezept vor Arzturlaub besorgen',
    body: `${medikamentName} reicht nur bis ${leerDatumText}. ${praxisName} ist ab ${urlaubStartText} im Urlaub.`,
    medikamentName,
    praxisName,
    personId: warnung.medikament.person_id,
    urlaubStart: warnung.urlaub.urlaub_start,
    leerDatum: toIsoDate(leerDatum),
    tageBisUrlaub,
    tageBisLeer,
  };
}

function getReminderStage(daysUntilVacation: number): 21 | 14 | 7 | 3 | null {
  for (const stage of [...REMINDER_STAGES].reverse()) {
    if (daysUntilVacation <= stage) return stage;
  }
  return null;
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86400000);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function dateKey(date: Date): string {
  return toIsoDate(startOfDay(date));
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
