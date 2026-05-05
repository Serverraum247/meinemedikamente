/**
 * FloatUtils.test.ts – Unit-Tests fuer Float-Arithmetik
 *
 * Testet alle Edge-Cases fuer halbe Tabletten (0.5),
 * Floating-Point-Praezision, Rundung und Datumsberechnung.
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

interface TestCase {
  name: string;
  fn: () => boolean;
}

const tests: TestCase[] = [];
function test(name: string, fn: () => boolean) {
  tests.push({ name, fn });
}

function assertEqual<T>(actual: T, expected: T, label: string): boolean {
  const pass = actual === expected;
  if (!pass) {
    console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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

test('Negativer Bestand verhindern: 0.3 - 0.5 = 0', () => {
  return assertEqual(reduceBestand(0.3, 0.5), 0, '0.3-0.5');
});

test('Viele Nachkommastellen: 10.33 - 0.25 = 10.08', () => {
  return assertEqual(reduceBestand(10.33, 0.25), 10.08, '10.33-0.25');
});

test('Floating Point Praezision: 0.3 - 0.1 = 0.2', () => {
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

test('Tage: 28 Tabletten, 1.0/Tag = 28 Tage', () => {
  return assertEqual(calculateTageBisLeer(28, 1), 28, '28/1');
});

test('Tage: 14 Tabletten, 0.5/Tag = 28 Tage', () => {
  return assertEqual(calculateTageBisLeer(14, 0.5), 28, '14/0.5');
});

test('Tage: 14.5 Tabletten, 0.5/Tag = 29 Tage', () => {
  return assertEqual(calculateTageBisLeer(14.5, 0.5), 29, '14.5/0.5');
});

test('Tage: 30 Tabletten, 1.0/Tag, 2x taegl. = 15 Tage', () => {
  return assertEqual(calculateTageBisLeer(30, 1.0, 2), 15, '30/1/2x');
});

test('Tage: 28.5 Tabletten, 0.5/Tag, 2x taegl. = 28 Tage', () => {
  // 28.5 / (0.5 * 2) = 28.5 / 1.0 = 28.5 -> floor = 28
  return assertEqual(calculateTageBisLeer(28.5, 0.5, 2), 28, '28.5/0.5/2x');
});

test('Tage: 0 Bestand = 0 Tage', () => {
  return assertEqual(calculateTageBisLeer(0, 1), 0, '0/1');
});

test('Tage: Dosis 0 = 0 Tage (Edge Case)', () => {
  return assertEqual(calculateTageBisLeer(28, 0), 0, '28/0');
});

test('Tage: 7 Tabletten, 0.5/Tag = 14 Tage', () => {
  return assertEqual(calculateTageBisLeer(7, 0.5), 14, '7/0.5');
});

// =============================================
// TESTS: calculateLeerDatum
// =============================================

test('LeerDatum: Heute + 7 Tage ergibt korrektes Datum', () => {
  const result = calculateLeerDatum(7, 1, 1);
  const expected = new Date();
  expected.setDate(expected.getDate() + 7);
  const expectedStr = expected.toISOString().split('T')[0];
  return assertEqual(result, expectedStr, '7Tage');
});

test('LeerDatum: 14.5 Tabletten / 0.5 Dosis = 29 Tage ab heute', () => {
  const result = calculateLeerDatum(14.5, 0.5, 1);
  const expected = new Date();
  expected.setDate(expected.getDate() + 29);
  const expectedStr = expected.toISOString().split('T')[0];
  return assertEqual(result, expectedStr, '29Tage');
});

// =============================================
// TESTS: isNachfuellungVorUrlaubNoetig
// =============================================

test('Urlaub-Warnung: Leer in 5 Tagen, Urlaub in 10 + 3 Puffer = true (Pillen leer VOR Urlaub)', () => {
  const in10Tagen = new Date();
  in10Tagen.setDate(in10Tagen.getDate() + 10);
  const urlaubEnde = in10Tagen.toISOString().split('T')[0];
  // 5 Tabletten, 1/Tag = leer in 5 Tagen
  // Urlaub endet in 10 Tagen + 3 Puffer = Tag 13
  // 5 <= 13 = true = WARNUNG noetig
  return isNachfuellungVorUrlaubNoetig(5, 1, 1, urlaubEnde, 3) === true;
});

test('Urlaub-Warnung: Leer in 14 Tagen, Urlaub in 10 + 3 Puffer = false (noch genug)', () => {
  const in10Tagen = new Date();
  in10Tagen.setDate(in10Tagen.getDate() + 10);
  const urlaubEnde = in10Tagen.toISOString().split('T')[0];
  // 14 Tabletten, 1/Tag = leer in 14 Tagen
  // Urlaub endet in 10 Tagen + 3 Puffer = Tag 13
  // 14 > 13 = false (LEER DATUM ist SPAETER als Urlaub+Puffer)
  // Also: keine Warnung noetig
  return isNachfuellungVorUrlaubNoetig(14, 1, 1, urlaubEnde, 3) === false;
});

test('Urlaub-Warnung: Leer in 5 Tagen, Urlaub in 7 + 3 = true', () => {
  const in7Tagen = new Date();
  in7Tagen.setDate(in7Tagen.getDate() + 7);
  const urlaubEnde = in7Tagen.toISOString().split('T')[0];
  // 5 Tabletten, 1/Tag = leer in 5 Tagen
  // Urlaub endet in 7 Tagen + 3 Puffer = Tag 10
  // 5 <= 10 = true = WARNUNG
  return isNachfuellungVorUrlaubNoetig(5, 1, 1, urlaubEnde, 3) === true;
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

// =============================================
// TESTS: remainingEinnahmen
// =============================================

test('Verbleibend: 28.5 / 0.5 = 57', () => {
  return assertEqual(remainingEinnahmen(28.5, 0.5), 57, '28.5/0.5');
});

test('Verbleibend: 13.7 / 0.5 = 27 (abgerundet)', () => {
  return assertEqual(remainingEinnahmen(13.7, 0.5), 27, '13.7/0.5');
});

test('Verbleibend: 0 / 1 = 0', () => {
  return assertEqual(remainingEinnahmen(0, 1), 0, '0/1');
});

// =============================================
// Tests ausfuehren
// =============================================

let passed = 0;
let failed = 0;

console.log('\n=== Float-Arithmetik Tests (erweitert) ===\n');

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
