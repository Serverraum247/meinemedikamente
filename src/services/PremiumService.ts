import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  Product,
  Purchase,
  PurchaseError,
} from 'react-native-iap';
import { getSetting, setSetting } from './SettingsService';

// ─── Constants ───────────────────────────────────────────────────────
const PREMIUM_SKU = 'meine_medikamente_premium';
const KEY_PREMIUM = 'premium_aktiv';
const KEY_SCANS_TODAY = 'premium_scans_date'; // value: 'YYYY-MM-DD:count'
const KEY_CALENDAR_MONTH = 'premium_calendar_month'; // value: 'YYYY-MM:count'

const FREE_SCAN_LIMIT = 3;
const FREE_CALENDAR_LIMIT = 2;
const FREE_REMINDER_SLOTS = 1;
const PREMIUM_REMINDER_SLOTS = 999;

// ─── Helpers ─────────────────────────────────────────────────────────

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

// ─── Premium Status ──────────────────────────────────────────────────

export async function isPremium(): Promise<boolean> {
  const val = await getSetting(KEY_PREMIUM);
  return val === 'true' || val === '1';
}

export async function setPremium(aktiv: boolean): Promise<void> {
  await setSetting(KEY_PREMIUM, aktiv ? 'true' : 'false');
}

// ─── IAP ─────────────────────────────────────────────────────────────

export async function initIAP(): Promise<void> {
  await initConnection();

  purchaseUpdatedListener(async (purchase: Purchase) => {
    console.log('[PremiumService] Purchase successful:', purchase.productId);
    await setPremium(true);
    await finishTransaction({ purchase, isConsumable: false });
  });

  purchaseErrorListener((error: PurchaseError) => {
    console.warn('[PremiumService] Purchase error:', error.message, error.code);
  });
}

export async function getProductInfo(): Promise<any> {
  try {
    const products = await fetchProducts({ skus: [PREMIUM_SKU] });
    return (products && products.length > 0) ? products[0] : null;
  } catch (e) {
    console.warn('[PremiumService] getProductInfo error:', e);
    return null;
  }
}

export async function purchasePremium(): Promise<boolean> {
  try {
    await requestPurchase({ skus: [PREMIUM_SKU] } as any);
    // The purchaseUpdatedListener handles setting premium and finishing.
    return true;
  } catch (e) {
    console.warn('[PremiumService] purchasePremium error:', e);
    return false;
  }
}

// ─── Feature Gates ───────────────────────────────────────────────────

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
