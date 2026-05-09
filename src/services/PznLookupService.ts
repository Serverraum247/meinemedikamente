import { getDatabase } from '../database/Database';
import { logger } from '../utils/Logger';

export interface PznLookupResult {
  name: string;
  hersteller?: string;
  darreichungsform?: string;
  pzn: string;
  found: boolean;
}

const BASE_URL = 'https://www.arzneimittel-datenbank.de';

// PZN-Cache-Tabelle sicherstellen
async function ensureCacheTable(): Promise<void> {
  const db = await getDatabase();
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS pzn_cache (
      pzn TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      hersteller TEXT,
      darreichungsform TEXT,
      lookup_date TEXT DEFAULT (datetime('now'))
    )
  `);
}

// Cache-Abfrage
export async function lookupPznCached(pzn: string): Promise<PznLookupResult | null> {
  await ensureCacheTable();
  const db = await getDatabase();
  const results = await db.executeSql(
    'SELECT * FROM pzn_cache WHERE pzn = ?', [pzn]
  );
  if (results[0].rows.length > 0) {
    const row = results[0].rows.item(0);
    return {
      name: row.name,
      hersteller: row.hersteller,
      darreichungsform: row.darreichungsform,
      pzn,
      found: true,
    };
  }
  return null;
}

// Im Cache speichern
async function cachePznResult(result: PznLookupResult): Promise<void> {
  const db = await getDatabase();
  await db.executeSql(
    'INSERT OR REPLACE INTO pzn_cache (pzn, name, hersteller, darreichungsform) VALUES (?, ?, ?, ?)',
    [result.pzn, result.name, result.hersteller ?? null, result.darreichungsform ?? null]
  );
}

// Online-Suche ueber arzneimittel-datenbank.de
export async function lookupPznOnline(pzn: string): Promise<PznLookupResult> {
  const notFound: PznLookupResult = { name: '', pzn, found: false };

  try {
    // Schritt 1: Homepage laden → CSRF-Token holen
    const initResp = await fetch(BASE_URL + '/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MeineMedikamente/1.0)',
      },
    });
    const initHtml = await initResp.text();
    const csrfMatch = initHtml.match(/csrf-token"[^>]*content="([^"]+)"/);
    if (!csrfMatch) {
      logger.warn('[PznLookup] Kein CSRF-Token gefunden');
      return notFound;
    }
    const csrfToken = csrfMatch[1];

    // Schritt 2: Suche per POST
    const searchResp = await fetch(BASE_URL + '/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRF-TOKEN': csrfToken,
        'Referer': BASE_URL + '/',
        'User-Agent': 'Mozilla/5.0 (compatible; MeineMedikamente/1.0)',
      },
      body: 'q=' + encodeURIComponent(pzn),
    });

    // Pruefen ob Redirect zur Produktseite erfolgt ist
    const finalUrl = searchResp.url || '';
    let finalHtml = '';

    if (finalUrl.includes('/produkt/')) {
      // Redirect hat funktioniert, HTML direkt lesen
      finalHtml = await searchResp.text();
    } else {
      // Kein Redirect – versuche Produktlink aus der Antwort zu extrahieren
      const searchText = await searchResp.text();
      const linkRegex = new RegExp('href="(/produkt/[^"]*' + pzn + '[^"]*)"');
      const linkMatch = searchText.match(linkRegex);
      if (linkMatch) {
        const prodResp = await fetch(BASE_URL + linkMatch[1]);
        finalHtml = await prodResp.text();
      } else {
        logger.warn('[PznLookup] Kein Produktlink in Antwort gefunden');
        return notFound;
      }
    }

    // Produktdaten aus HTML extrahieren
    const titleMatch =
      finalHtml.match(/property="og:title"[^>]*content="([^"]+)"/) ||
      finalHtml.match(/content="([^"]+)"[^>]*property="og:title"/);
    const herstellerMatch = finalHtml.match(/Hersteller:\s*([^<,\n]+)/);
    const formMatch = finalHtml.match(/Darreichungsform:\s*([^<,\n]+)/);

    if (titleMatch) {
      // og:title: "ASS 100 HEXAL, 50 St | Arzneimittel-Datenbank"
      let name = titleMatch[1]
        .replace(/\s*\|\s*Arzneimittel-Datenbank\s*$/, '')
        .trim();
      const result: PznLookupResult = {
        name,
        hersteller: herstellerMatch ? herstellerMatch[1].trim() : undefined,
        darreichungsform: formMatch ? formMatch[1].trim() : undefined,
        pzn,
        found: true,
      };
      // Im Cache speichern
      await cachePznResult(result);
      logger.log('[PznLookup] Gefunden:', name);
      return result;
    }

    logger.warn('[PznLookup] Kein og:title in Produktseite');
    return notFound;
  } catch (e) {
    logger.warn('[PznLookup] Fehler bei PZN-Suche:', e);
    return notFound;
  }
}

/**
 * Hauptfunktion: Zuerst Cache pruefen, dann Online-Suche.
 * PZN wird auf 8 Stellen gepadded (07402204).
 */
export async function lookupPzn(pzn: string): Promise<PznLookupResult> {
  const normalizedPzn = pzn.padStart(8, '0');

  // Cache zuerst
  const cached = await lookupPznCached(normalizedPzn);
  if (cached) {
    logger.log('[PznLookup] Cache-Treffer:', cached.name);
    return cached;
  }

  // Online-Suche
  return lookupPznOnline(normalizedPzn);
}
