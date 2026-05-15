import type { ArztUrlaubRow, MedikamentRow } from '../database/Database';
import { getRezeptTerminUrlaubsKonflikt } from '../database/UrlaubController';
import { calculateReichweite } from '../utils/ReichweitenCalc';
import { calculateRezeptTerminFromLeerDatum, REZEPT_TERMIN_TAGE_VOR_LEER } from '../utils/RezeptTermin';
import { erstelleRezeptAbholtermin, entferneKalenderEvent } from './KalenderService';
import { deleteSetting, getSetting, getSettingsByPrefix, setSetting } from './SettingsService';

const REZEPT_TERMIN_PREFIX = 'rezept_termin:';

export interface RezeptTerminInfo {
  terminDatumIso: string;
  leerDatumIso: string;
  eventId: string;
  createdAt: string;
}

export interface RezeptTerminSyncResult {
  status: 'none' | 'unchanged' | 'updated' | 'removed_conflict' | 'removed_unavailable' | 'failed';
  info?: RezeptTerminInfo;
  konflikt?: ArztUrlaubRow;
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

export async function deleteRezeptTermin(medikamentId: string): Promise<void> {
  await deleteSetting(rezeptTerminKey(medikamentId));
}

export async function entferneRezeptTermin(
  medikamentId: string,
  eventId?: string,
): Promise<void> {
  await loescheRezeptTerminUndEvent(medikamentId, eventId);
}

export function istRezeptTerminAktuell(
  medikament: MedikamentRow,
  info: RezeptTerminInfo | null,
): boolean {
  if (!info) return false;
  const reichweite = calculateReichweite(medikament);
  if (!reichweite.leerDatum) return false;

  const erwartet = calculateRezeptTerminFromLeerDatum(
    reichweite.leerDatum,
    REZEPT_TERMIN_TAGE_VOR_LEER,
  );

  return (
    info.leerDatumIso === erwartet.leerDatumIso &&
    info.terminDatumIso === erwartet.terminDatumIso
  );
}

export async function synchronisiereRezeptTermin(
  medikament: MedikamentRow,
): Promise<RezeptTerminSyncResult> {
  const bestehend = await getRezeptTermin(medikament.id);
  if (!bestehend) {
    return { status: 'none' };
  }

  const reichweite = calculateReichweite(medikament);
  if (!reichweite.leerDatum) {
    await loescheRezeptTerminUndEvent(medikament.id, bestehend.eventId);
    return { status: 'removed_unavailable' };
  }

  const erwartet = calculateRezeptTerminFromLeerDatum(
    reichweite.leerDatum,
    REZEPT_TERMIN_TAGE_VOR_LEER,
  );

  if (
    bestehend.leerDatumIso === erwartet.leerDatumIso &&
    bestehend.terminDatumIso === erwartet.terminDatumIso
  ) {
    return { status: 'unchanged', info: bestehend };
  }

  const konflikt = await getRezeptTerminUrlaubsKonflikt(medikament, erwartet.terminDatumIso);
  if (konflikt) {
    await loescheRezeptTerminUndEvent(medikament.id, bestehend.eventId);
    return { status: 'removed_conflict', konflikt };
  }

  const eventId = await erstelleRezeptAbholtermin(
    medikament.name,
    medikament.aktueller_bestand,
    medikament.einzeldosis,
    1,
    REZEPT_TERMIN_TAGE_VOR_LEER,
    erwartet.leerDatumIso,
    bestehend.eventId,
  );

  if (!eventId) {
    return { status: 'failed', info: bestehend };
  }

  const aktualisiert: RezeptTerminInfo = {
    terminDatumIso: erwartet.terminDatumIso,
    leerDatumIso: erwartet.leerDatumIso,
    eventId,
    createdAt: new Date().toISOString(),
  };
  await saveRezeptTermin(medikament.id, aktualisiert);
  return { status: 'updated', info: aktualisiert };
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

async function loescheRezeptTerminUndEvent(
  medikamentId: string,
  eventId?: string,
): Promise<void> {
  if (eventId) {
    await entferneKalenderEvent(eventId);
  }
  await deleteRezeptTermin(medikamentId);
}
