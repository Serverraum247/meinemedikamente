import notifee, {
  AlarmType,
  AndroidNotificationSetting,
  RepeatFrequency,
} from '@notifee/react-native';
import { planeErinnerungen } from '../services/ErinnerungsService';

jest.mock('@notifee/react-native', () => {
  const mockNotifee = {
    requestPermission: jest.fn(async () => ({ authorizationStatus: 1 })),
    getNotificationSettings: jest.fn(async () => ({
      authorizationStatus: 1,
      android: { alarm: 1 },
      ios: {},
    })),
    createChannel: jest.fn(async channel => channel.id),
    createTriggerNotification: jest.fn(async notification => notification.id),
    getTriggerNotifications: jest.fn(async () => []),
    cancelTriggerNotification: jest.fn(async () => undefined),
  };

  return {
    __esModule: true,
    default: mockNotifee,
    AlarmType: {
      SET_EXACT_AND_ALLOW_WHILE_IDLE: 3,
    },
    AndroidImportance: {
      HIGH: 4,
    },
    AndroidNotificationSetting: {
      NOT_SUPPORTED: -1,
      DISABLED: 0,
      ENABLED: 1,
    },
    AuthorizationStatus: {
      DENIED: 0,
      AUTHORIZED: 1,
      PROVISIONAL: 2,
    },
    EventType: {
      DELIVERED: 3,
    },
    RepeatFrequency: {
      DAILY: 1,
      WEEKLY: 2,
    },
    TriggerType: {
      TIMESTAMP: 0,
    },
  };
});

jest.mock('../utils/Logger', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const baseMedication = {
  id: 'med-1',
  name: 'Biso Lich',
  einzeldosis: 1,
  einheit: 'Tabletten',
  erinnerung_aktiv: 1,
  einnahme_uhrzeiten: JSON.stringify([{ slot: 'morgens', uhrzeit: '08:00' }]),
  auto_abzug_aktiv: 0,
};

describe('planeErinnerungen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (notifee.getTriggerNotifications as jest.Mock).mockResolvedValue([]);
  });

  it('plans a repeating local notification so reminders work outside the open app', async () => {
    await planeErinnerungen(baseMedication);

    expect(notifee.requestPermission).toHaveBeenCalled();
    expect(notifee.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'medikament-erinnerung',
        name: 'Medikamenten-Erinnerung',
      }),
    );
    expect(notifee.createTriggerNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'med-med-1-morgens-0800',
        title: '💊 Biso Lich',
        body: 'Morgens: Zeit für Ihre Einnahme: 1 Tabletten',
      }),
      expect.objectContaining({
        repeatFrequency: RepeatFrequency.DAILY,
        alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
      }),
    );
  });

  it('falls back to an inexact Android trigger when exact alarms are disabled', async () => {
    (notifee.getNotificationSettings as jest.Mock).mockResolvedValueOnce({
      authorizationStatus: 1,
      android: { alarm: AndroidNotificationSetting.DISABLED },
      ios: {},
    });

    await planeErinnerungen(baseMedication);

    expect(notifee.createTriggerNotification).toHaveBeenCalledWith(
      expect.any(Object),
      expect.not.objectContaining({
        alarmManager: expect.anything(),
      }),
    );
  });

  it('plans selected weekdays as weekly reminders', async () => {
    await planeErinnerungen({
      ...baseMedication,
      einnahme_uhrzeiten: JSON.stringify([
        { slot: 'morgens', uhrzeit: '08:00', wochentage: [1, 3, 5] },
      ]),
    });

    expect(notifee.createTriggerNotification).toHaveBeenCalledTimes(3);
    expect(notifee.createTriggerNotification).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        repeatFrequency: RepeatFrequency.WEEKLY,
      }),
    );
  });
});
