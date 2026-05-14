import { getSetting, getSettingsByPrefix, setSetting } from './SettingsService';

const REZEPT_TERMIN_PREFIX = 'rezept_termin:';

export interface RezeptTerminInfo {
  terminDatumIso: string;
  leerDatumIso: string;
  eventId: string;
  createdAt: string;
}

export function rezeptTerminKey(medikamentId: string): string {
  return `${REZEPT_TERMIN_PREFIX}${medikamentId}`;
}

export async function getRezeptTermin(medikamentId: string): Promise<RezeptTerminInfo | null> {
  return parseRezeptTerminInfo(await getSetting(rezeptTerminKey(medikamentId)));
}

export async function getAllRezeptTermine(): Promise<Record<string, RezeptTerminInfo>> {
  const raw = await getSettingsByPrefix(REZEPT_TERMIN_PREFIX);
  const termine: Record<string, RezeptTerminInfo> = {};

  Object.entries(raw).forEach(([key, value]) => {
    const medikamentId = key.slice(REZEPT_TERMIN_PREFIX.length);
    const info = parseRezeptTerminInfo(value);
    if (medikamentId && info) {
      termine[medikamentId] = info;
    }
  });

  return termine;
}

export async function saveRezeptTermin(
  medikamentId: string,
  info: RezeptTerminInfo,
): Promise<void> {
  await setSetting(rezeptTerminKey(medikamentId), JSON.stringify(info));
}

export function parseRezeptTerminInfo(value: string | null): RezeptTerminInfo | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<RezeptTerminInfo>;
    if (!parsed.terminDatumIso || !parsed.leerDatumIso || !parsed.eventId || !parsed.createdAt) {
      return null;
    }
    return {
      terminDatumIso: parsed.terminDatumIso,
      leerDatumIso: parsed.leerDatumIso,
      eventId: parsed.eventId,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}
