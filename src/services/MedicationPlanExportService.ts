import type { ArztRow, MedikamentRow, PersonRow } from '../database/Database';
import {
  parseEinnahmeplan,
  SLOT_META,
  SLOT_REIHENFOLGE,
  WOCHENTAGE_META,
  type EinnahmeSlot,
} from '../utils/Einnahmeplan';
import { formatStaerke } from '../utils/ReichweitenCalc';
import { formatActiveIngredient, parseActiveIngredients } from '../utils/ActiveIngredients';

export interface MedicationPlanExportInput {
  person: PersonRow;
  medications: MedikamentRow[];
  doctors: ArztRow[];
  generatedAt?: Date;
}

export interface MedicationPlanExport {
  title: string;
  fileName: string;
  text: string;
}

const DISCLAIMER =
  'Dieser Plan ersetzt keine ärztliche oder pharmazeutische Beratung. ' +
  'Bitte prüfen Sie Einnahme, Dosierung und Änderungen immer mit Arzt oder Apotheke. ' +
  'Für die richtige Einnahme der Medikamente ist der Nutzer selbst verantwortlich.';

export function buildMedicationPlanExport(input: MedicationPlanExportInput): MedicationPlanExport {
  const generatedAt = input.generatedAt ?? new Date();
  const selectedMedications = input.medications
    .filter(medication => medication.person_id === input.person.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'de-DE'));
  const doctorById = new Map(input.doctors.map(doctor => [doctor.id, doctor]));

  const title = 'Mein MediPlan';
  const lines: string[] = [
    `Medikamentenplan für ${input.person.name}`,
    `Erstellt am ${formatDateTime(generatedAt)}`,
    '',
  ];

  if (selectedMedications.length === 0) {
    lines.push('Für diese Person sind noch keine Medikamente erfasst.', '');
  } else {
    selectedMedications.forEach((medication, index) => {
      lines.push(`${index + 1}. ${medication.name}`);

      const zusatz = medication.zusatz.trim();
      if (zusatz) {
        const activeIngredients = parseActiveIngredients(zusatz);
        if (activeIngredients.length > 1) {
          lines.push('   Wirkstoffe:');
          activeIngredients.forEach(ingredient => {
            lines.push(`   - ${formatActiveIngredient(ingredient)}`);
          });
        } else {
          lines.push(`   Wirkstoff: ${zusatz}`);
        }
      }

      const staerke = formatStaerke(medication.staerke_wert, medication.staerke_einheit);
      if (staerke) lines.push(`   Stärke: ${staerke}`);

      lines.push(`   Dosis: ${formatNumber(medication.einzeldosis)} ${medication.einheit}`);
      lines.push(...formatEinnahmeplan(medication));

      const pzn = medication.pzn.trim();
      if (pzn) lines.push(`   PZN: ${pzn}`);

      const doctor = doctorById.get(medication.arzt_id);
      if (doctor) lines.push(`   Arzt: ${formatDoctor(doctor)}`);

      lines.push('');
    });
  }

  lines.push('Hinweis');
  lines.push(DISCLAIMER);

  return {
    title,
    fileName: buildMedicationPlanFileName(input.person.name, generatedAt),
    text: lines.join('\n').trim(),
  };
}

function formatEinnahmeplan(medication: MedikamentRow): string[] {
  const plan = parseEinnahmeplan(medication.einnahme_uhrzeiten);
  if (plan.length === 0) {
    return ['   Einnahme: Nach Bedarf oder nicht hinterlegt'];
  }

  return sortSlots(plan).map(slot => {
    const label = SLOT_META[slot.slot]?.label ?? 'Einnahme';
    const dosis = slot.dosis ?? medication.einzeldosis;
    const days = formatWochentage(slot);
    return `   ${label} ${slot.uhrzeit} Uhr: ${formatNumber(dosis)} ${medication.einheit} (${days})`;
  });
}

function sortSlots(plan: EinnahmeSlot[]): EinnahmeSlot[] {
  return [...plan].sort((a, b) => {
    const slotA = SLOT_REIHENFOLGE.indexOf(a.slot);
    const slotB = SLOT_REIHENFOLGE.indexOf(b.slot);
    if (slotA !== slotB) return slotA - slotB;
    return a.uhrzeit.localeCompare(b.uhrzeit);
  });
}

function formatWochentage(slot: EinnahmeSlot): string {
  if (!slot.wochentage || slot.wochentage.length === 0) return 'täglich';
  return slot.wochentage
    .map(day => WOCHENTAGE_META.find(meta => meta.value === day)?.label)
    .filter(Boolean)
    .join(', ');
}

function formatDoctor(doctor: ArztRow): string {
  return [
    doctor.name.trim(),
    doctor.fachgebiet.trim(),
    doctor.telefon.trim() ? `Tel. ${doctor.telefon.trim()}` : '',
    doctor.email.trim() ? `E-Mail ${doctor.email.trim()}` : '',
  ].filter(Boolean).join(', ');
}

function formatDateTime(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year}, ${hours}:${minutes} Uhr`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
}

function buildMedicationPlanFileName(personName: string, date: Date): string {
  return `Medikamentenplan ${sanitizeReadableFileName(personName)} ${formatDateOnly(date)}.pdf`;
}

function formatDateOnly(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function sanitizeReadableFileName(value: string): string {
  return value
    .replace(/ß/g, 'ss')
    .replace(/ẞ/g, 'SS')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
