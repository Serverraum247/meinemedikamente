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
 */

/** Die vier klassischen Tageszeiten */
export type TageszeitSlot = 'morgens' | 'mittags' | 'abends' | 'nachts';

/** Ein Einnahme-Slot pro Tag */
export interface EinnahmeSlot {
  slot: TageszeitSlot;
  uhrzeit: string;       // HH:MM – Default-Uhrzeit pro Slot
  dosis?: number;        // Optional – abweichende Dosis, Fallback auf einzeldosis
}

/** Metadaten pro Slot für die UI */
export const SLOT_META: Record<TageszeitSlot, { label: string; emoji: string; defaultUhrzeit: string }> = {
  morgens:  { label: 'Morgens',  emoji: '🌅', defaultUhrzeit: '08:00' },
  mittags:  { label: 'Mittags',  emoji: '☀️', defaultUhrzeit: '12:00' },
  abends:   { label: 'Abends',   emoji: '🌆', defaultUhrzeit: '18:00' },
  nachts:   { label: 'Nachts',   emoji: '🌙', defaultUhrzeit: '22:00' },
};

/** Reihenfolge der Slots im UI */
export const SLOT_REIHENFOLGE: TageszeitSlot[] = ['morgens', 'mittags', 'abends', 'nachts'];

/**
 * Einnahmeplan aus JSON-String parsen
 * Unterstützt neues Format (Array von Objects) und altes Format (Array von Strings)
 */
export function parseEinnahmeplan(json: string): EinnahmeSlot[] {
  if (!json || json === '[]') return [];

  try {
    const raw = JSON.parse(json);

    // Altes Format: ["08:00", "20:00"]
    if (raw.length > 0 && typeof raw[0] === 'string') {
      return raw.map((uhrzeit: string) => {
        const slot = uhrzeitZuSlot(uhrzeit);
        return { slot, uhrzeit };
      });
    }

    // Neues Format: [{ slot: "morgens", uhrzeit: "08:00", dosis: 0.5 }]
    return raw.filter((e: any) => e && e.slot);
  } catch {
    return [];
  }
}

/**
 * Einnahmeplan zu JSON-String serialisieren
 */
export function serializeEinnahmeplan(slots: EinnahmeSlot[]): string {
  return JSON.stringify(
    slots.map(s => ({
      slot: s.slot,
      uhrzeit: s.uhrzeit || SLOT_META[s.slot].defaultUhrzeit,
      ...(s.dosis !== undefined ? { dosis: s.dosis } : {}),
    }))
  );
}

/**
 * Slot anhand der Uhrzeit erraten (für Migration)
 */
function uhrzeitZuSlot(uhrzeit: string): TageszeitSlot {
  const h = parseInt(uhrzeit.split(':')[0], 10);
  if (h < 10) return 'morgens';
  if (h < 14) return 'mittags';
  if (h < 20) return 'abends';
  return 'nachts';
}

/**
 * Gesamttagesdosis berechnen (Summe aller Slots)
 * Falls ein Slot keine eigene Dosis hat, Fallback auf einzeldosis
 */
export function tagesdosisBerechnen(plan: EinnahmeSlot[], einzeldosis: number): number {
  const sum = plan.reduce((acc, slot) => {
    return acc + (slot.dosis !== undefined ? slot.dosis : einzeldosis);
  }, 0);
  // Float-Rundung
  return Math.round(sum * 1e10) / 1e10;
}

/**
 * Slot aus dem Plan holen
 */
export function getSlot(plan: EinnahmeSlot[], slot: TageszeitSlot): EinnahmeSlot | undefined {
  return plan.find(s => s.slot === slot);
}

/**
 * Slot hinzufügen oder entfernen (Toggle)
 */
export function toggleSlot(plan: EinnahmeSlot[], slot: TageszeitSlot): EinnahmeSlot[] {
  const existing = plan.findIndex(s => s.slot === slot);
  if (existing >= 0) {
    // Entfernen
    return plan.filter(s => s.slot !== slot);
  }
  // Hinzufügen
  return [...plan, {
    slot,
    uhrzeit: SLOT_META[slot].defaultUhrzeit,
  }];
}

/**
 * Dosis für einen Slot setzen
 */
export function setSlotDosis(plan: EinnahmeSlot[], slot: TageszeitSlot, dosis: number | undefined): EinnahmeSlot[] {
  return plan.map(s => {
    if (s.slot === slot) {
      return { ...s, dosis };
    }
    return s;
  });
}

/**
 * Menschlich-lesbare Zusammenfassung für die UI
 * z.B. "1-0-1-0" oder "Morgens 0.5, Abends 1.0"
 */
export function planZusammenfassung(plan: EinnahmeSlot[], einzeldosis: number): string {
  if (plan.length === 0) return 'Keine Einnahmezeiten';

  if (plan.length === 1) {
    const s = plan[0];
    const d = s.dosis !== undefined ? s.dosis : einzeldosis;
    return `${SLOT_META[s.slot].emoji} ${SLOT_META[s.slot].label}: ${d}`;
  }

  // Kurzform: "🌅 0.5 · 🌆 1.0"
  return plan
    .map(s => {
      const d = s.dosis !== undefined ? s.dosis : einzeldosis;
      return `${SLOT_META[s.slot].emoji} ${d}`;
    })
    .join(' · ');
}

/**
 * Bestimmen, welche Tageszeit aktuell "dran" ist
 * basierend auf der aktuellen Uhrzeit
 */
export function aktuellerSlot(plan: EinnahmeSlot[]): EinnahmeSlot | null {
  if (plan.length === 0) return null;

  const jetzt = new Date();
  const aktuelleStunde = jetzt.getHours() + jetzt.getMinutes() / 60;

  // Slots nach Uhrzeit sortieren
  const sortiert = [...plan].sort((a, b) => {
    const [ah] = a.uhrzeit.split(':').map(Number);
    const [bh] = b.uhrzeit.split(':').map(Number);
    return ah - bh;
  });

  // Nächsten zukünftigen Slot finden
  for (const slot of sortiert) {
    const [h, m] = slot.uhrzeit.split(':').map(Number);
    const slotStunde = h + m / 60;
    if (slotStunde >= aktuelleStunde) {
      return slot;
    }
  }

  // Alle Slots vorbei – erster Slot von morgen
  return sortiert[0];
}

/**
 * Aktuelle Tageszeit anhand der Uhrzeit bestimmen
 * (vereinfacht – für UI-Hervorhebung)
 */
export function getAktuelleTageszeit(): TageszeitSlot {
  const h = new Date().getHours();
  if (h < 10) return 'morgens';
  if (h < 14) return 'mittags';
  if (h < 20) return 'abends';
  return 'nachts';
}
