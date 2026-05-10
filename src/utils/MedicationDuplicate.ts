export type DuplicateMedicationReason = 'name' | 'activeIngredient' | 'pzn';

export interface DuplicateMedicationCandidate {
  id?: string;
  name: string;
  zusatz: string;
  person_id: string;
  pzn: string;
}

export interface DuplicateMedicationMatch<T extends DuplicateMedicationCandidate> {
  medication: T;
  reason: DuplicateMedicationReason;
}

export function findPotentialDuplicateMedication<T extends DuplicateMedicationCandidate>(
  existingMedications: T[],
  candidate: DuplicateMedicationCandidate,
): DuplicateMedicationMatch<T> | undefined {
  const candidateName = normalizeComparableMedicationText(candidate.name);
  const candidateActiveIngredient = normalizeComparableMedicationText(candidate.zusatz);
  const candidatePzn = candidate.pzn.trim();

  for (const medication of existingMedications) {
    if (candidate.id && medication.id === candidate.id) {
      continue;
    }
    if (medication.person_id !== candidate.person_id) {
      continue;
    }

    if (
      candidatePzn &&
      medication.pzn.trim() &&
      medication.pzn.trim() === candidatePzn
    ) {
      return { medication, reason: 'pzn' };
    }

    if (
      candidateName &&
      normalizeComparableMedicationText(medication.name) === candidateName
    ) {
      return { medication, reason: 'name' };
    }

    if (
      candidateActiveIngredient &&
      normalizeComparableMedicationText(medication.zusatz) === candidateActiveIngredient
    ) {
      return { medication, reason: 'activeIngredient' };
    }
  }

  return undefined;
}

function normalizeComparableMedicationText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
