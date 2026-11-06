import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ENV_FILE, KEYS, cleanKey, keyStatus, saveKey } from './keys.js';

try { process.loadEnvFile(ENV_FILE); } catch {} // .env is optional

// Imported after .env is loaded so the modules see the settings.
const { runAgent, friendlyError } = await import('./agent.js');
const { listCountries } = await import('./tools/comtrade.js');
const { hasGroqKey, agentModel, checkGroqKey } = await import('./groq.js');
const { providerLabel, creditsLeft, importersWithPrices, moreShipments, shipmentsConnected, costs } = await import('./tools/shipments.js');
const { boldCredits } = await import('./tools/providers/bold.js');
const { listSearches } = await import('./tools/history.js');

// API_PORT, not PORT: dev tools often set PORT for the React dev server.
const PORT = Number(process.env.API_PORT) || 3001;
const app = express();

app.get('/api/status', async (req, res) => {
  res.json({ groq: hasGroqKey(), model: hasGroqKey() ? agentModel() : null, provider: providerLabel(), credits: await creditsLeft(), costs: costs() });
});

// API keys box. GET says which keys are set (last 4 characters only). POST checks a pasted
// key with a free call to the provider, then saves it to .env. Only from this computer and
// this app's own page, so another website can't change the keys.
const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const fromThisApp = (req) => LOCAL.has(req.socket.remoteAddress)
  && (!req.get('origin') || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.get('origin')));
const CHECKS = { groq: checkGroqKey, bold: boldCredits };

app.get('/api/keys', (req, res) => res.json(keyStatus()));

app.post('/api/keys', express.json({ limit: '4kb' }), async (req, res) => {
  if (!fromThisApp(req)) return res.status(403).json({ error: 'Keys can only be changed from this computer.' });
  const { name, value } = req.body || {};
  if (!Object.hasOwn(KEYS, name)) return res.status(400).json({ error: 'Unknown key.' });
  try {
    const key = cleanKey(name, value);
    await CHECKS[name](key);
    saveKey(name, key);
    res.json({ ok: true, keys: keyStatus() });
  } catch (err) {
    const unreachable = err.name === 'TimeoutError' || err.message === 'fetch failed'; // network down or slow
    res.status(400).json({ error: unreachable ? `Couldn't reach ${KEYS[name].label} to check the key. Try again.` : err.message });
  }
});

// Searches that can be reopened for free (their customs data is cached).
app.get('/api/recent', async (req, res) => {
  res.json(await listSearches());
});

app.get('/api/countries', async (req, res) => {
  try { res.json(await listCountries()); } catch (err) { res.status(502).json({ error: err.message }); }
});

app.get('/api/search', async (req, res) => {
  const product = String(req.query.product || '').trim();
  const country = String(req.query.country || '').trim();
  const hs = String(req.query.hs || '').replace(/\D/g, '');
  const confirm = req.query.confirm === '1';
  if (!product || !country) return res.status(400).json({ error: 'product and country are required' });

  // Server-sent events: each tool result goes to the screen as soon as it's ready.
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  let open = true;
  req.on('close', () => { open = false; });
  const emit = (type, data) => open && res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    await runAgent({ product, country, hs, confirm }, emit);
  } catch (err) {
    console.error(err);
    emit('error', { message: friendlyError(err) });
  }
  emit('done', {});
  res.end();
});

// Next page of one importer's shipments from customs data ("Load more shipments").
app.get('/api/importer-history', async (req, res) => {
  const q = (k) => String(req.query[k] || '').trim();
  if (!q('companyId') || !q('country') || !q('hs')) return res.status(400).json({ error: 'companyId, country and hs are required' });
  if (!shipmentsConnected()) return res.status(400).json({ error: 'Customs data not connected' });
  try {
    res.json(await moreShipments({ country: q('country'), hs_code: q('hs'), companyId: q('companyId'), page: Number(q('page')) || 2 }));
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: friendlyError(err) });
  }
});

// Next page of importers from customs data ("Load more importers").
app.get('/api/more-importers', async (req, res) => {
  const q = (k) => String(req.query[k] || '').trim();
  if (!q('country') || !q('hs')) return res.status(400).json({ error: 'country and hs are required' });
  try {
    res.json(await importersWithPrices({ country: q('country'), hs_code: q('hs'), page: Number(q('page')) || 2, confirm: q('confirm') === '1' }));
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: friendlyError(err) });
  }
});

// After `npm run build`, the same server also serves the React app.
const dist = fileURLToPath(new URL('../dist', import.meta.url));
if (existsSync(dist)) app.use(express.static(dist));

app.listen(PORT, () => {
  console.log(`API on http://localhost:${PORT}`);
  console.log(`  Groq agent: ${hasGroqKey() ? agentModel() : 'off (no GROQ_API_KEY)'}`);
  console.log(`  Shipment data: ${providerLabel()}`);
});
