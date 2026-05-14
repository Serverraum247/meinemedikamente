import { NativeModules } from 'react-native';

type AppRuntimeConfigModule = {
  internalPremiumTestMode?: boolean | string | number;
};

const { AppRuntimeConfig } = NativeModules as {
  AppRuntimeConfig?: AppRuntimeConfigModule;
};

const { SettingsManager } = NativeModules as {
  SettingsManager?: {
    settings?: Record<string, unknown>;
  };
};

function parseFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'yes' || normalized === 'true' || normalized === '1';
  }
  return false;
}

export function isInternalPremiumTestModeEnabled(): boolean {
  return (
    parseFlag(AppRuntimeConfig?.internalPremiumTestMode) ||
    parseFlag(SettingsManager?.settings?.MMInternalPremiumTestMode)
  );
}

export function canUsePremiumTestOverride(): boolean {
  return __DEV__ || isInternalPremiumTestModeEnabled();
}
