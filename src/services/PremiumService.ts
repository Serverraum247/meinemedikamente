/**
 * PremiumService.ts – IAP + Freemium-Logik
 *
 * WICHTIG: react-native-iap nutzt NitroModules (TurboModules).
 * Falls das native Modul nicht verfuegbar ist (z.B. falsche Build-Config),
 * faellt der Service elegant zurueck – die App startet trotzdem.
 */

import { getSetting, setSetting } from './SettingsService';

// ─── Lazy IAP Loading ──────────────────────────────────────────────
// Statischer Import crasht die App wenn NitroModules fehlt.
// Daher: dynamisch laden und Fehler abfangen.

let iapModule: any = null;
let iapInitialized = false;

async function getIAP() {
  if (iapModule !== null) return iapModule;
  try {
    iapModule = await import('react-native-iap');
    return iapModule;
  } catch (e) {
    console.warn('[PremiumService] react-native-iap nicht verfuegbar:', (e as Error).message);
    return null;
  }
}

// ─── Constants ────────────────────────────────────────────────────
const PREMIUM_SKU = 'meine_medikamente_premium';
const KEY_PREMIUM = 'premium_aktiv';
const KEY_SCANS_TODAY = 'premium_scans_date';
const KEY_CALENDAR_MONTH = 'premium_calendar_month';

const FREE_SCAN_LIMIT = 3;
const FREE_CALENDAR_LIMIT = 2;
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

// ─── Premium Status ───────────────────────────────────────────────

export async function isPremium(): Promise<boolean> {
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
    console.warn('[PremiumService] IAP nicht verfuegbar – Premium-Funktionen deaktiviert');
    iapInitialized = true;
    return;
  }

  try {
    await iap.initConnection();
    console.log('[PremiumService] IAP-Verbindung hergestellt');

    iap.purchaseUpdatedListener(async (purchase: any) => {
      console.log('[PremiumService] Purchase successful:', purchase.productId);
      await setPremium(true);
      await iap.finishTransaction({ purchase, isConsumable: false });
    });

    iap.purchaseErrorListener((error: any) => {
      console.warn('[PremiumService] Purchase error:', error.message, error.code);
    });

    iapInitialized = true;
  } catch (e) {
    console.warn('[PremiumService] IAP-Init fehlgeschlagen:', (e as Error).message);
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
    console.warn('[PremiumService] getProductInfo error:', e);
    return null;
  }
}

export async function purchasePremium(): Promise<boolean> {
  const iap = await getIAP();
  if (!iap) {
    console.warn('[PremiumService] IAP nicht verfuegbar');
    return false;
  }
  
  try {
    await iap.requestPurchase({ skus: [PREMIUM_SKU] } as any);
    return true;
  } catch (e) {
    console.warn('[PremiumService] purchasePremium error:', e);
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
