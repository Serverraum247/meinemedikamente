/**
 * Einnahmeplan.ts – Tageszeit-basiertes Einnahmemodell
 *
 * Senioren denken in "Morgens, Mittags, Abends" – nicht in Uhrzeiten.
 * Jeder Slot hat eine optionale individuelle Dosis (sonst Fallback auf einzeldosis).
 *
 * JSON-Struktur in einnahme_uhrzeiten (Datenbank):
 * [
 *   { "slot": "morgens", "uhrzeit": "08:00", "dosis": 0.5 },
 *   { "slot": "abends",  "uhrzeit": "20:00", "dosis": 1.0 }
 * ]
 *
 * Abwärtskompatibel: Altes Format ["08:00","20:00"] wird automatisch migriert.
 *
 * Standard-Uhrzeiten sind in SQLite-Tabelle 'einstellungen' speicherbar (Settings-Screen).
 */

import { getSetting, setSetting, deleteSetting } from '../services/SettingsService';

/** Die vier klassischen Tageszeiten */
export type TageszeitSlot = 'morgens' | 'mittags' | 'abends' | 'nachts';

/** ISO-Wochentage: 1=Montag, 7=Sonntag */
export type Wochentag = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Ein Einnahme-Slot pro Tag */
export interface EinnahmeSlot {
  slot: TageszeitSlot;
  uhrzeit: string;       // HH:MM – Default-Uhrzeit pro Slot
  dosis?: number;        // Optional – abweichende Dosis, Fallback auf einzeldosis
  wochentage?: Wochentag[]; // Optional – keine Angabe bedeutet täglich
}

/** Fallback-Standardzeiten (werden verwendet wenn nichts in DB steht) */
const FALLBACK_UHRZEITEN: Record<TageszeitSlot, string> = {
  morgens: '08:00',
  mittags: '12:00',
  abends:  '18:00',
  nachts:  '22:00',
};

/** Metadaten pro Slot fuer die UI */
export const SLOT_META: Record<TageszeitSlot, { label: string; emoji: string }> = {
  morgens:  { label: 'Morgens',  emoji: '🌅' },
  mittags:  { label: 'Mittags',  emoji: '☀️' },
  abends:   { label: 'Abends',   emoji: '🌆' },
  nachts:   { label: 'Nachts',   emoji: '🌙' },
};

/** Kompakte Wochentagsauswahl fuer Senioren-UI */
export const WOCHENTAGE_META: Array<{ value: Wochentag; label: string }> = [
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Di' },
  { value: 3, label: 'Mi' },
  { value: 4, label: 'Do' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
  { value: 7, label: 'So' },
];

/** DB-Key fuer benutzerdefinierte Standard-Uhrzeiten */
export const SETTINGS_KEY_UHRZEITEN = 'einnahmeplan_default_uhrzeiten';

/** Reihenfolge der Slots im UI */
export const SLOT_REIHENFOLGE: TageszeitSlot[] = ['morgens', 'mittags', 'abends', 'nachts'];

/**
 * Standard-Uhrzeit fuer einen Slot abrufen.
 * Liest zuerst aus SQLite, faellt zurueck auf HARD-CODED Default.
 */
export async function getDefaultUhrzeit(slot: TageszeitSlot): Promise<string> {
  try {
    const stored = await getSetting(SETTINGS_KEY_UHRZEITEN);
    if (stored) {
      const map: Record<string, string> = JSON.parse(stored);
      if (map[slot]) return map[slot];
    }
  } catch { /* Fallback */ }
  return FALLBACK_UHRZEITEN[slot];
}

/**
 * Alle Standard-Uhrzeiten auf einmal abrufen (fuer Settings-Screen)
 */
export async function getAllDefaultUhrzeiten(): Promise<Record<TageszeitSlot, string>> {
  try {
    const stored = await getSetting(SETTINGS_KEY_UHRZEITEN);
    if (stored) {
      const map = JSON.parse(stored);
      return {
        morgens: map.morgens || FALLBACK_UHRZEITEN.morgens,
        mittags: map.mittags || FALLBACK_UHRZEITEN.mittags,
        abends:  map.abends  || FALLBACK_UHRZEITEN.abends,
        nachts:  map.nachts  || FALLBACK_UHRZEITEN.nachts,
      };
    }
  } catch { /* Fallback */ }
  return { ...FALLBACK_UHRZEITEN };
}

/**
 * Alle Standard-Uhrzeiten auf einmal speichern (fuer Settings-Screen)
 */
export async function saveAllDefaultUhrzeiten(uhrzeiten: Record<TageszeitSlot, string>): Promise<void> {
  await setSetting(SETTINGS_KEY_UHRZEITEN, JSON.stringify(uhrzeiten));
}

/**
 * Standard-Uhrzeit fuer einen Slot speichern
 */
export async function setDefaultUhrzeit(slot: TageszeitSlot, uhrzeit: string): Promise<void> {
  const all = await getAllDefaultUhrzeiten();
  all[slot] = uhrzeit;
  await saveAllDefaultUhrzeiten(all);
}

/**
 * Alle Standard-Uhrzeiten auf einmal zuruecksetzen
 */
export async function resetDefaultUhrzeiten(): Promise<void> {
  await deleteSetting(SETTINGS_KEY_UHRZEITEN);
}

// ─── Serialisierung / Deserialisierung ─────────────────────────────

/**
 * Einnahmeplan aus JSON-String deserialisieren
 * Unterstuetzt neues Format (Slots) und altes Format (Uhrzeit-Array)
 */
export function parseEinnahmeplan(json: string): EinnahmeSlot[] {
  if (!json || json === '[]') return [];

  try {
    const parsed = JSON.parse(json);

    // Altes Format: ["08:00", "20:00"] → auf Slots mappen
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      const slotMap: Record<string, TageszeitSlot> = {
        '08:00': 'morgens', '09:00': 'morgens',
        '12:00': 'mittags', '13:00': 'mittags',
        '18:00': 'abends',  '19:00': 'abends', '20:00': 'abends',
        '22:00': 'nachts',  '23:00': 'nachts',
      };
      return parsed.map((u: string) => {
        // Naechsten passenden Slot finden
        const slot = slotMap[u] || (parseInt(u) < 12 ? 'morgens' : parseInt(u) < 17 ? 'mittags' : parseInt(u) < 21 ? 'abends' : 'nachts');
        return { slot, uhrzeit: u };
      });
    }

    // Neues Format: [{ slot: "morgens", uhrzeit: "08:00", dosis: 0.5 }]
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].slot) {
      return parsed.map((s: any) => ({
        slot: s.slot as TageszeitSlot,
        uhrzeit: s.uhrzeit || '08:00',
        ...(s.dosis !== undefined && s.dosis !== null ? { dosis: Number(s.dosis) } : {}),
        ...(normalizeWochentage(s.wochentage).length > 0 ? { wochentage: normalizeWochentage(s.wochentage) } : {}),
      }));
    }

    return [];
  } catch {
    return [];
  }
}

/**
 * Einnahmeplan zu JSON-String serialisieren
 */
export function serializeEinnahmeplan(slots: EinnahmeSlot[]): string {
  if (slots.length === 0) return '[]';
  return JSON.stringify(
    slots.map(s => ({
      slot: s.slot,
      uhrzeit: s.uhrzeit || '08:00',
      ...(s.dosis !== undefined ? { dosis: s.dosis } : {}),
      ...(s.wochentage && s.wochentage.length > 0 ? { wochentage: normalizeWochentage(s.wochentage) } : {}),
    }))
  );
}

// ─── Tagesdosis-Berechnung ─────────────────────────────────────────

/**
 * Berechnet die Gesamt-Tagesdosis basierend auf dem Einnahmeplan.
 * Falls ein Slot keine eigene Dosis hat, wird die Standard-Einzeldosis verwendet.
 */
export function tagesdosisBerechnen(plan: EinnahmeSlot[], standardDosis: number): number {
  if (plan.length === 0) return standardDosis;
  let summe = 0;
  for (const slot of plan) {
    summe += slot.dosis !== undefined ? slot.dosis : standardDosis;
  }
  return summe;
}

export function getDosisFuerSlot(
  plan: EinnahmeSlot[],
  slot: TageszeitSlot,
  standardDosis: number
): number {
  const eintrag = plan.find(s => s.slot === slot);
  return eintrag?.dosis !== undefined ? eintrag.dosis : standardDosis;
}

/**
 * Berechnet die Dosis fuer ein konkretes Kalenderdatum.
 * Slots ohne Wochentage gelten weiter taeglich.
 */
export function tagesdosisBerechnenFuerDatum(
  plan: EinnahmeSlot[],
  standardDosis: number,
  datum: Date
): number {
  if (plan.length === 0) return standardDosis;
  let summe = 0;
  for (const slot of plan) {
    if (!istSlotAnDatumAktiv(slot, datum)) continue;
    summe += slot.dosis !== undefined ? slot.dosis : standardDosis;
  }
  return summe;
}

export function planHatWochentage(plan: EinnahmeSlot[]): boolean {
  return plan.some(slot => Boolean(slot.wochentage && slot.wochentage.length > 0));
}

export function istSlotAnDatumAktiv(slot: EinnahmeSlot, datum: Date): boolean {
  if (!slot.wochentage || slot.wochentage.length === 0) return true;
  return slot.wochentage.includes(getIsoWochentag(datum));
}

export function getIsoWochentag(datum: Date): Wochentag {
  const tag = datum.getDay();
  return (tag === 0 ? 7 : tag) as Wochentag;
}

// ─── Slot-Hilfsfunktionen ──────────────────────────────────────────

/**
 * Slot hinzufuegen oder entfernen (Toggle)
 * Liest Default-Uhrzeit aus Einstellungen (SQLite).
 */
export async function toggleSlot(plan: EinnahmeSlot[], slot: TageszeitSlot): Promise<EinnahmeSlot[]> {
  const existing = plan.findIndex(s => s.slot === slot);
  if (existing >= 0) {
    return plan.filter(s => s.slot !== slot);
  }
  const defaultUhrzeit = await getDefaultUhrzeit(slot);
  return [...plan, { slot, uhrzeit: defaultUhrzeit }];
}

/**
 * Dosis fuer einen Slot aktualisieren
 */
export function setSlotDosis(plan: EinnahmeSlot[], slot: TageszeitSlot, dosis: number | undefined): EinnahmeSlot[] {
  return plan.map(s =>
    s.slot === slot ? { ...s, dosis } : s
  );
}

/**
 * Wochentag fuer einen Slot toggeln.
 * Keine gespeicherten Wochentage bedeutet taegliche Einnahme.
 */
export function toggleSlotWochentag(
  plan: EinnahmeSlot[],
  slot: TageszeitSlot,
  wochentag: Wochentag
): EinnahmeSlot[] {
  return plan.map(s => {
    if (s.slot !== slot) return s;
    const current = normalizeWochentage(s.wochentage);
    const next = current.includes(wochentag)
      ? current.filter(tag => tag !== wochentag)
      : [...current, wochentag].sort((a, b) => a - b);

    if (next.length === 0 || next.length === WOCHENTAGE_META.length) {
      const { wochentage, ...rest } = s;
      return rest;
    }

    return { ...s, wochentage: next };
  });
}

/**
 * Uhrzeit fuer einen Slot aktualisieren
 */
export function setSlotUhrzeit(plan: EinnahmeSlot[], slot: TageszeitSlot, uhrzeit: string): EinnahmeSlot[] {
  return plan.map(s =>
    s.slot === slot ? { ...s, uhrzeit } : s
  );
}

function normalizeWochentage(value: unknown): Wochentag[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<Wochentag>();
  for (const raw of value) {
    const tag = Number(raw);
    if (Number.isInteger(tag) && tag >= 1 && tag <= 7) {
      unique.add(tag as Wochentag);
    }
  }
  return [...unique].sort((a, b) => a - b);
}

/**
 * Naechsten aktiven Slot basierend auf aktueller Uhrzeit
 */
export function aktuellerSlot(plan: EinnahmeSlot[]): EinnahmeSlot | null {
  if (plan.length === 0) return null;
  const jetzt = new Date();
  const aktuelleMinuten = jetzt.getHours() * 60 + jetzt.getMinutes();

  const sortiert = [...plan].sort((a, b) => {
    const [aH, aM] = a.uhrzeit.split(':').map(Number);
    const [bH, bM] = b.uhrzeit.split(':').map(Number);
    return (aH * 60 + aM) - (bH * 60 + bM);
  });

  // Ersten Slot finden der in der Zukunft liegt
  for (const s of sortiert) {
    const [h, m] = s.uhrzeit.split(':').map(Number);
    if (h * 60 + m > aktuelleMinuten) return s;
  }

  // Alle Slots vorbei – erster Slot von morgen
  return sortiert[0];
}

/**
 * Aktuelle Tageszeit anhand der Uhrzeit bestimmen (fuer UI-Hervorhebung)
 */
export function getAktuelleTageszeit(): TageszeitSlot {
  const stunde = new Date().getHours();
  if (stunde >= 6 && stunde < 11) return 'morgens';
  if (stunde >= 11 && stunde < 15) return 'mittags';
  if (stunde >= 15 && stunde < 21) return 'abends';
  return 'nachts';
}

/**
 * Menschenlesbare Zusammenfassung des Einnahmeplans
 */
export function formatEinnahmeplan(plan: EinnahmeSlot[], standardDosis: number): string {
  if (plan.length === 0) return 'Keine Einnahmezeiten festgelegt';
  return plan
    .sort((a, b) => SLOT_REIHENFOLGE.indexOf(a.slot) - SLOT_REIHENFOLGE.indexOf(b.slot))
    .map(s => {
      const meta = SLOT_META[s.slot];
      const dosisText = s.dosis !== undefined ? ` (${s.dosis})` : '';
      return `${meta.label} ${s.uhrzeit}${dosisText}`;
    })
    .join(', ');
}
