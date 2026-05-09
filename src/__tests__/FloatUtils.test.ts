/**
 * FloatUtils.test.ts - Unit-Tests fuer Float-Arithmetik.
 */

import {
  reduceBestand,
  increaseBestand,
  calculateTageBisLeer,
  calculateLeerDatum,
  isNachfuellungVorUrlaubNoetig,
  isUnterWarnschwelle,
  remainingEinnahmen,
} from '../utils/FloatUtils';

describe('FloatUtils', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-09T12:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('reduceBestand', () => {
    it('reduces full and partial tablet amounts without floating-point drift', () => {
      expect(reduceBestand(28, 1)).toBe(27);
      expect(reduceBestand(28.5, 0.5)).toBe(28);
      expect(reduceBestand(14, 0.5)).toBe(13.5);
      expect(reduceBestand(10.33, 0.25)).toBe(10.08);
      expect(reduceBestand(0.3, 0.1)).toBe(0.2);
    });

    it('does not return negative stock', () => {
      expect(reduceBestand(0.5, 0.5)).toBe(0);
      expect(reduceBestand(0.3, 0.5)).toBe(0);
    });
  });

  describe('increaseBestand', () => {
    it('adds purchased package sizes and rounds the result', () => {
      expect(increaseBestand(10, 50)).toBe(60);
      expect(increaseBestand(10.5, 28.5)).toBe(39);
      expect(increaseBestand(0, 30)).toBe(30);
    });
  });

  describe('calculateTageBisLeer', () => {
    it('calculates whole days until stock is empty', () => {
      expect(calculateTageBisLeer(28, 1)).toBe(28);
      expect(calculateTageBisLeer(14, 0.5)).toBe(28);
      expect(calculateTageBisLeer(14.5, 0.5)).toBe(29);
      expect(calculateTageBisLeer(30, 1, 2)).toBe(15);
      expect(calculateTageBisLeer(28.5, 0.5, 2)).toBe(28);
      expect(calculateTageBisLeer(7, 0.5)).toBe(14);
    });

    it('returns zero for empty stock or invalid dosage', () => {
      expect(calculateTageBisLeer(0, 1)).toBe(0);
      expect(calculateTageBisLeer(28, 0)).toBe(0);
    });
  });

  describe('calculateLeerDatum', () => {
    it('returns the ISO date when stock runs out', () => {
      expect(calculateLeerDatum(7, 1, 1)).toBe('2026-05-16');
      expect(calculateLeerDatum(14.5, 0.5, 1)).toBe('2026-06-07');
    });
  });

  describe('isNachfuellungVorUrlaubNoetig', () => {
    it('warns when stock runs out before vacation end plus buffer', () => {
      expect(isNachfuellungVorUrlaubNoetig(5, 1, 1, '2026-05-19', 3)).toBe(true);
      expect(isNachfuellungVorUrlaubNoetig(5, 1, 1, '2026-05-16', 3)).toBe(true);
    });

    it('does not warn when stock lasts beyond vacation end plus buffer', () => {
      expect(isNachfuellungVorUrlaubNoetig(14, 1, 1, '2026-05-19', 3)).toBe(false);
    });
  });

  describe('isUnterWarnschwelle', () => {
    it('compares stock against the warning threshold', () => {
      expect(isUnterWarnschwelle(6.5, 7)).toBe(true);
      expect(isUnterWarnschwelle(7, 7)).toBe(true);
      expect(isUnterWarnschwelle(7.5, 7)).toBe(false);
    });
  });

  describe('remainingEinnahmen', () => {
    it('calculates remaining intake count', () => {
      expect(remainingEinnahmen(28.5, 0.5)).toBe(57);
      expect(remainingEinnahmen(13.7, 0.5)).toBe(27);
      expect(remainingEinnahmen(0, 1)).toBe(0);
    });
  });
});
