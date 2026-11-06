// API keys for Groq and BillOfLadingData. Two ways to set them, both stored in .env:
// edit importer-finder/.env by hand, or paste them in the app (POST /api/keys writes .env).
// The file is read again whenever it changes, so either way works without a restart.

import { readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const ENV_FILE = fileURLToPath(new URL('../.env', import.meta.url));

export const KEYS = {
  groq: { env: 'GROQ_API_KEY', label: 'Groq' },
  bold: { env: 'BOLD_API_KEY', label: 'BillOfLadingData' },
};

// Taken before .env is loaded: a key set in the shell is used only when .env has none.
const fromShell = Object.fromEntries(Object.values(KEYS).map(({ env }) => [env, process.env[env] || '']));
let readAt = null; // mtime of .env when it was last read

function sync() {
  let mtime = 0;
  try { mtime = statSync(ENV_FILE).mtimeMs; } catch {} // no .env yet
  if (mtime === readAt) return;
  readAt = mtime;
  let vars = {};
  try { vars = parseEnv(readFileSync(ENV_FILE, 'utf8')); } catch {}
  for (const { env } of Object.values(KEYS)) {
    const value = String(vars[env] || '').trim() || fromShell[env];
    if (value) process.env[env] = value;
    else delete process.env[env];
  }
}

export function getKey(name) {
  sync();
  return process.env[KEYS[name].env] || '';
}

// What the app may see: whether each key is set, and its last 4 characters. Never the key itself.
export function keyStatus() {
  return Object.fromEntries(Object.entries(KEYS).map(([name, { label }]) => {
    const key = getKey(name);
    return [name, { label, set: Boolean(key), hint: key.slice(-4) }];
  }));
}

// Pasted text -> a key that is safe to write as one .env line.
export function cleanKey(name, value) {
  const key = String(value || '').trim();
  if (!/^[\w.-]{8,200}$/.test(key)) throw new Error(`That doesn't look like a ${KEYS[name].label} key.`);
  return key;
}

// Sets NAME=key in .env and keeps every other line as it is.
export function saveKey(name, key) {
  const { env } = KEYS[name];
  let text = '';
  try { text = readFileSync(ENV_FILE, 'utf8'); } catch {}
  const isKeyLine = new RegExp(`^\\s*(export\\s+)?${env}\\s*=`);
  const out = [];
  let written = false;
  for (const line of text.split(/\r?\n/)) {
    if (!isKeyLine.test(line)) out.push(line);
    else if (!written) { out.push(`${env}=${key}`); written = true; } // replace the first, drop repeats
  }
  if (!written) {
    if (out.at(-1) === '') out.pop();
    out.push(`${env}=${key}`, '');
  }
  // Write a new file and swap it in, so a crash can't leave half a .env behind.
  writeFileSync(`${ENV_FILE}.tmp`, out.join('\n'), { mode: 0o600 });
  renameSync(`${ENV_FILE}.tmp`, ENV_FILE);
  readAt = null;
}
