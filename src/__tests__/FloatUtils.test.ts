/**
 * FloatUtils.test.ts – Unit-Tests fuer Float-Arithmetik
 *
 * Testet alle Edge-Cases fuer halbe Tabletten (0.5),
 * Floating-Point-Praezision und Rundung.
 */

import {
  reduceBestand,
  increaseBestand,
  calculateTageBisLeer,
  isUnterWarnschwelle,
  remainingEinnahmen,
} from '../utils/FloatUtils';

// Einfacher Test-Runner (kein Jest-Setup fuer RN benoetigt)
interface TestCase {
  name: string;
  fn: () => boolean;
}

const tests: TestCase[] = [];

function test(name: string, fn: () => boolean) {
  tests.push({ name, fn });
}

function assertEqual(actual: number, expected: number, label: string): boolean {
  const pass = actual === expected;
  if (!pass) {
    console.error(`  FAIL: ${label} — expected ${expected}, got ${actual}`);
  }
  return pass;
}

// =============================================
// TESTS: reduceBestand (Bestand reduzieren)
// =============================================

test('Ganze Tablette reduzieren: 28.0 - 1.0 = 27.0', () => {
  return assertEqual(reduceBestand(28, 1), 27, '28-1');
});

test('Halbe Tablette reduzieren: 28.5 - 0.5 = 28.0', () => {
  return assertEqual(reduceBestand(28.5, 0.5), 28, '28.5-0.5');
});

test('Doppelte halbe reduzieren: 14.0 - 0.5 = 13.5', () => {
  return assertEqual(reduceBestand(14, 0.5), 13.5, '14-0.5');
});

test('Bestand auf null: 0.5 - 0.5 = 0', () => {
  return assertEqual(reduceBestand(0.5, 0.5), 0, '0.5-0.5');
});

test('Negativer Bestand verhindern: 0.3 - 0.5 = 0 (nicht -0.2)', () => {
  return assertEqual(reduceBestand(0.3, 0.5), 0, '0.3-0.5');
});

test('Viele Nachkommastellen: 10.33 - 0.25 = 10.08', () => {
  return assertEqual(reduceBestand(10.33, 0.25), 10.08, '10.33-0.25');
});

test('Floating Point Praezision: 0.1 + 0.2 Problem umgehen', () => {
  // 0.3 - 0.1 sollte 0.2 sein (nicht 0.19999999999999998)
  return assertEqual(reduceBestand(0.3, 0.1), 0.2, '0.3-0.1');
});

// =============================================
// TESTS: increaseBestand (Nachkauf)
// =============================================

test('Nachkauf: 10 + 50 = 60', () => {
  return assertEqual(increaseBestand(10, 50), 60, '10+50');
});

test('Nachkauf mit halben: 10.5 + 28.5 = 39', () => {
  return assertEqual(increaseBestand(10.5, 28.5), 39, '10.5+28.5');
});

test('Nachkauf bei null: 0 + 30 = 30', () => {
  return assertEqual(increaseBestand(0, 30), 30, '0+30');
});

// =============================================
// TESTS: calculateTageBisLeer
// =============================================

test('Tage bis leer: 14 Tabletten, 0.5/Tag = 28 Tage', () => {
  return assertEqual(calculateTageBisLeer(14, 0.5), 28, '14/0.5');
});

test('Tage bis leer: 28 Tabletten, 1/Tag = 28 Tage', () => {
  return assertEqual(calculateTageBisLeer(28, 1), 28, '28/1');
});

test('Tage bis leer: 14.5 Tabletten, 0.5/Tag = 29 Tage', () => {
  return assertEqual(calculateTageBisLeer(14.5, 0.5), 29, '14.5/0.5');
});

test('Tage bis leer: 30 Tabletten, 1.0/Tag, 2x taegl. = 15 Tage', () => {
  return assertEqual(calculateTageBisLeer(30, 1.0, 2), 15, '30/1/2x');
});

test('Tage bis leer: 0 Bestand = 0 Tage', () => {
  return assertEqual(calculateTageBisLeer(0, 1), 0, '0/1');
});

test('Tage bis leer: Dosis 0 = 0 Tage (Edge Case)', () => {
  return assertEqual(calculateTageBisLeer(28, 0), 0, '28/0');
});

// =============================================
// TESTS: isUnterWarnschwelle
// =============================================

test('Warnung: 6.5 <= 7 = true', () => {
  return isUnterWarnschwelle(6.5, 7) === true;
});

test('Warnung: 7.0 <= 7 = true (Grenzwert)', () => {
  return isUnterWarnschwelle(7, 7) === true;
});

test('Keine Warnung: 7.5 > 7 = false', () => {
  return isUnterWarnschwelle(7.5, 7) === false;
});

test('Warnung: 0 <= 7 = true', () => {
  return isUnterWarnschwelle(0, 7) === true;
});

// =============================================
// TESTS: remainingEinnahmen
// =============================================

test('Verbleibende Einnahmen: 28.5 / 0.5 = 57', () => {
  return assertEqual(remainingEinnahmen(28.5, 0.5), 57, '28.5/0.5');
});

test('Verbleibende Einnahmen: 14 / 1 = 14', () => {
  return assertEqual(remainingEinnahmen(14, 1), 14, '14/1');
});

test('Verbleibende Einnahmen: 13.7 / 0.5 = 27 (abgerundet)', () => {
  return assertEqual(remainingEinnahmen(13.7, 0.5), 27, '13.7/0.5');
});

test('Verbleibende Einnahmen: 0 / 1 = 0', () => {
  return assertEqual(remainingEinnahmen(0, 1), 0, '0/1');
});

// =============================================
// Tests ausfuehren
// =============================================

let passed = 0;
let failed = 0;

console.log('\n=== Float-Arithmetik Tests ===\n');

for (const t of tests) {
  const result = t.fn();
  if (result) {
    passed++;
    console.log(`  PASS: ${t.name}`);
  } else {
    failed++;
    console.error(`  FAIL: ${t.name}`);
  }
}

console.log(`\nErgebnis: ${passed} passed, ${failed} failed, ${tests.length} total\n`);

if (failed > 0) {
  process.exit(1);
}
