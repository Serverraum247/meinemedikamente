import type { MedikamentRow } from '../database/Database';
import { getDatabase } from '../database/Database';
import {
  DuplicateEinnahmeError,
  einnahmeNachtragen,
  getAllMedikamente,
} from '../database/MedikamentController';
import {
  istSlotAnDatumAktiv,
  parseEinnahmeplan,
  SLOT_META,
  SLOT_REIHENFOLGE,
  type EinnahmeSlot,
  type TageszeitSlot,
} from '../utils/Einnahmeplan';

export interface EinnahmeNachtragExistingRow {
  medikament_id: string;
  person_id?: string;
  timestamp: string;
  slot?: string;
}

export interface OffeneEinnahmeNachtragItem {
  id: string;
  datumIso: string;
  medikamentId: string;
  medikamentName: string;
  zusatz?: string;
  slot: TageszeitSlot;
  slotLabel: string;
  slotUhrzeit: string;
  dosis: number;
  einheit: string;
}

export interface OffeneEinnahmeNachtragGroup {
  datumIso: string;
  datumLabel: string;
  items: OffeneEinnahmeNachtragItem[];
}

export type NachtragRangeMode = 'yesterday' | 'sevenDays' | 'custom' | 'today';

interface BuildOffeneEinnahmeNachtraegeInput {
  medikamente: MedikamentRow[];
  vorhandeneEinnahmen: EinnahmeNachtragExistingRow[];
  personId?: string;
  startDate: Date;
  endDate: Date;
  includeFutureToday?: boolean;
  now?: Date;
}

export interface SpeichereNachtraegeResult {
  gespeichert: number;
  doppelt: number;
  fehlgeschlagen: number;
}

export function buildOffeneEinnahmeNachtraege({
  medikamente,
  vorhandeneEinnahmen,
  personId,
  startDate,
  endDate,
  includeFutureToday = true,
  now = new Date(),
}: BuildOffeneEinnahmeNachtraegeInput): OffeneEinnahmeNachtragGroup[] {
  const start = startOfLocalDay(startDate);
  const end = startOfLocalDay(endDate);
  const todayIso = toLocalIsoDate(now);
  const aktuelleMinuten = now.getHours() * 60 + now.getMinutes();
  const vorhandeneKeys = buildVorhandeneKeys(vorhandeneEinnahmen, personId);
  const dates = eachLocalDate(start, end).reverse();
  const groups: OffeneEinnahmeNachtragGroup[] = [];

  for (const datum of dates) {
    const datumIso = toLocalIsoDate(datum);
    const istHeute = datumIso === todayIso;
    const items: OffeneEinnahmeNachtragItem[] = [];

    for (const med of medikamente) {
      if (personId && med.person_id !== personId) continue;
      const plan = parseEinnahmeplan(med.einnahme_uhrzeiten || '[]');
      if (plan.length === 0) continue;

      for (const slot of sortSlots(plan)) {
        if (!istSlotAnDatumAktiv(slot, datum)) continue;
        if (istHeute && !istSlotHeuteBestaetigbar(slot, med, aktuelleMinuten, includeFutureToday)) continue;

        const slotKey = normalizeSlot(slot.slot);
        const key = `${datumIso}:${med.id}:${slotKey}`;
        if (vorhandeneKeys.has(key)) continue;

        const dosis = slot.dosis !== undefined ? slot.dosis : med.einzeldosis;
        const meta = SLOT_META[slot.slot];
        items.push({
          id: key,
          datumIso,
          medikamentId: med.id,
          medikamentName: med.name,
          zusatz: med.zusatz || undefined,
          slot: slot.slot,
          slotLabel: meta.label,
          slotUhrzeit: slot.uhrzeit,
          dosis,
          einheit: med.einheit,
        });
      }
    }

    if (items.length > 0) {
      groups.push({
        datumIso,
        datumLabel: formatDatumLabel(datum, now),
        items,
      });
    }
  }

  return groups;
}

export async function getOffeneEinnahmeNachtraege(
  personId?: string,
  mode: NachtragRangeMode = 'sevenDays',
  customDate?: Date,
): Promise<OffeneEinnahmeNachtragGroup[]> {
  const now = new Date();
  const { startDate, endDate, includeFutureToday } = resolveRange(mode, customDate, now);
  const [medikamente, vorhandeneEinnahmen] = await Promise.all([
    getAllMedikamente(),
    getEinnahmenZwischen(startDate, endDate, personId),
  ]);

  return buildOffeneEinnahmeNachtraege({
    medikamente,
    vorhandeneEinnahmen,
    personId,
    startDate,
    endDate,
    includeFutureToday,
    now,
  });
}

export async function speichereEinnahmeNachtraege(
  items: OffeneEinnahmeNachtragItem[],
): Promise<SpeichereNachtraegeResult> {
  let gespeichert = 0;
  let doppelt = 0;
  let fehlgeschlagen = 0;

  for (const item of items) {
    try {
      await einnahmeNachtragen(
        item.medikamentId,
        item.dosis,
        buildNachtragTimestamp(item.datumIso, item.slotUhrzeit),
        item.slot,
      );
      gespeichert += 1;
    } catch (error) {
      if (error instanceof DuplicateEinnahmeError) {
        doppelt += 1;
      } else {
        fehlgeschlagen += 1;
      }
    }
  }

  return { gespeichert, doppelt, fehlgeschlagen };
}

export function buildNachtragTimestamp(datumIso: string, uhrzeit?: string): string {
  return `${datumIso} ${uhrzeit || '12:00'}:00`;
}

function resolveRange(
  mode: NachtragRangeMode,
  customDate: Date | undefined,
  now: Date,
): { startDate: Date; endDate: Date; includeFutureToday: boolean } {
  const today = startOfLocalDay(now);
  if (mode === 'today') {
    return { startDate: today, endDate: today, includeFutureToday: true };
  }
  if (mode === 'yesterday') {
    const yesterday = addDays(today, -1);
    return { startDate: yesterday, endDate: yesterday, includeFutureToday: false };
  }
  if (mode === 'custom' && customDate) {
    const custom = startOfLocalDay(customDate);
    return { startDate: custom, endDate: custom, includeFutureToday: false };
  }
  return {
    startDate: addDays(today, -7),
    endDate: addDays(today, -1),
    includeFutureToday: false,
  };
}

async function getEinnahmenZwischen(
  startDate: Date,
  endDate: Date,
  personId?: string,
): Promise<EinnahmeNachtragExistingRow[]> {
  const db = await getDatabase();
  const params: Array<string> = [
    `${toLocalIsoDate(startDate)} 00:00:00`,
    `${toLocalIsoDate(endDate)} 23:59:59`,
  ];
  const personFilter = personId ? 'AND person_id = ?' : '';
  if (personId) params.push(personId);

  const results = await db.executeSql(
    `SELECT medikament_id, person_id, timestamp, slot
     FROM einnahmen
     WHERE timestamp >= ?
       AND timestamp <= ?
       ${personFilter}
     ORDER BY timestamp ASC`,
    params,
  );

  const rows: EinnahmeNachtragExistingRow[] = [];
  results.forEach(result => {
    for (let i = 0; i < result.rows.length; i += 1) {
      rows.push(result.rows.item(i));
    }
  });
  return rows;
}

function buildVorhandeneKeys(
  einnahmen: EinnahmeNachtragExistingRow[],
  personId?: string,
): Set<string> {
  const keys = new Set<string>();
  for (const einnahme of einnahmen) {
    if (personId && einnahme.person_id && einnahme.person_id !== personId) continue;
    const datumIso = normalizeTimestampDate(einnahme.timestamp);
    keys.add(`${datumIso}:${einnahme.medikament_id}:${normalizeSlot(einnahme.slot)}`);
  }
  return keys;
}

function istSlotHeuteBestaetigbar(
  slot: EinnahmeSlot,
  medikament: MedikamentRow,
  aktuelleMinuten: number,
  includeFutureToday: boolean,
): boolean {
  const slotMinuten = parseUhrzeitMinuten(slot.uhrzeit);
  if (aktuelleMinuten >= slotMinuten) return true;
  return includeFutureToday && medikament.fruehe_einnahme_erlaubt !== 0;
}

function sortSlots(plan: EinnahmeSlot[]): EinnahmeSlot[] {
  return [...plan].sort((a, b) => {
    const slotDiff = SLOT_REIHENFOLGE.indexOf(a.slot) - SLOT_REIHENFOLGE.indexOf(b.slot);
    if (slotDiff !== 0) return slotDiff;
    return parseUhrzeitMinuten(a.uhrzeit) - parseUhrzeitMinuten(b.uhrzeit);
  });
}

function parseUhrzeitMinuten(uhrzeit: string): number {
  const [hours, minutes] = uhrzeit.split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function eachLocalDate(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const cursor = startOfLocalDay(start);
  const last = startOfLocalDay(end);
  while (cursor.getTime() <= last.getTime()) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeTimestampDate(timestamp: string): string {
  const match = timestamp.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return toLocalIsoDate(new Date(timestamp));
}

function normalizeSlot(slot?: string): string {
  return slot || '';
}

function formatDatumLabel(date: Date, now: Date): string {
  const today = startOfLocalDay(now);
  const diffDays = Math.round((today.getTime() - startOfLocalDay(date).getTime()) / 86400000);
  if (diffDays === 0) return 'Heute';
  if (diffDays === 1) return 'Gestern';
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });
}
