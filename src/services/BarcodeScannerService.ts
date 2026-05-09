/**
 * BarcodeScannerService.ts – Barcode/PZN-Scanner
 *
 * Scannet EAN-13, Code128, QR-Codes und andere Formate.
 * Wird von BarcodeScannerScreen aufgerufen.
 */

/**
 * Unterstützte Barcode-Formate für PZN/Medikamenten-Scanning
 */
export const BARCODE_TYPES = {
  PZN_EAN13: 'EAN_13',
  CODE128: 'CODE_128',
  QR: 'QR_CODE',
};

export interface ScanResult {
  barcode: string;
  pzn: string | null;
  format: string;
  /**
   * Versucht, eine PZN aus dem Barcode zu extrahieren.
 * PZN-Codierung: PZN + 7-8 Ziffern + Prüfziffer
   */
  isPZN: boolean;
}

/**
 * Normalisiert Scanner-Ausgaben wie "PZN - 00078597" oder "-00078597".
 */
export function normalizePzn(rawValue: string): string | null {
  const cleaned = rawValue
    .trim()
    .toUpperCase()
    .replace(/^PZN\s*-?\s*/, '')
    .replace(/^-/, '')
    .replace(/\s+/g, '');

  if (!/^\d{7,8}$/.test(cleaned)) return null;
  return cleaned.padStart(8, '0');
}

/**
 * Prüft, ob ein Barcode eine gültige PZN sein könnte.
 *
 * PZN-Format: PZN gefolgt von 7-8 Ziffern
 * EAN-13: 13 Ziffern, oft mit Präfix für Deutschland (400-440)
 */
export function parseScanResult(barcodeValue: string, format: string): ScanResult {
  const cleaned = barcodeValue.trim();
  const pzn = normalizePzn(cleaned);

  return {
    barcode: cleaned,
    pzn,
    format,
    isPZN: pzn !== null,
  };
}

/**
 * PZN validieren: 7-8 Ziffern + Prüfziffer
 * Die letzte Ziffer ist die Prüfziffer (Modulo 11).
 */
export function validatePZN(pzn: string): boolean {
  const digits = normalizePzn(pzn);
  if (!digits) return false;

  const numbers = digits.split('').map(Number);
  const checkDigit = numbers.pop();
  if (checkDigit === undefined) return false;

  // PZN8: Die ersten sieben Ziffern werden mit 1 bis 7 gewichtet, dann Modulo 11.
  let sum = 0;
  for (let i = 0; i < numbers.length; i++) {
    sum += numbers[i] * (i + 1);
  }
  const calculated = sum % 11;

  if (calculated === 10) return false;
  return calculated === checkDigit;
}
