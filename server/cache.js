// Small JSON cache, so repeated searches cost no credits and no waiting.
// Files in .cache/ on a computer; one Netlify Blobs store per name on Netlify (see storage.js).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { blobStore, usingBlobs } from './storage.js';

const CACHE_DIR = new URL('../.cache/', import.meta.url);
let writes = Promise.resolve(); // one write at a time so parallel saves don't overwrite each other

async function load(name) {
  try { return JSON.parse(await readFile(new URL(`${name}.json`, CACHE_DIR), 'utf8')); } catch { return {}; }
}

export async function readCache(name, key, days) {
  const hit = usingBlobs() ? await (await blobStore(`cache-${name}`)).get(key, { type: 'json' }) : (await load(name))[key];
  return hit && Date.now() - hit.savedAt < days * 864e5 ? { ...hit.value, cachedAt: hit.savedAt } : null;
}

export function writeCache(name, key, value) {
  if (usingBlobs()) {
    return blobStore(`cache-${name}`)
      .then((store) => store.setJSON(key, { savedAt: Date.now(), value }))
      .catch((err) => console.warn('cache write failed:', err.message));
  }
  writes = writes.then(async () => {
    const cache = await load(name);
    cache[key] = { savedAt: Date.now(), value };
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(new URL(`${name}.json`, CACHE_DIR), JSON.stringify(cache, null, 2));
  }).catch((err) => console.warn('cache write failed:', err.message));
  return writes;
}
