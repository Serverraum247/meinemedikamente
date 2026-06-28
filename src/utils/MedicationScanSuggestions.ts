import {
  MEDICATION_NAME_SUGGESTIONS,
  getMedicationNameSuggestionMetadata,
} from '../constants/MedicationNameSuggestions';
import { normalizePzn } from '../services/BarcodeScannerService';

export interface MedicationNativeScanResult {
  barcode?: string;
  barcodeFormat?: string;
  barcodes?: Array<{
    value?: string;
    format?: string;
    parsedPzn?: string;
    parsedProductCode?: string;
  }>;
  text?: string;
  textLines?: string[];
  source?: 'live-camera' | 'photo';
}

export interface MedicationScanSuggestion {
  scannedPZN?: string;
  scannedProduktCode?: string;
  scannedCharge?: string;
  scannedSeriennummer?: string;
  scannedVerwendbarBis?: string;
  suggestedPackungsgroesse?: string;
  suggestedName?: string;
  suggestedActiveIngredient?: string;
  suggestedStrengthValue?: string;
  suggestedStrengthUnit?: string;
  rawText: string;
}

const STRENGTH_PATTERN = /(\d+(?:[,.]\d+)?)\s*(mg|µg|mcg|g|ml|IE|I\.E\.)/i;
const COMBINATION_STRENGTH_PATTERN = /(\d+(?:[,.]\d+)?\s*(?:mg|µg|mcg|g|ml|IE|I\.E\.))\s*[+/]\s*(\d+(?:[,.]\d+)?\s*(?:mg|µg|mcg|g|ml|IE|I\.E\.))/i;

export function buildMedicationScanSuggestion(result: MedicationNativeScanResult): MedicationScanSuggestion {
  const lines = normalizeLines(result);
  const rawText = lines.join('\n');
  const barcodes = normalizeBarcodes(result);
  const scannedProduktCode = findProductCode(barcodes, lines);
  const scannedPZN = findPzn(barcodes, lines, scannedProduktCode);
  const scannedCharge = findCharge(barcodes, lines);
  const scannedSeriennummer = findSerialNumber(barcodes, lines);
  const scannedVerwendbarBis = findExpiryDate(barcodes, lines);
  const suggestedPackungsgroesse = findPackageSize(lines);
  const suggestedName = findKnownMedicationName(lines) ?? findLikelyMedicationName(lines);
  const metadataIngredient = suggestedName
    ? getMedicationNameSuggestionMetadata(suggestedName)?.activeIngredient
    : undefined;
  const detectedStrength = findStrength(lines);

  return {
    ...(scannedPZN ? { scannedPZN } : {}),
    ...(scannedProduktCode ? { scannedProduktCode } : {}),
    ...(scannedCharge ? { scannedCharge } : {}),
    ...(scannedSeriennummer ? { scannedSeriennummer } : {}),
    ...(scannedVerwendbarBis ? { scannedVerwendbarBis } : {}),
    ...(suggestedPackungsgroesse ? { suggestedPackungsgroesse } : {}),
    ...(suggestedName ? { suggestedName } : {}),
    ...(metadataIngredient ? { suggestedActiveIngredient: metadataIngredient } : {}),
    ...(!isCombinationIngredient(metadataIngredient) && detectedStrength
      ? {
          suggestedStrengthValue: detectedStrength.value,
          suggestedStrengthUnit: detectedStrength.unit,
        }
      : {}),
    rawText,
  };
}

function normalizeBarcodes(result: MedicationNativeScanResult): Array<{ value: string; format: string }> {
  const values = [
    ...(result.barcode ? [{ value: result.barcode, format: result.barcodeFormat || 'unknown' }] : []),
    ...(result.barcodes ?? []).map(barcode => ({
      value: barcode.value || barcode.parsedProductCode || barcode.parsedPzn || '',
      format: barcode.format || 'unknown',
    })),
  ];
  const seen = new Set<string>();
  return values
    .map(barcode => ({
      value: barcode.value.trim(),
      format: barcode.format.toLowerCase(),
    }))
    .filter(barcode => {
      if (!barcode.value || seen.has(barcode.value)) return false;
      seen.add(barcode.value);
      return true;
    });
}

function normalizeLines(result: MedicationNativeScanResult): string[] {
  const source = [
    ...(result.textLines ?? []),
    ...(result.text ? result.text.split(/\r?\n/) : []),
  ];
  const seen = new Set<string>();

  return source
    .flatMap(line => line.split(/\s{2,}/))
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter(line => {
      const key = normalizeForMatch(line);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function findPzn(
  barcodes: Array<{ value: string; format: string }>,
  lines: string[],
  productCode?: string,
): string | undefined {
  for (const barcode of barcodes) {
    const fromBarcode = normalizePzn(barcode.value);
    if (fromBarcode) return fromBarcode;
    const fromProductCode = extractPznFromProductCode(findProductCode([barcode], []));
    if (fromProductCode) return fromProductCode;
  }

  const fromProductCode = extractPznFromProductCode(productCode);
  if (fromProductCode) return fromProductCode;

  for (const line of lines) {
    const pznMatch = line.match(/(?:PZN\s*-?\s*)?(\d{7,8})/i);
    const normalized = normalizePzn(pznMatch?.[1] || '');
    if (normalized) return normalized;
  }

  return undefined;
}

function findProductCode(barcodes: Array<{ value: string; format: string }>, lines: string[]): string | undefined {
  for (const barcode of barcodes) {
    const fromBarcode = extractGs1Value(barcode.value, '01') ?? barcode.value.match(/\b(0\d{13})\b/)?.[1];
    if (fromBarcode) return fromBarcode;
  }

  for (const line of lines) {
    const match = line.match(/\b(?:PC[:\s-]*)?(\d{14})\b/i);
    if (match) return match[1];
  }

  return undefined;
}

function extractPznFromProductCode(productCode: string | undefined): string | undefined {
  if (!productCode || !/^04150\d{8}\d$/.test(productCode)) return undefined;
  return normalizePzn(productCode.substring(5, 13)) || undefined;
}

function findCharge(barcodes: Array<{ value: string; format: string }>, lines: string[]): string | undefined {
  for (const barcode of barcodes) {
    const gs1Charge = extractGs1Value(barcode.value, '10');
    if (gs1Charge) return sanitizeToken(gs1Charge);
  }

  for (const line of lines) {
    const match = line.match(/\b(?:Ch[\s.-]*B(?:\.|:)?|Charge|LOT|Batch)\s*[:.-]?\s*([A-Z0-9-]{3,})\b/i);
    if (match) return sanitizeToken(match[1]);
  }

  return undefined;
}

function findSerialNumber(barcodes: Array<{ value: string; format: string }>, lines: string[]): string | undefined {
  for (const barcode of barcodes) {
    const gs1Serial = extractGs1Value(barcode.value, '21');
    if (gs1Serial) return sanitizeToken(gs1Serial);
  }

  for (const line of lines) {
    const match = line.match(/\b(?:SN|S\/N|Seriennummer)\s*[:.-]?\s*([A-Z0-9-]{5,})\b/i);
    if (match) return sanitizeToken(match[1]);
  }

  return undefined;
}

function findExpiryDate(barcodes: Array<{ value: string; format: string }>, lines: string[]): string | undefined {
  for (const barcode of barcodes) {
    const gs1Expiry = extractGs1Value(barcode.value, '17');
    const normalized = normalizeExpiryDate(gs1Expiry);
    if (normalized) return normalized;
  }

  const text = lines.join(' ');
  const numeric = text.match(/\b(?:verwendbar\s+bis|verw\.?\s*bis|EXP)\s*[:.-]?\s*(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/i);
  if (numeric) {
    return formatDate(normalizeYear(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  }

  const labelled = text.match(/\b(?:verwendbar\s+bis|verw\.?\s*bis|haltbar\s+bis|EXP)\s*[:.-]?\s*(\d{1,2})[./-](\d{2,4})\b/i);
  if (labelled) {
    return lastDayOfMonth(Number(labelled[1]), normalizeYear(labelled[2]));
  }

  return undefined;
}

function findPackageSize(lines: string[]): string | undefined {
  const text = lines.join(' ');
  const match = text.match(/\b(?:N\d\s*)?(\d{1,4})\s*(?:Filmtabletten|Tabletten|Kapseln|St(?:\.|ück)?)\b/i);
  return match?.[1];
}

function extractGs1Value(raw: string, ai: '01' | '10' | '17' | '21'): string | undefined {
  return parseGs1Values(raw)[ai];
}

function parseGs1Values(raw: string): Partial<Record<'01' | '10' | '17' | '21', string>> {
  const value = raw.replace(/\u001d/g, '|').replace(/[()]/g, '');
  const result: Partial<Record<'01' | '10' | '17' | '21', string>> = {};
  let index = 0;

  while (index < value.length) {
    if (value[index] === '|') {
      index += 1;
      continue;
    }

    const ai = value.slice(index, index + 2) as '01' | '10' | '17' | '21';
    if (!['01', '10', '17', '21'].includes(ai)) {
      index += 1;
      continue;
    }
    index += 2;

    if (ai === '01') {
      const candidate = value.slice(index, index + 14);
      if (/^\d{14}$/.test(candidate)) result[ai] = candidate;
      index += 14;
      continue;
    }
    if (ai === '17') {
      const candidate = value.slice(index, index + 6);
      if (/^\d{6}$/.test(candidate)) result[ai] = candidate;
      index += 6;
      continue;
    }

    const end = findNextVariableAiBoundary(value, index, ai);
    result[ai] = value.slice(index, end).replace(/\|/g, '');
    index = end;
  }

  return result;
}

function findNextVariableAiBoundary(value: string, start: number, currentAi: '10' | '21'): number {
  for (let i = start; i < value.length; i++) {
    if (value[i] === '|') return i;
    if (/01\d{14}/.test(value.slice(i, i + 16))) return i;
    if (/17\d{6}/.test(value.slice(i, i + 8))) return i;
    if (currentAi === '10' && value.slice(i, i + 2) === '21') return i;
  }
  return value.length;
}

function normalizeExpiryDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^\d{6}$/.test(value)) {
    return formatDate(normalizeYear(value.slice(0, 2)), Number(value.slice(2, 4)), Number(value.slice(4, 6)) || 1);
  }
  return undefined;
}

function normalizeYear(value: string): number {
  const year = Number(value);
  return value.length === 2 ? 2000 + year : year;
}

function lastDayOfMonth(month: number, year: number): string | undefined {
  if (month < 1 || month > 12 || year < 2000 || year > 2099) return undefined;
  return formatDate(year, month + 1, 0);
}

function formatDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

function sanitizeToken(value: string): string {
  return value.replace(/[^A-Z0-9-]/gi, '').toUpperCase();
}

function findKnownMedicationName(lines: string[]): string | undefined {
  const text = normalizeForMatch(lines.join(' '));
  return [...MEDICATION_NAME_SUGGESTIONS]
    .sort((a, b) => b.length - a.length)
    .find(name => text.includes(normalizeForMatch(name)));
}

function findLikelyMedicationName(lines: string[]): string | undefined {
  const candidate = lines.find(line => {
    const normalized = normalizeForMatch(line);
    return (
      /[a-zäöüß]/i.test(line) &&
      normalized.length >= 4 &&
      !/^(ch|verw|verwendbar|tabletten|filmtabletten|wirkstoff|pzn|pharma|mg|ml|comp)$/i.test(normalized) &&
      !/^\d/.test(normalized) &&
      !line.includes('@')
    );
  });

  return candidate?.replace(STRENGTH_PATTERN, '').replace(/\bTabletten\b/i, '').trim();
}

function findStrength(lines: string[]): { value: string; unit: string } | undefined {
  const combined = lines.join(' ');
  if (COMBINATION_STRENGTH_PATTERN.test(combined)) return undefined;

  const match = combined.match(STRENGTH_PATTERN);
  if (!match) return undefined;

  return {
    value: match[1].replace(',', '.'),
    unit: normalizeStrengthUnit(match[2]),
  };
}

function normalizeStrengthUnit(unit: string): string {
  if (/^mcg$/i.test(unit)) return 'µg';
  if (/^i\.e\.$/i.test(unit)) return 'IE';
  return unit;
}

function isCombinationIngredient(value: string | undefined): boolean {
  return Boolean(value && (value.includes('+') || value.includes('/')));
}

function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9äöüß]+/gi, ' ')
    .trim()
    .toLowerCase();
}
