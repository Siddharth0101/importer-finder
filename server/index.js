// Local server: every /api route, and the React app after `npm run build`.
// The routes live in api.js, which Netlify runs as a function (netlify/functions/api.mjs).

import express from 'express';
import { existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { ENV_FILE } from './keys.js';

try { process.loadEnvFile(ENV_FILE); } catch {} // .env is optional

// Imported after .env is loaded so the modules see the settings.
const { handle } = await import('./api.js');
const { hasGroqKey, agentModel } = await import('./groq.js');
const { providerLabel } = await import('./tools/shipments.js');

// API_PORT, not PORT: dev tools often set PORT for the React dev server.
const PORT = Number(process.env.API_PORT) || 3001;
const app = express();

// Node's request -> a web Request for api.js, and its web Response back out.
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'content-length']);
app.use('/api', async (req, res) => {
  const headers = Object.entries(req.headers).filter(([name, value]) => !HOP_BY_HOP.has(name) && typeof value === 'string');
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Readable.toWeb(req);
  const request = new Request(new URL(req.originalUrl, `http://localhost:${PORT}`), { method: req.method, headers, body, duplex: 'half' });
  const response = await handle(request, { ip: req.socket.remoteAddress });
  res.status(response.status);
  response.headers.forEach((value, name) => res.setHeader(name, value));
  if (!response.body) return res.end();
  res.flushHeaders();
  const stream = Readable.fromWeb(response.body);
  res.on('close', () => stream.destroy()); // the page went away: stop a running search stream
  stream.pipe(res);
});

// After `npm run build`, the same server also serves the React app.
const dist = fileURLToPath(new URL('../dist', import.meta.url));
if (existsSync(dist)) app.use(express.static(dist));

app.listen(PORT, () => {
  console.log(`API on http://localhost:${PORT}`);
  console.log(`  Groq agent: ${hasGroqKey() ? agentModel() : 'off (no GROQ_API_KEY)'}`);
  console.log(`  Shipment data: ${providerLabel()}`);
});
