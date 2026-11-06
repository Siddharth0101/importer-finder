# Importer Finder

Type a product (e.g. `rice`, or `chawal`) and a country (e.g. `Kenya`). The screen shows API data only:

- **Market price** (UN Comtrade API): what the main origin countries charged per tonne, FOB
- **Importer list** (BillOfLadingData API): name, country, last supplier and origin, last buy, shipments, total value, exactly as the API returns them
- **Click a row**: the importer's totals and its shipment records (date, supplier, origin, product, quantity, value)
- **Price per tonne** is the only number worked out here: value ÷ quantity of a record, when the quantity is in KG or MT
- **Sort**, **filter** and **export CSV**; anything that spends credits asks first; saved searches reopen free for 7 days

Stack: React (Vite) + Express + LangChain (`createAgent`) + Groq.

## Run it

```bash
npm install
cp .env.example .env   # then put your keys in .env, or paste them in the app (API keys button)
npm run dev            # React on http://localhost:5173, API on :3001
```

Production: `npm run build && npm start` (Express serves the built React app on :3001).

Netlify: `netlify.toml` builds the React app into `dist/` and runs every `/api` route as one function (`netlify/functions/api.mjs`, the same code as the local server, `server/api.js`). Set `GROQ_API_KEY`, `BOLD_API_KEY` and `APP_PASSWORD` under Project configuration → Environment variables, then redeploy. Online, the cache and saved searches live in Netlify Blobs, the routes that spend credits ask for `APP_PASSWORD` (the browser's login box, any user name), and the API keys button only shows which keys are set.

## .env

| Key | What it does |
|---|---|
| `GROQ_API_KEY` | From https://console.groq.com/keys. The agent turns the product name (also Hindi/Hinglish) into an HS code. Without it, a small built-in list is used |
| `GROQ_AGENT_MODEL` | Model that runs the agent (default `openai/gpt-oss-120b`) |
| `BOLD_API_KEY` | BillOfLadingData key (free account, 1,000 credits). Turns on importer prices and past deals from customs data |
| `API_PORT` | Express port (default 3001) |
| `APP_PASSWORD` | Password for searches and customs data. Optional locally; required on Netlify, so strangers with the link can't spend your credits |

The two keys can also be pasted in the app with the **API keys** button. Both ways end up in this file: a pasted key is first checked with the provider (a free call, no credits or tokens) and then written to `.env`. Edits to the keys in `.env` apply without a restart (`server/keys.js`).

## How it works

```
React (client/)  --SSE-->  /api/search (server/api.js: Express locally, a Netlify Function online)
                               |
                     LangChain createAgent + ChatGroq (server/agent.js)
                       understands the product, picks the HS code
                               |
                         find_importers tool
                     /                         \
            UN Comtrade API               BillOfLadingData API
            (market price)                (importers, shipments)

Row "load more"  -> GET /api/importer-history  (next page of shipments)
"Load more importers" -> GET /api/more-importers
"API keys" button -> GET /api/keys (last 4 characters only), POST /api/keys (check, then save to .env)
```

## Customs data (BillOfLadingData)

[BillOfLadingData](https://www.billofladingdata.com) partner API, adapter in `server/tools/providers/bold.js`. Free account: 1,000 data credits.

| Call | Used for | Credits |
|---|---|---|
| `all-importers` | importer list | 15 per importer |
| `shipping-records` (`company_ids`) | each importer's shipments | 1 per shipment |
| `credit-usage`, `insights`, `search-filters` | credits chip | free |

One search = 5 importers x (15 + 5 shipments) = about 90-100 credits. "Load more importers" costs the same again, "Load more shipments" 5. Change the page sizes with `BOLD_IMPORTERS_PER_PAGE` and `BOLD_SHIPMENTS_PER_IMPORTER`. Everything is cached in `.cache/` for 7 days, so repeating a search is free.

Notes on the data:
- HS codes must be 6 digits; a 4-digit heading (rice 1006) is expanded to its 6-digit codes.
- Some importers are in neighbouring countries (Tanzania, DR Congo) because their goods land at the searched country's port.
- Some records carry a value that can't match the quantity; those show "?" and don't count as a price.
- Phone/email contacts need contact credits, which the free plan doesn't include.

## Things to know about the data

- **FOB vs CIF**: "Exporters' data" is FOB (what exporters charged). "Country's own data" is CIF (includes freight and insurance).
- Rows marked **check** have bad weight data, so the price is unreliable.
- The newest year is often only partly reported; the app falls back to the previous year when it looks incomplete.
- UN Comtrade free API allows about 1 request per second, so a search takes 5–15 seconds.
- The AI summary sometimes misreads a number. The tables are the source of truth.

## Groq free tier limits

The agent makes one or two small calls per search. The free tier allows 8,000 tokens a minute and 200,000 a day per model; if a limit is hit, LangChain waits and retries (`modelRetryMiddleware`).
