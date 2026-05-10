import { findPotentialDuplicateMedication } from '../utils/MedicationDuplicate';

const baseMedication = {
  id: 'med-1',
  name: 'Biso Lich',
  zusatz: 'Bisoprolol',
  person_id: 'person-1',
  pzn: '',
};

describe('findPotentialDuplicateMedication', () => {
  it('warns for the same medication name on the same person', () => {
    const duplicate = findPotentialDuplicateMedication([baseMedication], {
      name: 'biso lich',
      zusatz: '',
      person_id: 'person-1',
      pzn: '',
    });

    expect(duplicate?.reason).toBe('name');
    expect(duplicate?.medication.name).toBe('Biso Lich');
  });

  it('warns for the same active ingredient on the same person', () => {
    const duplicate = findPotentialDuplicateMedication([baseMedication], {
      name: 'BisoHEXAL',
      zusatz: 'Bisoprolol',
      person_id: 'person-1',
      pzn: '',
    });

    expect(duplicate?.reason).toBe('activeIngredient');
  });

  it('warns for the same PZN on the same person', () => {
    const duplicate = findPotentialDuplicateMedication(
      [{ ...baseMedication, pzn: '12345678' }],
      {
        name: 'Anderer Name',
        zusatz: '',
        person_id: 'person-1',
        pzn: '12345678',
      },
    );

    expect(duplicate?.reason).toBe('pzn');
  });

  it('ignores other people and the current medication id', () => {
    expect(
      findPotentialDuplicateMedication([baseMedication], {
        name: 'Biso Lich',
        zusatz: 'Bisoprolol',
        person_id: 'person-2',
        pzn: '',
      }),
    ).toBeUndefined();

    expect(
      findPotentialDuplicateMedication([baseMedication], {
        id: 'med-1',
        name: 'Biso Lich',
        zusatz: 'Bisoprolol',
        person_id: 'person-1',
        pzn: '',
      }),
    ).toBeUndefined();
  });
});
