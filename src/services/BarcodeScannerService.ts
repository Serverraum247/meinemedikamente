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
  format: string;
  /**
   * Versucht, eine PZN aus dem Barcode zu extrahieren.
   * PZN-Codierung: PZN + 7-8 Ziffern + Pruefziffer
   */
  isPZN: boolean;
}

/**
 * Prueft, ob ein Barcode eine gueltige PZN sein koennte.
 *
 * PZN-Format: PZN gefolgt von 7-8 Ziffern
 * EAN-13: 13 Ziffern, oft mit Präfix für Deutschland (400-440)
 */
export function parseScanResult(barcodeValue: string, format: string): ScanResult {
  const cleaned = barcodeValue.trim();
  const isPZN = /^PZN\d{7,8}$/.test(cleaned) || /^\d{8}$/.test(cleaned);

  return {
    barcode: cleaned,
    format,
    isPZN,
  };
}

/**
 * PZN validieren: 7-8 Ziffern + Pruefziffer
 * Die letzte Ziffer ist die Pruefziffer (Modulo 11).
 */
export function validatePZN(pzn: string): boolean {
  const digits = pzn.replace(/^PZN/, '');
  if (!/^\d{7,8}$/.test(digits)) return false;

  const numbers = digits.split('').map(Number);
  const checkDigit = numbers.pop();
  if (checkDigit === undefined) return false;

  // Modulo 11 Pruefziffer-Berechnung
  let sum = 0;
  for (let i = 0; i < numbers.length; i++) {
    sum += numbers[i] * (i + 2);
  }
  const calculated = sum % 11;

  return calculated === checkDigit;
}
