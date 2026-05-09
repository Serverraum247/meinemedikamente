import {
  normalizePzn,
  parseScanResult,
  validatePZN,
} from '../services/BarcodeScannerService';

describe('BarcodeScannerService', () => {
  it('normalizes common PZN barcode scanner outputs', () => {
    expect(normalizePzn('00078597')).toBe('00078597');
    expect(normalizePzn('PZN - 00078597')).toBe('00078597');
    expect(normalizePzn('-00078597')).toBe('00078597');
    expect(normalizePzn('78597')).toBeNull();
    expect(normalizePzn('4001234567890')).toBeNull();
  });

  it('validates PZN8 check digits with modulo 11 weighting 1 to 7', () => {
    expect(validatePZN('00078597')).toBe(true);
    expect(validatePZN('PZN - 00078597')).toBe(true);
    expect(validatePZN('00078598')).toBe(false);
  });

  it('returns the normalized PZN from parsed scanner results', () => {
    expect(parseScanResult('PZN - 00078597', 'CODE_39')).toEqual({
      barcode: 'PZN - 00078597',
      pzn: '00078597',
      format: 'CODE_39',
      isPZN: true,
    });

    expect(parseScanResult('4001234567890', 'EAN_13')).toEqual({
      barcode: '4001234567890',
      pzn: null,
      format: 'EAN_13',
      isPZN: false,
    });
  });
});
