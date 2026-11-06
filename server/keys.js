// API keys for Groq and BillOfLadingData: from importer-finder/.env on a computer, or from
// the host's environment variables (Netlify). The file is read again whenever it changes,
// so editing .env works without a restart.

import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const ENV_FILE = fileURLToPath(new URL('../.env', import.meta.url));

const KEYS = { groq: 'GROQ_API_KEY', bold: 'BOLD_API_KEY' };

// Taken before .env is loaded: a key set in the environment is used only when .env has none.
const fromShell = Object.fromEntries(Object.values(KEYS).map((env) => [env, process.env[env] || '']));
let readAt = null; // mtime of .env when it was last read

function sync() {
  let mtime = 0;
  try { mtime = statSync(ENV_FILE).mtimeMs; } catch {} // no .env (always so on Netlify)
  if (mtime === readAt) return;
  readAt = mtime;
  let vars = {};
  try { vars = parseEnv(readFileSync(ENV_FILE, 'utf8')); } catch {}
  for (const env of Object.values(KEYS)) {
    const value = String(vars[env] || '').trim() || fromShell[env];
    if (value) process.env[env] = value;
    else delete process.env[env];
  }
}

export function getKey(name) {
  sync();
  return process.env[KEYS[name]] || '';
}
