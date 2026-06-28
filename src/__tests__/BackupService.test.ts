import CryptoJS from 'crypto-js';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {},
}));

jest.mock('../services/PremiumService', () => ({
  isPremium: jest.fn().mockResolvedValue(true),
}));

jest.mock('../services/SettingsService', () => ({
  deleteSetting: jest.fn(),
  getSetting: jest.fn(),
  setSetting: jest.fn(),
}));

jest.mock('../services/DeviceTransferService', () => ({
  collectPortableData: jest.fn(),
  createArchiveCryptoOptions: jest.fn(),
  encryptArchive: jest.fn(),
  generateSecurityCode: jest.fn(),
  restoreDeviceTransferPackage: jest.fn(),
}));

const mockAuthState = {
  currentUser: null as { uid: string } | null,
};

const mockSignInAnonymously = jest.fn(async () => {
  mockAuthState.currentUser = { uid: 'anon-1' };
  return { user: mockAuthState.currentUser };
});

jest.mock('@react-native-firebase/auth', () => ({
  default: () => ({
    currentUser: mockAuthState.currentUser,
    signInAnonymously: mockSignInAnonymously,
  }),
}));

const mockDocStore = new Map<string, any>();
const mockDocSetCalls: Array<{ id: string; data: any }> = [];
const mockServerTimestampToken = Symbol('serverTimestamp');
const mockUpdatedAtValue = {
  toDate: () => new Date('2026-06-28T12:00:00.000Z'),
};

const mockFirestoreFactory: any = Object.assign(
  () => ({
    collection: jest.fn(() => ({
      doc: jest.fn((id: string) => ({
        get: jest.fn(async () => ({
          id,
          exists: mockDocStore.has(id),
          data: () => mockDocStore.get(id),
        })),
        set: jest.fn(async (data: any) => {
          const existing = mockDocStore.get(id) ?? {};
          const materialized = {
            ...existing,
            ...data,
            updatedAt: data.updatedAt === mockServerTimestampToken ? mockUpdatedAtValue : existing.updatedAt,
          };
          mockDocStore.set(id, materialized);
          mockDocSetCalls.push({ id, data: materialized });
        }),
        delete: jest.fn(async () => {
          mockDocStore.delete(id);
        }),
      })),
    })),
  }),
  {
    FieldValue: {
      serverTimestamp: jest.fn(() => mockServerTimestampToken),
    },
  },
);

jest.mock('@react-native-firebase/firestore', () => ({
  default: mockFirestoreFactory,
}));

import {
  connectBackupWithRecoveryCode,
  getBackupInfo,
  restoreBackup,
  uploadBackup,
} from '../services/BackupService';
import {
  collectPortableData,
  createArchiveCryptoOptions,
  encryptArchive,
  generateSecurityCode,
  restoreDeviceTransferPackage,
} from '../services/DeviceTransferService';
import { deleteSetting, getSetting, setSetting } from '../services/SettingsService';

const validRecoveryCode = 'ABCD-EF12-3456-7890-ABCD-EF12-3456-7890';

function buildArchive() {
  return {
    manifest: {
      createdAt: '2026-06-28T10:30:00.000Z',
    },
    data: {
      personen: [{ id: 'person-1' }],
      medikamente: [{ id: 'med-1' }, { id: 'med-2' }],
      aerzte: [{ id: 'arzt-1' }],
      einnahmen: [{ id: 'ein-1' }],
      packungen: [{ id: 'pack-1' }],
    },
  } as any;
}

function buildDocId(recoveryCode: string): string {
  return CryptoJS.SHA256(recoveryCode).toString(CryptoJS.enc.Hex);
}

describe('BackupService Android cloud backup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.currentUser = null;
    mockDocStore.clear();
    mockDocSetCalls.length = 0;

    (getSetting as jest.Mock).mockResolvedValue(null);
    (setSetting as jest.Mock).mockResolvedValue(undefined);
    (deleteSetting as jest.Mock).mockResolvedValue(undefined);

    (generateSecurityCode as jest.Mock).mockResolvedValue(validRecoveryCode);
    (collectPortableData as jest.Mock).mockResolvedValue(buildArchive());
    (createArchiveCryptoOptions as jest.Mock).mockResolvedValue({
      saltBase64: 'salt-base64',
      ivBase64: 'iv-base64',
    });
    (encryptArchive as jest.Mock).mockReturnValue('encrypted-cloud-package');
    (restoreDeviceTransferPackage as jest.Mock).mockResolvedValue({
      medicationCount: 2,
    });
  });

  it('creates the first Android cloud backup with a generated recovery code', async () => {
    const result = await uploadBackup();

    expect(result).toEqual({
      success: true,
      recoveryCode: validRecoveryCode,
      generatedRecoveryCode: true,
    });
    expect(setSetting).toHaveBeenCalledWith('cloud_backup_recovery_code_v1', validRecoveryCode);
    expect(encryptArchive).toHaveBeenCalledWith(expect.any(Object), validRecoveryCode, {
      saltBase64: 'salt-base64',
      ivBase64: 'iv-base64',
    });
    expect(mockDocSetCalls).toHaveLength(1);
    expect(mockDocSetCalls[0].id).toBe(buildDocId(validRecoveryCode));
    expect(mockDocSetCalls[0].data).toMatchObject({
      format: 'MEIN_MEDIPLAN_CLOUD_BACKUP',
      packageText: 'encrypted-cloud-package',
      medicationCount: 2,
      personCount: 1,
      doctorCount: 1,
      intakeCount: 1,
      packageCount: 1,
    });
  });

  it('restores the cloud backup on Android with the stored recovery code', async () => {
    const docId = buildDocId(validRecoveryCode);
    mockDocStore.set(docId, {
      format: 'MEIN_MEDIPLAN_CLOUD_BACKUP',
      version: 1,
      packageText: 'encrypted-cloud-package',
      manifestCreatedAt: '2026-06-28T10:30:00.000Z',
      medicationCount: 2,
      updatedAt: mockUpdatedAtValue,
    });
    (getSetting as jest.Mock).mockResolvedValue(validRecoveryCode);

    const info = await getBackupInfo();
    const result = await restoreBackup();

    expect(info).toEqual({
      id: docId,
      timestamp: '2026-06-28T12:00:00.000Z',
      medikamentCount: 2,
      version: 1,
    });
    expect(result).toEqual({
      success: true,
      medikamentCount: 2,
    });
    expect(restoreDeviceTransferPackage).toHaveBeenCalledWith('encrypted-cloud-package', validRecoveryCode);
  });

  it('stores a recovery code locally only after a matching cloud backup was found', async () => {
    const missingResult = await connectBackupWithRecoveryCode(validRecoveryCode);

    expect(missingResult).toEqual({
      success: false,
      error: 'Zu diesem Sicherungscode wurde kein Cloud-Backup gefunden.',
    });
    expect(setSetting).not.toHaveBeenCalled();

    const docId = buildDocId(validRecoveryCode);
    mockDocStore.set(docId, {
      format: 'MEIN_MEDIPLAN_CLOUD_BACKUP',
      version: 1,
      packageText: 'encrypted-cloud-package',
      manifestCreatedAt: '2026-06-28T10:30:00.000Z',
      medicationCount: 2,
      updatedAt: mockUpdatedAtValue,
    });

    const successResult = await connectBackupWithRecoveryCode(validRecoveryCode.toLowerCase());

    expect(successResult).toEqual({
      success: true,
      recoveryCode: validRecoveryCode,
      info: {
        id: docId,
        timestamp: '2026-06-28T12:00:00.000Z',
        medikamentCount: 2,
        version: 1,
      },
    });
    expect(setSetting).toHaveBeenLastCalledWith('cloud_backup_recovery_code_v1', validRecoveryCode);
  });
});
