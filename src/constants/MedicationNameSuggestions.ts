const PERSONAL_MEDICATION_NAME_SUGGESTIONS = [
  'Candecor comp.',
  'Lercanidipin-Omniapharm',
] as const;

const WIDO_TOP_100_BY_PRESCRIPTIONS_2024 = [
  'Ibuflam/- Lysin',
  'Novaminsulfon Lichtenstein',
  'RamiLich',
  'Metamizol Zentiva',
  'L-Thyroxin Henning',
  'Panto/Pantoprazol Aristo',
  'Novaminsulfon-1 A Pharma',
  'Biso Lich',
  'Torasemid AL',
  'Pantoprazol BASICS',
  'Ramipril-1 A Pharma',
  'Eliquis',
  'L-Thyrox HEXAL',
  'Lercanidipin Omniapharm',
  'Candesartan Zentiva',
  'MetoHEXAL/MetoHEXAL succ',
  'Ibu-1 A Pharma',
  'Metformin Lich',
  'Amlodipin besilat AbZ',
  'BisoHEXAL',
  'Amlodipin Dexcel',
  'Bisoprolol-1 A Pharma',
  'Jardiance',
  'Candecor',
  'Atorvastatin-ratiopharm',
  'Amlodipin HEXAL',
  'Forxiga',
  'Foster',
  'Prednisolon Galen',
  'Ramipril AbZ',
  'Salbutamol-ratiopharm',
  'Rosuvastatin AXiromed',
  'Amoxi-1 A Pharma',
  'Metoprolol/-succ-ratiopharm',
  'Torasemid-1 A Pharma',
  'Metformin-1 A Pharma',
  'Euthyrox',
  'Tilidin AL comp',
  'Torasemid HEXAL',
  'Allopurinol Indoco',
  'Atorvastatin AXiromed',
  'Amlodipin-1 A Pharma',
  'Xarelto',
  'Olynth',
  'Tilidin comp STADA',
  'Candesartan-1 A Pharma',
  'Pantoprazol Aurobindo',
  'Metoprolol/-succ-1 A Pharma',
  'Metodura/Metoprololsucc.dura',
  'Candesartan Heumann',
  'Novaminsulfon-ratiopharm',
  'Azithromycin-1 A Pharma',
  'Spironolacton Accord',
  'Bisoprolol Accord/Healthcare',
  'Ibuprofen AbZ',
  'Simva BASICS',
  'Lixiana',
  'Simva Aristo',
  'Dekristol',
  'SalbuHEXAL',
  'Tamsulosin Zentiva',
  'Candaxiro',
  'Thyronajod Henning',
  'Enalapril AL',
  'Oekolp Vaginal',
  'Amoxicillin Micro Labs',
  'Prednisolon acis',
  'Pantoprazol-PUREN/-protect',
  'L-Thyroxin-1 A Pharma',
  'Atorvastatin AbZ',
  'Tamsulosin BASICS',
  'Entresto',
  'RamiLich comp',
  'Gabapentin Micro Labs',
  'Atorvastatin BASICS',
  'Nebivolol Glenmark',
  'Bisoprolol-ratiopharm',
  'Opipram',
  'Capval',
  'Candesartan AL',
  'SimvaHEXAL',
  'HCT Dexcel',
  'Diclofenac Natrium Micro Lab',
  'Advantan',
  'ASS 100/-protect-1 A Pharma',
  'Simvastatin-1 A Pharma',
  'Ofloxacin-ophtal',
  'Sertralin BASICS',
  'Moxonidin STADA',
  'Pregabalin beta',
  'MometaHEXAL',
  'Ferro sanol/duodenal',
  'Hygroton',
  'Novorapid',
  'Venlafaxin Heumann',
  'Sultanol',
  'Candecor comp',
  'Levodopa/Benserazid Devatis',
  'Ozempic',
  'Etoricoxib Micro Labs',
] as const;

const MEDICATION_NAME_METADATA: Record<string, { activeIngredient: string }> = {
  'Ibuflam/- Lysin': { activeIngredient: 'Ibuprofen' },
  'Novaminsulfon Lichtenstein': { activeIngredient: 'Metamizol' },
  RamiLich: { activeIngredient: 'Ramipril' },
  'Metamizol Zentiva': { activeIngredient: 'Metamizol' },
  'L-Thyroxin Henning': { activeIngredient: 'Levothyroxin' },
  'Panto/Pantoprazol Aristo': { activeIngredient: 'Pantoprazol' },
  'Novaminsulfon-1 A Pharma': { activeIngredient: 'Metamizol' },
  'Biso Lich': { activeIngredient: 'Bisoprolol' },
  'Torasemid AL': { activeIngredient: 'Torasemid' },
  'Pantoprazol BASICS': { activeIngredient: 'Pantoprazol' },
  'Ramipril-1 A Pharma': { activeIngredient: 'Ramipril' },
  Eliquis: { activeIngredient: 'Apixaban' },
  'L-Thyrox HEXAL': { activeIngredient: 'Levothyroxin' },
  'Lercanidipin Omniapharm': { activeIngredient: 'Lercanidipin' },
  'Lercanidipin-Omniapharm': { activeIngredient: 'Lercanidipin' },
  'Candesartan Zentiva': { activeIngredient: 'Candesartan' },
  'MetoHEXAL/MetoHEXAL succ': { activeIngredient: 'Metoprolol' },
  'Ibu-1 A Pharma': { activeIngredient: 'Ibuprofen' },
  'Metformin Lich': { activeIngredient: 'Metformin' },
  'Amlodipin besilat AbZ': { activeIngredient: 'Amlodipin' },
  BisoHEXAL: { activeIngredient: 'Bisoprolol' },
  'Amlodipin Dexcel': { activeIngredient: 'Amlodipin' },
  'Bisoprolol-1 A Pharma': { activeIngredient: 'Bisoprolol' },
  Jardiance: { activeIngredient: 'Empagliflozin' },
  Candecor: { activeIngredient: 'Candesartan' },
  'Atorvastatin-ratiopharm': { activeIngredient: 'Atorvastatin' },
  'Amlodipin HEXAL': { activeIngredient: 'Amlodipin' },
  Forxiga: { activeIngredient: 'Dapagliflozin' },
  Foster: { activeIngredient: 'Beclometason/Formoterol' },
  'Prednisolon Galen': { activeIngredient: 'Prednisolon' },
  'Ramipril AbZ': { activeIngredient: 'Ramipril' },
  'Salbutamol-ratiopharm': { activeIngredient: 'Salbutamol' },
  'Rosuvastatin AXiromed': { activeIngredient: 'Rosuvastatin' },
  'Amoxi-1 A Pharma': { activeIngredient: 'Amoxicillin' },
  'Metoprolol/-succ-ratiopharm': { activeIngredient: 'Metoprolol' },
  'Torasemid-1 A Pharma': { activeIngredient: 'Torasemid' },
  'Metformin-1 A Pharma': { activeIngredient: 'Metformin' },
  Euthyrox: { activeIngredient: 'Levothyroxin' },
  'Tilidin AL comp': { activeIngredient: 'Tilidin/Naloxon' },
  'Torasemid HEXAL': { activeIngredient: 'Torasemid' },
  'Allopurinol Indoco': { activeIngredient: 'Allopurinol' },
  'Atorvastatin AXiromed': { activeIngredient: 'Atorvastatin' },
  'Amlodipin-1 A Pharma': { activeIngredient: 'Amlodipin' },
  Xarelto: { activeIngredient: 'Rivaroxaban' },
  Olynth: { activeIngredient: 'Xylometazolin' },
  'Tilidin comp STADA': { activeIngredient: 'Tilidin/Naloxon' },
  'Candesartan-1 A Pharma': { activeIngredient: 'Candesartan' },
  'Pantoprazol Aurobindo': { activeIngredient: 'Pantoprazol' },
  'Metoprolol/-succ-1 A Pharma': { activeIngredient: 'Metoprolol' },
  'Metodura/Metoprololsucc.dura': { activeIngredient: 'Metoprolol' },
  'Candesartan Heumann': { activeIngredient: 'Candesartan' },
  'Novaminsulfon-ratiopharm': { activeIngredient: 'Metamizol' },
  'Azithromycin-1 A Pharma': { activeIngredient: 'Azithromycin' },
  'Spironolacton Accord': { activeIngredient: 'Spironolacton' },
  'Bisoprolol Accord/Healthcare': { activeIngredient: 'Bisoprolol' },
  'Ibuprofen AbZ': { activeIngredient: 'Ibuprofen' },
  'Simva BASICS': { activeIngredient: 'Simvastatin' },
  Lixiana: { activeIngredient: 'Edoxaban' },
  'Simva Aristo': { activeIngredient: 'Simvastatin' },
  Dekristol: { activeIngredient: 'Colecalciferol' },
  SalbuHEXAL: { activeIngredient: 'Salbutamol' },
  'Tamsulosin Zentiva': { activeIngredient: 'Tamsulosin' },
  Candaxiro: { activeIngredient: 'Candesartan' },
  'Thyronajod Henning': { activeIngredient: 'Levothyroxin/Kaliumiodid' },
  'Enalapril AL': { activeIngredient: 'Enalapril' },
  'Oekolp Vaginal': { activeIngredient: 'Estriol' },
  'Amoxicillin Micro Labs': { activeIngredient: 'Amoxicillin' },
  'Prednisolon acis': { activeIngredient: 'Prednisolon' },
  'Pantoprazol-PUREN/-protect': { activeIngredient: 'Pantoprazol' },
  'L-Thyroxin-1 A Pharma': { activeIngredient: 'Levothyroxin' },
  'Atorvastatin AbZ': { activeIngredient: 'Atorvastatin' },
  'Tamsulosin BASICS': { activeIngredient: 'Tamsulosin' },
  Entresto: { activeIngredient: 'Sacubitril/Valsartan' },
  'RamiLich comp': { activeIngredient: 'Ramipril/Hydrochlorothiazid' },
  'Gabapentin Micro Labs': { activeIngredient: 'Gabapentin' },
  'Atorvastatin BASICS': { activeIngredient: 'Atorvastatin' },
  'Nebivolol Glenmark': { activeIngredient: 'Nebivolol' },
  'Bisoprolol-ratiopharm': { activeIngredient: 'Bisoprolol' },
  Opipram: { activeIngredient: 'Opipramol' },
  Capval: { activeIngredient: 'Noscapin' },
  'Candesartan AL': { activeIngredient: 'Candesartan' },
  SimvaHEXAL: { activeIngredient: 'Simvastatin' },
  'HCT Dexcel': { activeIngredient: 'Hydrochlorothiazid' },
  'Diclofenac Natrium Micro Lab': { activeIngredient: 'Diclofenac' },
  Advantan: { activeIngredient: 'Methylprednisolonaceponat' },
  'ASS 100/-protect-1 A Pharma': { activeIngredient: 'Acetylsalicylsäure' },
  'Simvastatin-1 A Pharma': { activeIngredient: 'Simvastatin' },
  'Ofloxacin-ophtal': { activeIngredient: 'Ofloxacin' },
  'Sertralin BASICS': { activeIngredient: 'Sertralin' },
  'Moxonidin STADA': { activeIngredient: 'Moxonidin' },
  'Pregabalin beta': { activeIngredient: 'Pregabalin' },
  MometaHEXAL: { activeIngredient: 'Mometason' },
  'Ferro sanol/duodenal': { activeIngredient: 'Eisen' },
  Hygroton: { activeIngredient: 'Chlortalidon' },
  Novorapid: { activeIngredient: 'Insulin aspart' },
  'Venlafaxin Heumann': { activeIngredient: 'Venlafaxin' },
  Sultanol: { activeIngredient: 'Salbutamol' },
  'Candecor comp': { activeIngredient: 'Candesartan 16 mg + Hydrochlorothiazid 12,5 mg' },
  'Candecor comp.': { activeIngredient: 'Candesartan 16 mg + Hydrochlorothiazid 12,5 mg' },
  'Levodopa/Benserazid Devatis': { activeIngredient: 'Levodopa/Benserazid' },
  Ozempic: { activeIngredient: 'Semaglutid' },
  'Etoricoxib Micro Labs': { activeIngredient: 'Etoricoxib' },
};

export const MEDICATION_NAME_SUGGESTIONS = [
  ...PERSONAL_MEDICATION_NAME_SUGGESTIONS,
  ...WIDO_TOP_100_BY_PRESCRIPTIONS_2024,
] as const;

export function getMedicationNameSuggestions(input: string, limit = 5): string[] {
  const query = normalizeMedicationName(input.trim());
  if (query.length < 2) {
    return [];
  }

  const exactQuery = normalizeMedicationName(input);

  return MEDICATION_NAME_SUGGESTIONS.filter((suggestion) => {
    const normalized = normalizeMedicationName(suggestion);
    const activeIngredient = getMedicationNameSuggestionMetadata(suggestion)?.activeIngredient ?? '';
    const normalizedActiveIngredient = normalizeMedicationName(activeIngredient);
    return (
      normalized !== exactQuery &&
      (startsWithWord(normalized, query) || startsWithWord(normalizedActiveIngredient, query))
    );
  }).slice(0, limit);
}

export function getMedicationNameSuggestionMetadata(name: string): { activeIngredient: string } | undefined {
  const normalizedName = normalizeMedicationName(name);
  const match = Object.entries(MEDICATION_NAME_METADATA).find(
    ([medicationName]) => normalizeMedicationName(medicationName) === normalizedName,
  );
  return match?.[1];
}

export function formatMedicationNameSuggestion(name: string): string {
  const activeIngredient = getMedicationNameSuggestionMetadata(name)?.activeIngredient;
  return activeIngredient ? `${name} - ${activeIngredient}` : name;
}

function startsWithWord(value: string, query: string): boolean {
  return value
    .split(/[\s/.-]+/)
    .some((part) => part.startsWith(query)) || value.startsWith(query);
}

function normalizeMedicationName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
