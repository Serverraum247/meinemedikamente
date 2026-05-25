import {
  istSlotAnDatumAktiv,
  SLOT_REIHENFOLGE,
  type EinnahmeSlot,
  type TageszeitSlot,
} from './Einnahmeplan';

interface FindBestaetigbarenSlotHeuteArgs {
  plan: EinnahmeSlot[];
  eingenommeneSlots: Set<TageszeitSlot>;
  jetzt?: Date;
  frueheEinnahmeErlaubt: boolean;
}

export function findBestaetigbarenSlotHeute({
  plan,
  eingenommeneSlots,
  jetzt = new Date(),
  frueheEinnahmeErlaubt,
}: FindBestaetigbarenSlotHeuteArgs): EinnahmeSlot | null {
  const aktiveOffeneSlots = plan
    .filter(slot => istSlotAnDatumAktiv(slot, jetzt))
    .filter(slot => !eingenommeneSlots.has(slot.slot))
    .sort((a, b) => SLOT_REIHENFOLGE.indexOf(a.slot) - SLOT_REIHENFOLGE.indexOf(b.slot));

  if (aktiveOffeneSlots.length === 0) return null;

  const aktuelleMinuten = jetzt.getHours() * 60 + jetzt.getMinutes();
  const faelligerSlot = aktiveOffeneSlots.find(slot => {
    const slotMinuten = parseUhrzeitInMinuten(slot.uhrzeit);
    return slotMinuten !== null && slotMinuten <= aktuelleMinuten;
  });

  if (faelligerSlot) return faelligerSlot;
  if (!frueheEinnahmeErlaubt) return null;

  return aktiveOffeneSlots[0];
}

export function istFrueheEinnahmeErlaubt(value: number | null | undefined): boolean {
  return value !== 0;
}

export function parseUhrzeitInMinuten(uhrzeit: string): number | null {
  const [stundenText, minutenText] = uhrzeit.split(':');
  const stunden = Number(stundenText);
  const minuten = Number(minutenText);
  if (!Number.isFinite(stunden) || !Number.isFinite(minuten)) return null;
  if (stunden < 0 || stunden > 23 || minuten < 0 || minuten > 59) return null;
  return stunden * 60 + minuten;
}
