// Searches whose customs data is cached, so they can be reopened for free.
// Kept for as long as the cache is (7 days). A file locally, Netlify Blobs on Netlify.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { blobStore, usingBlobs } from '../storage.js';

const FILE = new URL('../../.cache/searches.json', import.meta.url);
const KEEP_DAYS = 7;

const keyOf = (s) => `${s.product}|${s.country}|${s.hs_code}`.toLowerCase();

async function load() {
  if (usingBlobs()) return (await (await blobStore('history')).get('searches', { type: 'json' })) || [];
  try { return JSON.parse(await readFile(FILE, 'utf8')); } catch { return []; }
}

async function save(list) {
  if (usingBlobs()) return (await blobStore('history')).setJSON('searches', list);
  await mkdir(new URL('.', FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(list, null, 2));
}

export async function listSearches() {
  const fresh = Date.now() - KEEP_DAYS * 864e5;
  return (await load()).filter((s) => s.at > fresh);
}

export async function recordSearch({ product, country, hs_code, total }) {
  const entry = { product, country, hs_code, total, at: Date.now() };
  await save([entry, ...(await load()).filter((s) => keyOf(s) !== keyOf(entry))].slice(0, 20));
}
