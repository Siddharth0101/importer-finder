import { useEffect, useState } from 'react';
import { num, timeAgo } from '../format.js';

export default function SearchBar({ running, onSearch, recent, onOpenRecent }) {
  const [product, setProduct] = useState('');
  const [country, setCountry] = useState('');
  const [countries, setCountries] = useState([]);

  useEffect(() => {
    fetch('/api/countries').then((r) => r.json()).then((list) => Array.isArray(list) && setCountries(list)).catch(() => {});
  }, []);

  const submit = (e) => {
    e.preventDefault();
    if (product.trim() && country.trim()) onSearch(product.trim(), country.trim());
  };

  return (
    <section className="search">
      <form className="search-form" onSubmit={submit}>
        <label className="field">
          <span>Product</span>
          <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Product" required autoComplete="off" />
        </label>
        <label className="field">
          <span>Importing country</span>
          <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" list="countries" required autoComplete="off" />
        </label>
        <datalist id="countries">
          {countries.map((c) => <option key={c} value={c} />)}
        </datalist>
        <button className="btn primary" disabled={running}>
          {running ? <><span className="spin light" />Searching</> : 'Find importers'}
        </button>
      </form>
      {recent.length > 0 && (
        <div className="recent">
          <span className="recent-label">Saved searches · free to open</span>
          {recent.map((r) => (
            <button
              type="button"
              key={`${r.product}|${r.country}|${r.hs_code}`}
              className="recent-chip"
              disabled={running}
              aria-label={`${r.product} in ${r.country}, saved ${timeAgo(r.at)}`}
              onClick={() => { setProduct(r.product); setCountry(r.country); onOpenRecent(r); }}
            >
              <b>{r.product}</b> · {r.country}
              {r.total != null && <span className="muted"> · {num(r.total)} importers</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
