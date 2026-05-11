import {
  getProductInfo,
  initIAP,
  isPremium,
  purchasePremium,
  setPremium,
} from '../services/PremiumService';
import { getSetting, setSetting } from '../services/SettingsService';

jest.mock('../services/SettingsService', () => ({
  getSetting: jest.fn(),
  setSetting: jest.fn(),
}));

jest.mock('../utils/Logger', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('PremiumService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getSetting as jest.Mock).mockResolvedValue(null);
  });

  it('keeps the Premium screen safe when Play Billing is not enabled in this build', async () => {
    await expect(initIAP()).resolves.toBeUndefined();
    await expect(getProductInfo()).resolves.toBeNull();
    await expect(purchasePremium()).resolves.toBe(false);
  });

  it('uses the local premium setting for feature gates', async () => {
    (getSetting as jest.Mock)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('true');
    await expect(isPremium()).resolves.toBe(true);

    await setPremium(false);
    expect(setSetting).toHaveBeenCalledWith('premium_aktiv', 'false');
  });
});
