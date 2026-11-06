// The agent, built with LangChain's createAgent and a Groq model.
// Its job is small: understand the product (also in Hindi/Hinglish, e.g. "chawal"),
// pick the HS code, and call find_importers. The tool sends the importer list
// and the market price straight to the screen.
// Without a Groq key the tool runs directly with a built-in HS code list.

import { createAgent, tool, modelCallLimitMiddleware, modelRetryMiddleware } from 'langchain';
import { ChatGroq } from '@langchain/groq';
import * as z from 'zod';
import { agentModel, groqKey, hasGroqKey } from './groq.js';
import { getMarketPrices } from './tools/comtrade.js';
import { importersWithPrices } from './tools/shipments.js';
import { recordSearch } from './tools/history.js';

const SYSTEM = `You help an exporter find importers.
The user gives a product (maybe in Hindi or Hinglish, e.g. "chawal" = rice, "gehu" = wheat) and a destination country.
1. Work out the product in plain English and its HS code: the 4-digit heading (rice = 1006, wheat = 1001, sugar = 1701),
   or a 6-digit code when the product is clearly one sub-type (basmati or milled rice = 100630, broken rice = 100640).
2. Call find_importers exactly once.
3. After it returns, reply with the single word: done`;

// Product -> HS heading, for the no-key mode only. The agent picks codes itself.
const HS_HINTS = {
  rice: '1006', chawal: '1006', basmati: '100630', wheat: '1001', gehu: '1001', maize: '1005', corn: '1005',
  sugar: '1701', cheeni: '1701', tea: '0902', coffee: '0901', onion: '070310', pyaaz: '070310', potato: '0701',
  chickpeas: '071320', lentils: '071340', dal: '0713', 'black pepper': '090411', cumin: '090931', turmeric: '091030',
  cashew: '080132', sesame: '120740', 'soybean meal': '2304', 'palm oil': '1511', cotton: '5201',
};

// Turns Groq's raw JSON errors into one readable line for the screen.
export function friendlyError(err) {
  const msg = err?.message || String(err);
  const model = msg.match(/model `([^`]+)`/)?.[1] || 'the model';
  if (/tokens per day|TPD/i.test(msg)) {
    const wait = msg.match(/try again in ([\dhms.]+)/i)?.[1]?.replace(/\.$/, '');
    return `Groq free daily limit used up for ${model}${wait ? `, resets in ${wait}` : ''}. Try later or upgrade the Groq plan.`;
  }
  if (/429|rate limit/i.test(msg)) return 'Groq per-minute limit hit (free tier: 8,000 tokens a minute). Wait a minute and search again.';
  return msg;
}

function makeSteps(emit) {
  let n = 0;
  return {
    start: (label) => { const id = ++n; emit('step', { id, status: 'running', label }); return id; },
    update: (id, status, label, detail) => emit('step', { id, status, label, detail }),
  };
}

// Runs one data source and reports progress. Never throws: errors come back as { error }.
async function part(steps, label, fn) {
  const id = steps.start(label);
  try {
    const onWait = (s, attempt) => steps.update(id, 'running', `${label} (Groq per-minute limit, waiting ${s}s, try ${attempt + 1} of 3)`);
    const result = await fn({ onWait });
    steps.update(id, result.error ? 'error' : 'done', label, result.error || result.note);
    return result;
  } catch (err) {
    const message = friendlyError(err);
    steps.update(id, 'error', label, message);
    return { error: message };
  }
}

// Cheapest big origins, as one line of "price to beat".
function benchmarkFrom(market) {
  const fob = market?.exportsReportedByOrigins;
  if (!fob?.origins?.length) return null;
  const minTonnes = Math.max(100, (fob.totalTonnes || 0) * 0.01);
  const origins = fob.origins
    .filter((o) => o.usdPerTonne && o.tonnes >= minTonnes)
    .slice(0, 5)
    .sort((a, b) => a.usdPerTonne - b.usdPerTonne)
    .map(({ country, usdPerTonne, tonnes }) => ({ country, usdPerTonne, tonnes }));
  return { country: market.country, hsCode: market.hsCode, year: market.year, basis: 'FOB', origins };
}

// Importers from customs data (BillOfLadingData). A search that would spend credits
// stops with a 'confirm' event unless `confirm` is set.
export async function findImporters({ product, country, hs_code }, steps, emit, { confirm = false } = {}) {
  const args = { product, country, hs_code };
  // Each part goes to the screen as soon as it is ready; the importer list doesn't wait for prices.
  const marketDone = part(steps, 'Market prices', () => getMarketPrices({ country, hs_code }))
    .then((market) => emit('benchmark', { args, benchmark: benchmarkFrom(market), note: market.error || market.note }));
  const list = await part(steps, 'Importers from customs data', () => importersWithPrices({ country, hs_code, confirm }));
  const finish = async (result) => { await marketDone; return result; };
  if (list.needsConfirm) {
    emit('confirm', { args, cost: list.cost });
    return finish({ needsConfirm: true });
  }
  if (list.importers?.length) await recordSearch({ product, country, hs_code, total: list.total }).catch(() => {});
  const importers = list.importers || [];
  emit('importers', {
    args,
    importers,
    source: 'customs',
    total: list.total ?? importers.length,
    page: list.page || 1,
    hasMore: Boolean(list.hasMore),
    error: list.error || (list.connected === false ? list.note : null),
  });
  return finish({ importersFound: importers.length, withPrice: importers.filter((i) => i.lastUsdPerTonne).length });
}

// `hs` skips the LLM (saved searches, or after the user confirmed spending credits).
// `options.model` lets tests pass a fake LangChain model instead of Groq.
export async function runAgent({ product, country, hs, confirm = false }, emit, options = {}) {
  const steps = makeSteps(emit);

  if (hs) {
    const id = steps.start('Understanding the product');
    steps.update(id, 'done', `${product} · HS ${hs}`);
    await findImporters({ product, country, hs_code: hs }, steps, emit, { confirm });
    return;
  }

  if (!options.model && !hasGroqKey()) {
    const p = product.trim().toLowerCase();
    const hs = /^\d{2,6}$/.test(p) ? p : HS_HINTS[p] || HS_HINTS[p.replace(/s$/, '')];
    if (!hs) {
      emit('error', { message: `Don't know the HS code for "${product}". Type an HS code (e.g. 1006), or add a Groq key (API keys button) so the agent can work it out.` });
      return;
    }
    await findImporters({ product, country, hs_code: hs }, steps, emit, { confirm });
    return;
  }

  const thinking = steps.start('Understanding the product');
  let called = false;
  const findTool = tool(
    async (args) => {
      if (called) return JSON.stringify({ note: 'Already done. Reply with: done' });
      called = true;
      steps.update(thinking, 'done', `${args.product} · HS ${args.hs_code}`);
      return JSON.stringify(await findImporters(args, steps, emit, { confirm }));
    },
    {
      name: 'find_importers',
      description: 'Finds importers of a product in a country, with market prices and any shipment history. Call once.',
      schema: z.object({
        product: z.string().describe('Product in plain English, e.g. "rice"'),
        country: z.string().describe('Destination country, e.g. "Kenya"'),
        hs_code: z.string().describe('4-digit HS heading, e.g. "1006"'),
      }),
    },
  );

  const model = options.model || new ChatGroq({
    apiKey: groqKey(),
    model: agentModel(),
    temperature: 0,
    ...(agentModel().startsWith('openai/gpt-oss') ? { reasoningEffort: 'low' } : {}),
  });
  const agent = createAgent({
    model,
    tools: [findTool],
    systemPrompt: SYSTEM,
    middleware: [
      modelCallLimitMiddleware({ runLimit: 3, exitBehavior: 'end' }),
      // Groq free tier: 8K tokens per minute. Wait and retry; a used-up daily quota won't come back, so don't.
      modelRetryMiddleware({
        maxRetries: 3,
        initialDelayMs: 8000,
        backoffFactor: 2,
        maxDelayMs: 40000,
        retryOn: (err) => /429|rate limit/i.test(err.message) && !/tokens per day/i.test(err.message),
        onFailure: 'error',
      }),
    ],
  });

  await agent.invoke({ messages: [{ role: 'user', content: `Product: ${product}\nCountry: ${country}` }] });
  if (!called) {
    steps.update(thinking, 'error', 'Understanding the product');
    emit('error', { message: 'The agent did not run the search. Try again with a clearer product name.' });
  }
}
