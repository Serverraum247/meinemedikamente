import { calculateRezeptTerminFromLeerDatum } from '../utils/RezeptTermin';

describe('RezeptTermin', () => {
  it('plans the pickup date seven days before the medication runs out', () => {
    expect(calculateRezeptTerminFromLeerDatum('2026-08-17')).toEqual({
      leerDatumIso: '2026-08-17',
      terminDatumIso: '2026-08-10',
    });
  });
});
