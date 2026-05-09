import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Alert } from 'react-native';
import SettingsScreen from '../screens/SettingsScreen';
import { getAllAerzte, getMaxAerzte } from '../database/ArztController';

let mockAerzte: Array<{ id: string; name: string; telefon: string; adresse: string; fachgebiet: string; created_at: string }> = [];

jest.mock('../context/PersonenContext', () => ({
  usePersonen: () => ({
    personen: [{ id: 'standard', name: 'Ich', avatar_emoji: '🙂', ist_standard: 1 }],
    aktivePerson: { id: 'standard', name: 'Ich', avatar_emoji: '🙂', ist_standard: 1 },
    setAktivePerson: jest.fn(),
    addPerson: jest.fn(),
    editPerson: jest.fn(),
    removePerson: jest.fn(),
    maxPersonen: 1,
    premium: false,
    loading: false,
  }),
}));

jest.mock('../database/ArztController', () => ({
  getAllAerzte: jest.fn(() => Promise.resolve(mockAerzte)),
  createArzt: jest.fn(),
  updateArzt: jest.fn(),
  deleteArzt: jest.fn(),
  getMaxAerzte: jest.fn().mockResolvedValue(1),
}));

jest.mock('../database/PersonenController', () => ({
  AVATAR_EMOJIS: ['🙂', '👤'],
}));

jest.mock('../services/PremiumService', () => ({
  isPremium: jest.fn().mockResolvedValue(false),
  setDevPremiumOverride: jest.fn(),
  getDevPremiumOverride: jest.fn().mockResolvedValue(''),
}));

jest.mock('../utils/AccessibilityHelpers', () => ({
  announceChange: jest.fn(),
}));

jest.mock('../utils/Einnahmeplan', () => ({
  SLOT_META: {
    morgens: { label: 'Morgens', emoji: '🌅' },
    mittags: { label: 'Mittags', emoji: '☀️' },
    abends: { label: 'Abends', emoji: '🌙' },
    nachts: { label: 'Nachts', emoji: '🌃' },
  },
  SLOT_REIHENFOLGE: ['morgens', 'mittags', 'abends', 'nachts'],
  getAllDefaultUhrzeiten: jest.fn().mockResolvedValue({
    morgens: '08:00',
    mittags: '12:00',
    abends: '18:00',
    nachts: '22:00',
  }),
  setDefaultUhrzeit: jest.fn(),
  resetDefaultUhrzeiten: jest.fn(),
}));

const navigation = {
  navigate: jest.fn(),
} as any;

function flattenText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join(' ');
  if (typeof node === 'object') {
    const children = (node as { children?: unknown }).children;
    return flattenText(children);
  }
  return '';
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    mockAerzte = [];
    jest.clearAllMocks();
    (getMaxAerzte as jest.Mock).mockResolvedValue(1);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function renderScreen() {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <SettingsScreen navigation={navigation} route={{ key: 'Settings', name: 'Settings' }} />
      );
      await Promise.resolve();
    });

    return tree!;
  }

  it('shows a clear medication intake liability disclaimer', async () => {
    const tree = await renderScreen();

    const text = flattenText(tree.toJSON());
    expect(text).toContain('Wichtiger Hinweis');
    expect(text).toContain('Wir übernehmen keine Haftung für eine fehlerhafte Einnahme');
    expect(text).toContain('Jeder Nutzer ist selbst dafür verantwortlich');
  });

  it('shows app publisher and contact information', async () => {
    const tree = await renderScreen();

    const text = flattenText(tree.toJSON());
    expect(text).toContain('Serverraum247');
    expect(text).toContain('kontakt@serverraum247.dev');
    expect(text).toContain('App aus dem Saarland');
  });

  it('does not show a permanent premium upsell in the doctors section', async () => {
    const tree = await renderScreen();

    const text = flattenText(tree.toJSON());
    expect(text).toContain('Hinterlege Kontaktdaten deiner Ärzte.');
    expect(text).not.toContain('Premium: unbegrenzte Ärzte');
    expect(text).not.toContain('Kostenlos: 1 Arzt. Premium = unbegrenzt.');
  });

  it('shows the unified premium dialog only when adding another doctor exceeds the free limit', async () => {
    mockAerzte = [{
      id: 'arzt-1',
      name: 'Dr. Müller',
      telefon: '',
      adresse: '',
      fachgebiet: 'Hausarzt',
      created_at: '',
    }];
    (getAllAerzte as jest.Mock).mockResolvedValue(mockAerzte);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await renderScreen();

    await ReactTestRenderer.act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Arzt hinzufügen' }).props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Nur mit Premium möglich',
      'Mehr als ein Arzt ist nur mit Premium möglich.',
      expect.any(Array)
    );
  });
});
