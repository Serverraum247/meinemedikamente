/**
 * PremiumService.ts – IAP + Freemium-Logik
 *
 * WICHTIG: react-native-iap wird nur auf Android geladen (NitroModules
 * JSI-Linker-Fehler auf iOS mit RN 0.85 Prebuilt Pods).
 * iOS-IAP wird spaeter beim App Store Release aktiviert.
 */

import { Platform } from 'react-native';
import { getSetting, setSetting } from './SettingsService';
import { logger } from '../utils/Logger';
import { canUsePremiumTestOverride } from './AppRuntimeConfigService';

// ─── Lazy IAP Loading (Android only) ───────────────────────────────

let iapModule: any = null;
let iapInitialized = false;
const ANDROID_PLAY_BILLING_ENABLED = false;

async function getIAP() {
  if (Platform.OS !== 'android') {
    logger.log('[PremiumService] IAP nur auf Android verfuegbar');
    return null;
  }
  if (!ANDROID_PLAY_BILLING_ENABLED) {
    logger.warn('[PremiumService] Google Play Billing ist in diesem Build deaktiviert.');
    return null;
  }
  if (iapModule !== null) return iapModule;
  try {
    iapModule = await import('react-native-iap');
    return iapModule;
  } catch (e) {
    logger.warn('[PremiumService] react-native-iap nicht verfuegbar:', (e as Error).message);
    return null;
  }
}

// ─── Constants ────────────────────────────────────────────────────
const PREMIUM_SKU = 'mein_mediplan_premium';
const KEY_PREMIUM = 'premium_aktiv';
const KEY_SCANS_TODAY = 'premium_scans_date';
const KEY_CALENDAR_MONTH = 'premium_calendar_month';

const FREE_SCAN_LIMIT = 3;
const FREE_CALENDAR_LIMIT = 0;
const FREE_REMINDER_SLOTS = 1;
const PREMIUM_REMINDER_SLOTS = 999;
const FREE_MAX_MEDIKAMENTE = 3;
const PREMIUM_MAX_MEDIKAMENTE = 999;

// ─── Helpers ──────────────────────────────────────────────────────

function getDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// ─── Dev-Mode Override ────────────────────────────────────────────

const KEY_DEV_PREMIUM_OVERRIDE = 'dev_premium_override';
// Werte: 'premium' | 'free' | '' (nicht gesetzt = echtes Premium)

/**
 * Nur in Debug- oder internen Test-Builds verfuegbar.
 * Setzt einen kuenstlichen Premium-Status zum Testen.
 * - 'premium': Premium simulieren
 * - 'free': Free simulieren
 * - '': Override entfernen (echtes IAP/Setting nutzen)
 */
export async function setDevPremiumOverride(mode: 'premium' | 'free' | ''): Promise<void> {
  if (!canUsePremiumTestOverride()) return;
  await setSetting(KEY_DEV_PREMIUM_OVERRIDE, mode);
  logger.log(`[PremiumService] Test-Override gesetzt: ${mode || 'aus (echtes Premium)'}`);
}

/**
 * Liest den aktuellen Dev-Override.
 * Returns: 'premium' | 'free' | '' (kein Override)
 */
export async function getDevPremiumOverride(): Promise<string> {
  if (!canUsePremiumTestOverride()) return '';
  return (await getSetting(KEY_DEV_PREMIUM_OVERRIDE)) || '';
}

// ─── Premium Status ───────────────────────────────────────────────

export async function isPremium(): Promise<boolean> {
  // Test-Override hat in Debug- und internen Test-Builds hoechste Prioritaet.
  if (canUsePremiumTestOverride()) {
    const override = await getSetting(KEY_DEV_PREMIUM_OVERRIDE);
    if (override === 'premium') return true;
    if (override === 'free') return false;
  }
  const val = await getSetting(KEY_PREMIUM);
  return val === 'true' || val === '1';
}

export async function setPremium(aktiv: boolean): Promise<void> {
  await setSetting(KEY_PREMIUM, aktiv ? 'true' : 'false');
}

// ─── IAP ──────────────────────────────────────────────────────────

export async function initIAP(): Promise<void> {
  if (iapInitialized) return;
  
  const iap = await getIAP();
  if (!iap) {
    logger.warn('[PremiumService] IAP nicht verfuegbar – Premium-Funktionen deaktiviert');
    iapInitialized = true;
    return;
  }

  try {
    await iap.initConnection();
    logger.log('[PremiumService] IAP-Verbindung hergestellt');

    iap.purchaseUpdatedListener(async (purchase: any) => {
      logger.log('[PremiumService] Purchase successful:', purchase.productId);
      await setPremium(true);
      await iap.finishTransaction({ purchase, isConsumable: false });
    });

    iap.purchaseErrorListener((error: any) => {
      logger.warn('[PremiumService] Purchase error:', error.message, error.code);
    });

    iapInitialized = true;
  } catch (e) {
    logger.warn('[PremiumService] IAP-Init fehlgeschlagen:', (e as Error).message);
    iapInitialized = true;
  }
}

export async function getProductInfo(): Promise<any> {
  const iap = await getIAP();
  if (!iap) return null;
  
  try {
    const products = await iap.fetchProducts({ skus: [PREMIUM_SKU] });
    return (products && products.length > 0) ? products[0] : null;
  } catch (e) {
    logger.warn('[PremiumService] getProductInfo error:', e);
    return null;
  }
}

export async function purchasePremium(): Promise<boolean> {
  const iap = await getIAP();
  if (!iap) {
    logger.warn('[PremiumService] IAP nicht verfuegbar');
    return false;
  }
  
  try {
    await iap.requestPurchase({ skus: [PREMIUM_SKU] } as any);
    return true;
  } catch (e) {
    logger.warn('[PremiumService] purchasePremium error:', e);
    return false;
  }
}

// ─── Feature Gates ────────────────────────────────────────────────

export async function canScanBarcode(): Promise<{ allowed: boolean; remaining: number }> {
  if (await isPremium()) {
    return { allowed: true, remaining: 999 };
  }

  const dateKey = getDateKey();
  const raw = await getSetting(KEY_SCANS_TODAY);

  let count = 0;
  if (raw) {
    const [storedDate, storedCount] = raw.split(':');
    if (storedDate === dateKey) {
      count = parseInt(storedCount, 10) || 0;
    }
  }

  const remaining = FREE_SCAN_LIMIT - count;
  return { allowed: remaining > 0, remaining: Math.max(remaining, 0) };
}

export async function recordBarcodeScan(): Promise<void> {
  const dateKey = getDateKey();
  const raw = await getSetting(KEY_SCANS_TODAY);

  let count = 1;
  if (raw) {
    const [storedDate, storedCount] = raw.split(':');
    if (storedDate === dateKey) {
      count = (parseInt(storedCount, 10) || 0) + 1;
    }
  }

  await setSetting(KEY_SCANS_TODAY, `${dateKey}:${count}`);
}

export async function canCreateCalendarEvent(): Promise<{ allowed: boolean; remaining: number }> {
  if (await isPremium()) {
    return { allowed: true, remaining: 999 };
  }

  const monthKey = getMonthKey();
  const raw = await getSetting(KEY_CALENDAR_MONTH);

  let count = 0;
  if (raw) {
    const [storedMonth, storedCount] = raw.split(':');
    if (storedMonth === monthKey) {
      count = parseInt(storedCount, 10) || 0;
    }
  }

  const remaining = FREE_CALENDAR_LIMIT - count;
  return { allowed: remaining > 0, remaining: Math.max(remaining, 0) };
}

export async function recordCalendarEvent(): Promise<void> {
  const monthKey = getMonthKey();
  const raw = await getSetting(KEY_CALENDAR_MONTH);

  let count = 1;
  if (raw) {
    const [storedMonth, storedCount] = raw.split(':');
    if (storedMonth === monthKey) {
      count = (parseInt(storedCount, 10) || 0) + 1;
    }
  }

  await setSetting(KEY_CALENDAR_MONTH, `${monthKey}:${count}`);
}

export async function getMaxReminderSlots(): Promise<number> {
  return (await isPremium()) ? PREMIUM_REMINDER_SLOTS : FREE_REMINDER_SLOTS;
}

export async function getMaxMedikamente(): Promise<number> {
  return (await isPremium()) ? PREMIUM_MAX_MEDIKAMENTE : FREE_MAX_MEDIKAMENTE;
}
