// Small JSON-file cache in .cache/, so repeated searches cost no credits and no waiting.

import { mkdir, readFile, writeFile } from 'node:fs/promises';

const CACHE_DIR = new URL('../.cache/', import.meta.url);
let writes = Promise.resolve(); // one write at a time so parallel saves don't overwrite each other

async function load(name) {
  try { return JSON.parse(await readFile(new URL(`${name}.json`, CACHE_DIR), 'utf8')); } catch { return {}; }
}

export async function readCache(name, key, days) {
  const hit = (await load(name))[key];
  return hit && Date.now() - hit.savedAt < days * 864e5 ? { ...hit.value, cachedAt: hit.savedAt } : null;
}

export function writeCache(name, key, value) {
  writes = writes.then(async () => {
    const cache = await load(name);
    cache[key] = { savedAt: Date.now(), value };
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(new URL(`${name}.json`, CACHE_DIR), JSON.stringify(cache, null, 2));
  }).catch((err) => console.warn('cache write failed:', err.message));
  return writes;
}
