// UN Comtrade public preview API: free, no key, about 1 request per second.
// Gives country-level trade (no company names) with value and weight,
// so we can work out the average price per tonne from each origin.

import { readCache, writeCache } from '../cache.js';

const API = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';
const REF = 'https://comtradeapi.un.org/files/v1/app/reference';

const ALIASES = {
  uae: 'United Arab Emirates', dubai: 'United Arab Emirates', 'abu dhabi': 'United Arab Emirates',
  russia: 'Russian Federation', usa: 'USA', us: 'USA', america: 'USA', 'united states': 'USA',
  uk: 'United Kingdom', britain: 'United Kingdom', england: 'United Kingdom',
  'ivory coast': "Côte d'Ivoire", 'cote divoire': "Côte d'Ivoire", tanzania: 'United Rep. of Tanzania',
  'south korea': 'Rep. of Korea', korea: 'Rep. of Korea', vietnam: 'Viet Nam', turkey: 'Türkiye',
  drc: 'Dem. Rep. of the Congo', 'dr congo': 'Dem. Rep. of the Congo', 'congo dr': 'Dem. Rep. of the Congo', saudi: 'Saudi Arabia', ksa: 'Saudi Arabia',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

let refs;
async function loadRefs() {
  if (refs) return refs;
  const [rep, par] = await Promise.all(
    ['Reporters.json', 'partnerAreas.json'].map((f) => fetch(`${REF}/${f}`).then((r) => r.json())),
  );
  // Drop groups (EU, World) and historical entries like "Rep. of Vietnam (...1974)".
  const countries = rep.results
    .filter((r) => !r.isGroup && !r.text.includes('(...') && !r.entryExpiredDate)
    .map((r) => ({ code: r.reporterCode, name: r.text, iso2: r.reporterCodeIsoAlpha2, iso3: r.reporterCodeIsoAlpha3 }));
  const names = new Map();
  for (const p of par.results) names.set(p.PartnerCode, p.text);
  for (const c of countries) names.set(c.code, c.name);
  refs = { countries, names, countryCodes: new Set(countries.map((c) => c.code)) };
  return refs;
}

export async function listCountries() {
  const { countries } = await loadRefs();
  return countries.map((c) => c.name).sort();
}

export async function resolveCountry(input) {
  const { countries } = await loadRefs();
  const q = norm(ALIASES[norm(input)] || input);
  return (
    countries.find((c) => norm(c.name) === q) ||
    countries.find((c) => norm(c.iso3 || '') === q || norm(c.iso2 || '') === q) ||
    countries.find((c) => norm(c.name).startsWith(q)) ||
    countries.find((c) => norm(c.name).includes(q)) ||
    null
  );
}

// 6-digit HS codes for a code: itself if it has 6+ digits, else all its 6-digit children
// (rice 1006 -> 100610, 100620, 100630, 100640). Shipment data needs 6 digits.
let hsList;
export async function sixDigitCodes(code) {
  const hs = String(code || '').replace(/\D/g, '');
  if (hs.length >= 6) return [hs.slice(0, 6)];
  hsList ||= fetch(`${REF}/HS.json`).then((r) => r.json()).then((j) => j.results.map((x) => x.id).filter((id) => /^\d{6}$/.test(id)));
  return (await hsList).filter((id) => id.startsWith(hs)).slice(0, 12);
}

// The preview API allows about one call per second, so all calls go through one queue.
let queue = Promise.resolve();
let lastCall = 0;
function comtradeGet(params) {
  const run = queue.then(async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      await sleep(Math.max(0, lastCall + 1100 - Date.now()));
      lastCall = Date.now();
      const res = await fetch(`${API}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 429) { await sleep(1500); continue; }
      if (!res.ok) throw new Error(`Comtrade ${res.status}`);
      const body = await res.json();
      if (body.error) throw new Error(`Comtrade: ${body.error}`);
      return body.data || [];
    }
    throw new Error('Comtrade rate limit, try again in a minute');
  });
  queue = run.catch(() => {});
  return run;
}

// Group rows by the other country and work out tonnes and USD per tonne.
function summarise(rows, otherKey, valueKey, { names, countryCodes }) {
  const byCountry = new Map();
  for (const r of rows) {
    const other = r[otherKey];
    if (!other || r.partner2Code || r.motCode || (r.customsCode && r.customsCode !== 'C00')) continue;
    // Skip groups (EU, World, "Areas nes") so nothing is counted twice.
    if (otherKey === 'reporterCode' ? !countryCodes.has(other) : !names.has(other)) continue;
    const kg = r.netWgt || (r.qtyUnitCode === 8 ? r.qty : 0) || 0;
    const usd = r[valueKey] || r.primaryValue || 0;
    const row = byCountry.get(other) || { country: names.get(other), usd: 0, kg: 0, usdWithKg: 0 };
    row.usd += usd;
    row.kg += kg;
    if (kg) row.usdWithKg += usd; // price only from rows that have a weight
    byCountry.set(other, row);
  }
  const origins = [...byCountry.values()]
    .filter((o) => o.usd > 0)
    .map((o) => ({
      country: o.country,
      usd: Math.round(o.usd),
      tonnes: o.kg ? Math.round(o.kg / 1000) : null,
      usdPerTonne: o.kg ? Math.round(o.usdWithKg / (o.kg / 1000)) : null,
    }))
    .sort((a, b) => b.usd - a.usd);

  const priced = origins.filter((o) => o.usdPerTonne);
  const totalT = priced.reduce((t, o) => t + o.tonnes, 0);
  const totalUsd = origins.reduce((s, o) => s + o.usd, 0);
  return { totalUsd, totalTonnes: Math.round(totalT), origins };
}

async function fetchYear(c, hs, year, ref) {
  // 1. What the destination country says it imported (values are CIF).
  const imports = await comtradeGet({ reporterCode: c.code, period: year, cmdCode: hs, flowCode: 'M' });
  // 2. What every other country says it exported there (values are FOB).
  //    Works even when the destination doesn't report, and FOB is what an exporter competes on.
  const exportsTo = await comtradeGet({ partnerCode: c.code, period: year, cmdCode: hs, flowCode: 'X' });
  const reported = summarise(imports, 'partnerCode', 'cifvalue', ref);
  const mirror = summarise(exportsTo, 'reporterCode', 'fobvalue', ref);
  return { year, reported, mirror, size: Math.max(reported.totalUsd, mirror.totalUsd) };
}

export async function getMarketPrices({ country, hs_code, year }) {
  const hs = String(hs_code || '').replace(/\D/g, '');
  if (![2, 4, 6].includes(hs.length)) return { error: `HS code must have 2, 4 or 6 digits, got "${hs_code}"` };
  const c = await resolveCountry(country);
  if (!c) return { error: `Unknown country "${country}"` };
  // Free but slow (about 1 request a second), and it only changes yearly: keep it a week.
  const key = `${c.code}|${hs}|${year || ''}`;
  const hit = await readCache('comtrade', key, 7);
  if (hit) return hit;
  const result = await fetchMarketPrices(c, hs, year);
  if (!result.empty && !result.error) await writeCache('comtrade', key, result);
  return result;
}

async function fetchMarketPrices(c, hs, year) {
  const ref = await loadRefs();

  let pick = null;
  if (year) {
    pick = await fetchYear(c, hs, Number(year), ref);
  } else {
    // The newest year is often only partly reported. Use it only if it looks
    // complete compared to the year before.
    const thisYear = new Date().getFullYear();
    for (const y of [thisYear - 1, thisYear - 2, thisYear - 3]) {
      const r = await fetchYear(c, hs, y, ref);
      if (!r.size) continue;
      if (!pick) { pick = r; continue; }
      if (pick.size < r.size * 0.6) pick = r;
      break;
    }
  }
  if (!pick?.size) return { country: c.name, hsCode: hs, empty: true, note: `No Comtrade data for HS ${hs} into ${c.name}` };
  return {
    country: c.name,
    hsCode: hs,
    year: pick.year,
    source: 'UN Comtrade',
    importsReportedByCountry: { basis: 'CIF', ...pick.reported },
    exportsReportedByOrigins: { basis: 'FOB', ...pick.mirror },
  };
}
