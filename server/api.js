// Every /api route as one web-standard handler: a Request in, a Response out.
// Locally Express calls it (server/index.js); on Netlify it runs as a function
// (netlify/functions/api.mjs) with `hosted: true`.

import { createHash, timingSafeEqual } from 'node:crypto';
import { friendlyError, runAgent } from './agent.js';
import { agentModel, checkGroqKey, hasGroqKey } from './groq.js';
import { KEYS, cleanKey, keyStatus, saveKey } from './keys.js';
import { storageCheck } from './storage.js';
import { listCountries } from './tools/comtrade.js';
import { listSearches } from './tools/history.js';
import { boldCredits } from './tools/providers/bold.js';
import { costs, creditsLeft, importersWithPrices, moreShipments, providerLabel, shipmentsConnected } from './tools/shipments.js';

const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers });

// Server-sent events: each tool result goes to the screen as soon as it's ready.
function sse(run) {
  const encoder = new TextEncoder();
  let open = true;
  const body = new ReadableStream({
    start(controller) {
      const emit = (type, data) => {
        if (!open) return;
        try { controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { open = false; }
      };
      Promise.resolve()
        .then(() => run(emit))
        .catch((err) => {
          console.error(err);
          emit('error', { message: friendlyError(err) });
        })
        .finally(() => {
          emit('done', {});
          if (open) { open = false; controller.close(); }
        });
    },
    cancel() { open = false; }, // the page closed the stream
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}

// The routes that spend credits or show customs data need APP_PASSWORD: always on the
// hosted site, where anyone with the link could open them, and locally only when it is set.
// The browser asks for it in its own login box; any user name works.
const digest = (s) => createHash('sha256').update(s).digest();
function lockReason(request, hosted) {
  const password = process.env.APP_PASSWORD;
  if (!password) return hosted ? 'setup' : null;
  const [scheme, encoded = ''] = (request.headers.get('authorization') || '').split(' ');
  const given = scheme === 'Basic' ? Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':') : '';
  return timingSafeEqual(digest(given), digest(password)) ? null : 'password';
}
const LOCKED = {
  setup: 'Set APP_PASSWORD in Netlify → Project configuration → Environment variables, then redeploy. It keeps strangers from spending your credits.',
  password: 'This app needs its password. Reload the page and enter it in the login box (any user name).',
};
const denied = (reason) => (reason === 'password'
  ? json({ error: LOCKED.password }, 401, { 'WWW-Authenticate': 'Basic realm="Importer Finder", charset="UTF-8"' })
  : json({ error: LOCKED.setup }, 503));

// API keys box. Keys change only from this computer and this app's own page, so another
// website can't change them; a pasted key is checked with a free call before it is saved.
const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const fromThisApp = (request, ip) => LOCAL.has(ip)
  && (!request.headers.get('origin') || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(request.headers.get('origin')));
const CHECKS = { groq: checkGroqKey, bold: boldCredits };

async function saveKeyRoute({ request, ip, hosted }) {
  if (hosted) return json({ error: 'On the hosted site the keys come from Netlify → Environment variables. Change them there and redeploy.' }, 403);
  if (!fromThisApp(request, ip)) return json({ error: 'Keys can only be changed from this computer.' }, 403);
  if (!(request.headers.get('content-type') || '').includes('application/json')) return json({ error: 'Unknown key.' }, 400);
  const text = await request.text();
  if (text.length > 4096) return json({ error: 'Too long.' }, 413);
  let name;
  let value;
  try { ({ name, value } = JSON.parse(text)); } catch {}
  if (!Object.hasOwn(KEYS, name)) return json({ error: 'Unknown key.' }, 400);
  try {
    const key = cleanKey(name, value);
    await CHECKS[name](key);
    saveKey(name, key);
    return json({ ok: true, keys: keyStatus() });
  } catch (err) {
    const unreachable = err.name === 'TimeoutError' || err.message === 'fetch failed'; // network down or slow
    return json({ error: unreachable ? `Couldn't reach ${KEYS[name].label} to check the key. Try again.` : err.message }, 400);
  }
}

const PUBLIC = {
  'GET /api/status': async () => json({
    groq: hasGroqKey(),
    model: hasGroqKey() ? agentModel() : null,
    provider: providerLabel(),
    credits: await creditsLeft(),
    costs: costs(),
    storage: await storageCheck(),
  }),
  'GET /api/countries': async () => json(await listCountries()),
  // Which keys are set (last 4 characters only). Read-only on the hosted site.
  'GET /api/keys': ({ hosted }) => json({ ...keyStatus(), editable: !hosted }),
  'POST /api/keys': saveKeyRoute,
};

const PRIVATE = {
  // Searches that can be reopened for free (their customs data is cached).
  'GET /api/recent': async () => json(await listSearches()),

  'GET /api/search': ({ q }) => {
    const product = q('product');
    const country = q('country');
    if (!product || !country) return json({ error: 'product and country are required' }, 400);
    const hs = q('hs').replace(/\D/g, '');
    return sse((emit) => runAgent({ product, country, hs, confirm: q('confirm') === '1' }, emit));
  },

  // Next page of one importer's shipments from customs data ("Load more shipments").
  'GET /api/importer-history': async ({ q }) => {
    if (!q('companyId') || !q('country') || !q('hs')) return json({ error: 'companyId, country and hs are required' }, 400);
    if (!shipmentsConnected()) return json({ error: 'Customs data not connected' }, 400);
    return json(await moreShipments({ country: q('country'), hs_code: q('hs'), companyId: q('companyId'), page: Number(q('page')) || 2 }));
  },

  // Next page of importers from customs data ("Load more importers").
  'GET /api/more-importers': async ({ q }) => {
    if (!q('country') || !q('hs')) return json({ error: 'country and hs are required' }, 400);
    return json(await importersWithPrices({ country: q('country'), hs_code: q('hs'), page: Number(q('page')) || 2, confirm: q('confirm') === '1' }));
  },
};

export async function handle(request, { ip = '', hosted = false } = {}) {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname.replace(/\/+$/, '')}`;
  const q = (k) => String(url.searchParams.get(k) || '').trim();
  const run = PUBLIC[route] || PRIVATE[route];
  if (!run) return json({ error: 'Not found' }, 404);
  if (PRIVATE[route]) {
    const reason = lockReason(request, hosted);
    // A search is an event stream: say why in its own events, so the page can show it.
    if (reason) return route === 'GET /api/search' ? sse((emit) => emit('error', { message: LOCKED[reason] })) : denied(reason);
  }
  try {
    return await run({ request, url, q, ip, hosted });
  } catch (err) {
    console.error(err);
    return json({ error: friendlyError(err) }, 502);
  }
}
