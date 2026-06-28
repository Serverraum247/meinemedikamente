import {
  collectPortableData,
  clearPendingDeviceTransferFile,
  decryptArchive,
  encryptArchive,
  getPendingDeviceTransferFile,
  previewDeviceTransferPackage,
  restoreDeviceTransferPackage,
  type DeviceTransferArchive,
} from '../services/DeviceTransferService';
import { getDatabase } from '../database/Database';
import { planeAlleErinnerungen } from '../services/ErinnerungsService';

jest.mock('../database/Database', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('../services/ErinnerungsService', () => ({
  planeAlleErinnerungen: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native', () => {
  const pendingTransfer = {
    content: null as string | null,
  };
  return {
    Platform: { OS: 'ios' },
    NativeModules: {
      DeviceTransferFile: {
        randomBytes: jest.fn(async (byteCount: number) => Buffer.alloc(byteCount, 7).toString('base64')),
        getPendingTransferFile: jest.fn(async () => pendingTransfer.content),
        clearPendingTransferFile: jest.fn(async () => {
          pendingTransfer.content = null;
        }),
        __setPendingTransferFile: (content: string | null) => {
          pendingTransfer.content = content;
        },
      },
    },
  };
});

const { NativeModules } = jest.requireMock('react-native');

type Row = Record<string, unknown>;

const tableRows: Record<string, Row[]> = {
  personen: [
    {
      id: 'person-1',
      name: 'Daniel',
      avatar_emoji: '👤',
      avatar_uri: '/private/avatar.jpg',
      ist_standard: 1,
      created_at: '2026-06-01T10:00:00.000Z',
    },
  ],
  medikamente: [
    {
      id: 'med-1',
      name: 'Ramipril',
      zusatz: '',
      person_id: 'person-1',
      aktueller_bestand: 20,
      einzeldosis: 1,
      einheit: 'Tabletten',
      pzn: '',
      packungsgroesse: 50,
      warnung_ab_bestand: 7,
      sync_status: 0,
      erinnerung_aktiv: 1,
      einnahme_uhrzeiten: '[]',
      auto_abzug_aktiv: 0,
      fruehe_einnahme_erlaubt: 1,
      arzt_id: '',
      staerke_wert: 5,
      staerke_einheit: 'mg',
      created_at: '2026-06-01T10:00:00.000Z',
      updated_at: '2026-06-01T10:00:00.000Z',
    },
  ],
  packungen: [
    {
      id: 'pack-1',
      medikament_id: 'med-1',
      groesse: 50,
      pzn: '',
      produkt_code: '04150096336005',
      charge: 'V43884',
      seriennummer: '9ZMBBNUAA',
      verwendbar_bis: '2027-07-31',
      ist_ersatzprodukt: 0,
      ersatz_name: '',
      gekauft_am: '2026-06-01',
      menge_verbleibend: 20,
    },
  ],
  einnahmen: [
    {
      id: 'ein-1',
      medikament_id: 'med-1',
      person_id: 'person-1',
      menge: 1,
      timestamp: '2026-06-01T08:00:00.000Z',
      slot: 'morgens',
      notiz: '',
    },
  ],
  arzt_urlaub: [],
  aerzte: [],
  einstellungen: [
    { key: 'premium_aktiv', value: 'true' },
    { key: 'dev_premium_override', value: 'premium' },
    { key: 'premium_scans_date', value: '2026-06-11:2' },
    { key: 'premium_calendar_month', value: '2026-06:1' },
    { key: 'rezept_termin:med-1', value: '{"eventId":"abc"}' },
    { key: 'urlaubs_erinnerung_erledigt:test', value: 'done' },
    { key: 'einnahme_erinnerung_letzter_2026-06-11', value: 'x' },
    { key: 'einnahmeplan_default_uhrzeiten', value: '{"morgens":"07:30"}' },
    { key: 'aktive_person_id', value: 'person-1' },
  ],
};

function rows(items: Row[]) {
  return {
    rows: {
      length: items.length,
      item: (index: number) => items[index],
    },
  };
}

function createDbMock(overrides: Partial<{ transactionFails: boolean }> = {}) {
  const executeSql = jest.fn(async (sql: string) => {
    const pragma = sql.match(/PRAGMA table_info\(([^)]+)\)/);
    if (pragma) {
      const table = pragma[1];
      return [rows(Object.keys(tableRows[table]?.[0] ?? {}).map(name => ({ name })))];
    }

    const select = sql.match(/FROM\s+([a-z_]+)/i);
    if (select) {
      return [rows(tableRows[select[1]] ?? [])];
    }

    return [rows([])];
  });

  const txExecuteSql = jest.fn();
  const transaction = jest.fn((work: (tx: { executeSql: jest.Mock }) => void, onError: (error: Error) => void, onSuccess: () => void) => {
    work({ executeSql: txExecuteSql });
    if (overrides.transactionFails) {
      onError(new Error('insert failed'));
      return;
    }
    onSuccess();
  });

  return { executeSql, transaction, txExecuteSql };
}

function makeArchive(): DeviceTransferArchive {
  return {
    manifest: {
      transferFormatVersion: 1,
      appVersion: '0.1.60',
      dbSchemaVersion: 17,
      minSupportedImporterVersion: 1,
      createdAt: '2026-06-11T10:00:00.000Z',
      platform: 'ios',
      tables: {
        personen: { rows: 1, checksum: 'x' },
        medikamente: { rows: 1, checksum: 'x' },
        packungen: { rows: 0, checksum: 'x' },
        einnahmen: { rows: 0, checksum: 'x' },
        arzt_urlaub: { rows: 0, checksum: 'x' },
        aerzte: { rows: 0, checksum: 'x' },
        einstellungen: { rows: 0, checksum: 'x' },
      },
    },
    data: {
      personen: [{ ...tableRows.personen[0], avatar_uri: '' }],
      medikamente: tableRows.medikamente.map(row => ({ ...row })),
      packungen: [],
      einnahmen: [],
      arzt_urlaub: [],
      aerzte: [],
      einstellungen: [],
    },
  };
}

describe('DeviceTransferService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getDatabase as jest.Mock).mockResolvedValue(createDbMock());
  });

  it('exports portable data with persons and without local premium state', async () => {
    const archive = await collectPortableData(new Date('2026-06-11T10:00:00.000Z'));

    expect(archive.data.personen).toHaveLength(1);
    expect(archive.data.personen[0].avatar_uri).toBe('');
    expect(archive.data.medikamente[0].person_id).toBe('person-1');
    expect(archive.data.packungen[0]).toEqual(expect.objectContaining({
      produkt_code: '04150096336005',
      charge: 'V43884',
      seriennummer: '9ZMBBNUAA',
      verwendbar_bis: '2027-07-31',
    }));
    expect(archive.data.einstellungen).toEqual([
      { key: 'einnahmeplan_default_uhrzeiten', value: '{"morgens":"07:30"}' },
      { key: 'aktive_person_id', value: 'person-1' },
    ]);
  });

  it('rejects a wrong security code before exposing archive data', () => {
    const archive = makeArchive();
    const packageText = encryptArchive(archive, '1111-2222-3333-4444', {
      iterations: 4,
      saltBase64: Buffer.alloc(16, 1).toString('base64'),
      ivBase64: Buffer.alloc(16, 2).toString('base64'),
    });

    expect(() => decryptArchive(packageText, '9999-2222-3333-4444')).toThrow('Sicherheitscode');
  });

  it('rejects unknown fields instead of building dynamic SQL', () => {
    const archive = makeArchive();
    archive.data.medikamente[0].unexpected_column = 'bad';

    expect(() => encryptArchive(archive, '1111-2222-3333-4444', {
      iterations: 4,
      saltBase64: Buffer.alloc(16, 1).toString('base64'),
      ivBase64: Buffer.alloc(16, 2).toString('base64'),
    })).toThrow('unbekanntes Feld');
  });

  it('runs restore inside one transaction and reschedules imported reminders', async () => {
    const db = createDbMock();
    (getDatabase as jest.Mock).mockResolvedValue(db);
    const archive = makeArchive();
    const packageText = encryptArchive(archive, '1111-2222-3333-4444', {
      iterations: 4,
      saltBase64: Buffer.alloc(16, 1).toString('base64'),
      ivBase64: Buffer.alloc(16, 2).toString('base64'),
    });

    const preview = await restoreDeviceTransferPackage(packageText, '1111-2222-3333-4444');

    expect(preview.medicationCount).toBe(1);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.txExecuteSql).toHaveBeenCalledWith('DELETE FROM einstellungen');
    expect(db.txExecuteSql).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO personen'), expect.any(Array));
    expect(planeAlleErinnerungen).toHaveBeenCalledWith(archive.data.medikamente);
  });

  it('propagates transaction errors so partial restore is not reported as success', async () => {
    const db = createDbMock({ transactionFails: true });
    (getDatabase as jest.Mock).mockResolvedValue(db);
    const archive = makeArchive();
    const packageText = encryptArchive(archive, '1111-2222-3333-4444', {
      iterations: 4,
      saltBase64: Buffer.alloc(16, 1).toString('base64'),
      ivBase64: Buffer.alloc(16, 2).toString('base64'),
    });

    await expect(restoreDeviceTransferPackage(packageText, '1111-2222-3333-4444')).rejects.toThrow('insert failed');
    expect(planeAlleErinnerungen).not.toHaveBeenCalled();
  });

  it('exposes and clears pending transfer files from external attachments', async () => {
    const archive = makeArchive();
    const packageText = encryptArchive(archive, '1111-2222-3333-4444', {
      iterations: 4,
      saltBase64: Buffer.alloc(16, 1).toString('base64'),
      ivBase64: Buffer.alloc(16, 2).toString('base64'),
    });

    NativeModules.DeviceTransferFile.__setPendingTransferFile(packageText);

    await expect(getPendingDeviceTransferFile()).resolves.toBe(packageText);
    await clearPendingDeviceTransferFile();
    await expect(getPendingDeviceTransferFile()).resolves.toBeNull();
  });

  it('does not restore an external package before a valid security code preview', async () => {
    const db = createDbMock();
    (getDatabase as jest.Mock).mockResolvedValue(db);
    const archive = makeArchive();
    const packageText = encryptArchive(archive, '1111-2222-3333-4444', {
      iterations: 4,
      saltBase64: Buffer.alloc(16, 1).toString('base64'),
      ivBase64: Buffer.alloc(16, 2).toString('base64'),
    });

    expect(() => previewDeviceTransferPackage(packageText, '9999-2222-3333-4444')).toThrow('Sicherheitscode');
    expect(db.transaction).not.toHaveBeenCalled();
    expect(planeAlleErinnerungen).not.toHaveBeenCalled();
  });
});
