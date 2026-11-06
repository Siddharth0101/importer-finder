import { num } from '../format.js';

// UN Comtrade: what the main origin countries charged per tonne (FOB), cheapest first.
export default function MarketBar({ data }) {
  const b = data?.benchmark;
  return (
    <section className="market">
      <span className="market-label">Market price · FOB {b?.year || ''}</span>
      {b?.origins?.length ? (
        b.origins.map((o) => (
          <span key={o.country} className="origin" title={`${num(o.tonnes)} t`}>
            {o.country} <b>${num(o.usdPerTonne)}/t</b>
          </span>
        ))
      ) : (
        <span className="muted">{data ? data.note || 'No data' : 'Loading…'}</span>
      )}
      <span className="market-src">Source: UN Comtrade</span>
    </section>
  );
}
