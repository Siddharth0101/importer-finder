// Importers with the price they pay, from customs data (BillOfLadingData).
// For each importer on the page we also load its latest shipments, which is
// where "price they pay", supplier and origin come from.

import { getKey } from '../keys.js';
import { resolveCountry, sixDigitCodes } from './comtrade.js';
import { boldCredits, boldImporters, boldIsCached, boldShipments, boldShipmentsCached, hasBoldKey, importersPerPage, shipmentsPerImporter } from './providers/bold.js';

export const shipmentsConnected = () => hasBoldKey();
export const providerLabel = () => (hasBoldKey() ? 'BillOfLadingData' : 'not connected');

// Credits left on the BillOfLadingData plan; checked at most every 20 s (the call is free)
// and straight away when the key changes.
let credits = { at: 0, key: '', value: null };
export async function creditsLeft() {
  const key = getKey('bold');
  if (!key) return null;
  if (key !== credits.key || Date.now() - credits.at > 20_000) credits = { at: Date.now(), key, value: await boldCredits().catch(() => null) };
  return credits.value;
}

async function lookup(country, hs_code) {
  const c = await resolveCountry(country);
  if (!c?.iso2) throw new Error(`Unknown country "${country}"`);
  const hsCodes = await sixDigitCodes(hs_code);
  if (!hsCodes.length) throw new Error(`No 6-digit HS codes found for ${hs_code}`);
  return { iso2: c.iso2, hsCodes };
}

// Credits a page would cost right now: nothing if all of it is cached.
async function costOfPage(iso2, hsCodes, page) {
  if (!(await boldIsCached({ iso2, hsCodes, page }))) return costs().importersPage;
  const { importers } = await boldImporters({ iso2, hsCodes, page }); // cached, free
  const missing = await Promise.all(importers.map((imp) => boldShipmentsCached({ iso2, hsCodes, companyId: imp.id }).then((hit) => !hit)));
  return missing.filter(Boolean).length * shipmentsPerImporter();
}

// Without `confirm`, nothing that costs credits is fetched: the caller gets
// { needsConfirm, cost } and asks the user first. Cached pages are always free.
export async function importersWithPrices({ country, hs_code, page = 1, confirm = false }) {
  if (!hasBoldKey()) {
    return { connected: false, note: 'Customs data not connected. Add BOLD_API_KEY in .env, or in Netlify\'s environment variables.' };
  }
  const { iso2, hsCodes } = await lookup(country, hs_code);
  const cost = confirm ? 0 : await costOfPage(iso2, hsCodes, page);
  if (cost > 0) return { connected: true, needsConfirm: true, cost, hsCodes };
  const list = await boldImporters({ iso2, hsCodes, page });
  const importers = await Promise.all(
    list.importers.map(async (imp) => {
      const s = await boldShipments({ iso2, hsCodes, companyId: imp.id });
      const latest = s.shipments.find((x) => x.usdPerTonne);
      return {
        ...imp,
        // The API leaves the code empty for some countries (e.g. "CONGO DR").
        countryCode: imp.countryCode || (await resolveCountry(imp.country).catch(() => null))?.iso2 || '',
        source: 'customs',
        shipments: s.shipments,
        shipmentsLoaded: s.page * s.pageSize,
        lastUsdPerTonne: latest?.usdPerTonne ?? null,
        lastSupplier: latest?.supplier || s.shipments[0]?.supplier || '',
        lastOrigin: latest?.origin || imp.origins[0] || '',
        lastDate: s.shipments[0]?.date || '',
      };
    }),
  );
  return {
    connected: true,
    provider: 'BillOfLadingData',
    hsCodes,
    total: list.total,
    page,
    hasMore: page * importersPerPage() < list.total,
    importers,
  };
}

// Next page of one importer's shipments (row click -> "Load more").
export async function moreShipments({ country, hs_code, companyId, page }) {
  const { iso2, hsCodes } = await lookup(country, hs_code);
  const s = await boldShipments({ iso2, hsCodes, companyId, page });
  return { shipments: s.shipments, total: s.total, shipmentsLoaded: s.page * s.pageSize };
}

export const costs = () => ({
  importersPerPage: importersPerPage(),
  importersPage: importersPerPage() * 15 + importersPerPage() * shipmentsPerImporter(),
  shipmentsPage: shipmentsPerImporter(),
});
