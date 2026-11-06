// BillOfLadingData partner API (https://www.billofladingdata.com/api-documentation).
// Customs records: who imported what, from which supplier, when, how much, for how much.
//
// Credit cost (measured on the sandbox plan):
//   all-importers     15 credits per importer returned
//   shipping-records   1 credit per shipment returned
//   insights, credit-usage, search-filters: free
// Everything is cached on disk for a week so a repeated search costs nothing.

import { readCache, writeCache } from '../../cache.js';
import { getKey } from '../../keys.js';

const BASE = 'https://tradedata.billofladingdata.com/partner-api';
const CACHE_DAYS = 7;

export const hasBoldKey = () => Boolean(getKey('bold'));
export const importersPerPage = () => Number(process.env.BOLD_IMPORTERS_PER_PAGE) || 5;
export const shipmentsPerImporter = () => Number(process.env.BOLD_SHIPMENTS_PER_IMPORTER) || 5;

async function call(path, body) {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'api-key': getKey('bold'), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`BillOfLadingData ${res.status}: ${text.slice(0, 200)}`); }
  if (!res.ok || json.code !== 200) throw new Error(`BillOfLadingData: ${json.message || `HTTP ${res.status}`}`);
  return json.data;
}

async function cached(name, key, fn) {
  const hit = await readCache(name, key, CACHE_DAYS);
  if (hit) return hit;
  const value = await fn();
  await writeCache(name, key, value);
  return value;
}

export async function boldCredits() {
  const data = await call('credit-usage', {});
  return data.credits?.data_credits || null; // { total, used, remaining }
}

const tonnesOf = (qty, unit) => {
  const u = String(unit || '').toUpperCase();
  if (!qty || qty <= 0) return null;
  if (['KG', 'KGS', 'KGM'].includes(u)) return qty / 1000;
  if (['MT', 'MTS', 'TNE', 'TON', 'TONS', 'T'].includes(u)) return qty;
  return null; // bags, units, ... can't turn into a price per tonne
};

const dateOf = (n) => {
  const s = String(n || '');
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s;
};

// A shipment record as the API sends it. The only number we work out ourselves is
// the price per tonne: value / quantity, when the quantity is in kg or tonnes.
function toShipment(r) {
  const quantity = r.manifest_qty > 0 ? r.manifest_qty : null;
  const unit = r.manifest_units || '';
  const tonnes = tonnesOf(quantity, unit) ?? tonnesOf(r.weight, r.weight_unit);
  const value = typeof r.amount === 'number' ? r.amount : null;
  return {
    date: dateOf(r.bydate),
    supplier: r.shipper_name || '',
    origin: r.or_country || r.country_exp_en || '',
    product: String(r.products || '').replace(/\s+/g, ' ').trim(),
    hsCode: r.hs_code || '',
    quantity,
    unit,
    value,
    usdPerTonne: tonnes && value > 0 ? Math.round(value / tonnes) : null,
    loadingPort: r.start_port || '',
    billOfLading: r.bill_of_lading_nbr || '',
  };
}

// Shipments cached before this format had { tonnes, usd } instead of { quantity, unit, value }.
const normalise = (s) => ('value' in s ? s : { ...s, quantity: s.tonnes ?? null, unit: s.tonnes != null ? 'MT' : '', value: s.usd ?? null });

const realName = (s) => (s && s !== '-' ? s : '');

const importersKey = (iso2, hsCodes, page) => `${iso2}|${hsCodes.join(',')}|${page}|${importersPerPage()}`;

// True when this page of importers is already cached, i.e. opening it costs nothing.
export async function boldIsCached({ iso2, hsCodes, page = 1 }) {
  return Boolean(await readCache('bold-importers', importersKey(iso2, hsCodes, page), CACHE_DAYS));
}

// One page of the biggest importers of these HS codes into a country (15 credits each).
export function boldImporters({ iso2, hsCodes, page = 1 }) {
  const pageSize = importersPerPage();
  return cached('bold-importers', importersKey(iso2, hsCodes, page), async () => {
    const data = await call('all-importers', { hs_codes: hsCodes, import_countries: [iso2], page_no: page, page_size: pageSize });
    return {
      total: data.total,
      page,
      importers: (data.records || []).map((r) => ({
        id: r.id,
        name: r.name,
        country: r.country?.name || '',
        countryCode: r.country?.code || '',
        website: /\./.test(realName(r.domain)) ? `https://${r.domain.replace(/^https?:\/\//, '')}` : '',
        totalUsd: Math.round(r.total_import_value || 0),
        totalShipments: r.total_shipments || 0,
        totalSuppliers: r.total_suppliers || 0,
        origins: (r.export_countries || []).map((c) => c.name).filter(Boolean),
        ports: r.unloading_ports || [],
      })),
    };
  });
}

const shipmentsKey = (iso2, hsCodes, companyId, page, pageSize) => `${iso2}|${hsCodes.join(',')}|${companyId}|${page}|${pageSize}`;

// True when this page of an importer's shipments is already cached.
export async function boldShipmentsCached({ iso2, hsCodes, companyId, page = 1, pageSize = shipmentsPerImporter() }) {
  return Boolean(await readCache('bold-shipments', shipmentsKey(iso2, hsCodes, companyId, page, pageSize), CACHE_DAYS));
}

// One importer's shipments, newest first (1 credit each), every record the API returns.
export async function boldShipments({ iso2, hsCodes, companyId, page = 1, pageSize = shipmentsPerImporter() }) {
  const result = await cached('bold-shipments', shipmentsKey(iso2, hsCodes, companyId, page, pageSize), async () => {
    const data = await call('shipping-records', {
      type: 'imp', hs_codes: hsCodes, import_countries: [iso2], company_ids: [companyId], page_no: page, page_size: pageSize,
    });
    return { total: data.total, page, pageSize, shipments: (data.records || []).map(toShipment) };
  });
  return { ...result, shipments: result.shipments.map(normalise) };
}
