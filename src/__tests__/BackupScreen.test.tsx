import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Alert } from 'react-native';
import BackupScreen from '../screens/BackupScreen';
import { uploadBackup, getBackupInfo, restoreBackup } from '../services/BackupService';

jest.mock('../services/PremiumService', () => ({
  isPremium: jest.fn().mockResolvedValue(true),
}));

jest.mock('../services/BackupService', () => ({
  uploadBackup: jest.fn(),
  getBackupInfo: jest.fn(),
  restoreBackup: jest.fn(),
}));

jest.mock('../components/PremiumGate', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return function MockPremiumGate() {
    return React.createElement(Text, null, 'Premium erforderlich');
  };
});

jest.mock('../utils/Logger', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const navigation = {
  navigate: jest.fn(),
} as any;

async function renderScreen() {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <BackupScreen navigation={navigation} route={{ key: 'Backup', name: 'Backup' }} />
    );
    await Promise.resolve();
  });

  return tree!;
}

describe('BackupScreen', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (getBackupInfo as jest.Mock).mockResolvedValue(null);
    (uploadBackup as jest.Mock).mockResolvedValue({ success: true });
    (restoreBackup as jest.Mock).mockResolvedValue({ success: true });
  });

  it('shows an error when creating a backup returns a failed result', async () => {
    (uploadBackup as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Firebase nicht erreichbar',
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await renderScreen();

    await ReactTestRenderer.act(async () => {
      screen.root.findByProps({ accessibilityLabel: 'Cloud-Backup erstellen' }).props.onPress();
    });

    const confirmButtons = alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => Promise<void> }>;
    await ReactTestRenderer.act(async () => {
      await confirmButtons.find(button => button.text === 'Backup erstellen')!.onPress!();
    });

    expect(alertSpy).toHaveBeenLastCalledWith(
      'Fehler',
      'Firebase nicht erreichbar'
    );
  });

  it('shows an error when restoring a backup returns a failed result', async () => {
    (restoreBackup as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Kein Backup gefunden',
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await renderScreen();

    await ReactTestRenderer.act(async () => {
      screen.root.findByProps({ accessibilityLabel: 'Backup wiederherstellen' }).props.onPress();
    });

    const confirmButtons = alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => Promise<void> }>;
    await ReactTestRenderer.act(async () => {
      await confirmButtons.find(button => button.text === 'Wiederherstellen')!.onPress!();
    });

    expect(alertSpy).toHaveBeenLastCalledWith(
      'Fehler',
      'Kein Backup gefunden'
    );
  });
});
