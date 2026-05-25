import {
  MEDICATION_NAME_SUGGESTIONS,
  getMedicationNameSuggestionMetadata,
} from '../constants/MedicationNameSuggestions';
import { normalizePzn } from '../services/BarcodeScannerService';

export interface MedicationNativeScanResult {
  barcode?: string;
  text?: string;
  textLines?: string[];
}

export interface MedicationScanSuggestion {
  scannedPZN?: string;
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
  const scannedPZN = findPzn(result.barcode, lines);
  const suggestedName = findKnownMedicationName(lines) ?? findLikelyMedicationName(lines);
  const metadataIngredient = suggestedName
    ? getMedicationNameSuggestionMetadata(suggestedName)?.activeIngredient
    : undefined;
  const detectedStrength = findStrength(lines);

  return {
    ...(scannedPZN ? { scannedPZN } : {}),
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

function findPzn(barcode: string | undefined, lines: string[]): string | undefined {
  const fromBarcode = normalizePzn(barcode || '');
  if (fromBarcode) return fromBarcode;

  for (const line of lines) {
    const pznMatch = line.match(/(?:PZN\s*-?\s*)?(\d{7,8})/i);
    const normalized = normalizePzn(pznMatch?.[1] || '');
    if (normalized) return normalized;
  }

  return undefined;
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
