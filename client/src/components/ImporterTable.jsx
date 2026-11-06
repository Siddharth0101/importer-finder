import { Fragment, useEffect, useMemo, useState } from 'react';
import { downloadCsv, flag, money, num, titleCase, usd } from '../format.js';
import ImporterDetails from './ImporterDetails.jsx';

const PRICE_HELP = 'From their latest customs record: value ÷ quantity (when the quantity is in KG or MT).';

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

const SORTS = {
  name: (r) => titleCase(r.name).toLowerCase(),
  price: (r) => r.lastUsdPerTonne ?? null,
  date: (r) => r.lastDate || null,
  shipments: (r) => r.totalShipments ?? null,
  value: (r) => r.totalUsd ?? null,
};

function SortHeader({ id, sort, onSort, className, children, title }) {
  const active = sort.key === id;
  return (
    <th className={className} title={title} aria-sort={active ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`sort ${active ? 'active' : ''}`} onClick={() => onSort(id)}>
        {children}<span className="arrow">{active ? (sort.dir > 0 ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}

export default function ImporterTable({ data, costs, confirmSpend, onCreditsUsed }) {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState({}); // importer id or 'more' -> { loading, error }
  const [sort, setSort] = useState({ key: null, dir: -1 });
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setRows(data?.importers || []);
    setPage(data?.page || 1);
    setHasMore(Boolean(data?.hasMore));
    setOpen(null);
    setBusy({});
    setQuery('');
    setOrigin('');
  }, [data]);

  const origins = useMemo(
    () => [...new Set(rows.flatMap((r) => [r.lastOrigin, ...(r.origins || [])]).filter(Boolean).map(titleCase))].sort(),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (origin && ![r.lastOrigin, ...(r.origins || [])].some((o) => titleCase(o) === origin)) return false;
      if (!q) return true;
      return [r.name, r.lastSupplier, r.lastOrigin, r.country].some((v) => String(v || '').toLowerCase().includes(q));
    });
    if (sort.key) {
      const get = SORTS[sort.key];
      list = [...list].sort((a, b) => {
        const x = get(a);
        const y = get(b);
        if (x == null && y == null) return 0;
        if (x == null) return 1; // empty values always last
        if (y == null) return -1;
        return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
      });
    }
    return list;
  }, [rows, query, origin, sort]);

  if (!data) return null;
  const { args } = data;
  const base = { country: args.country, product: args.product, hs: args.hs_code };
  const setBusyFor = (key, value) => setBusy((b) => ({ ...b, [key]: value }));
  const onSort = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : key === 'name' ? 1 : -1 }));

  const moreImporters = async () => {
    const ok = await confirmSpend({ title: `Load ${costs.importersPerPage || 5} more importers?`, cost: costs.importersPage });
    if (!ok) return;
    setBusyFor('more', { loading: true });
    try {
      const body = await getJson(`/api/more-importers?${new URLSearchParams({ ...base, page: page + 1, confirm: '1' })}`);
      setRows((r) => [...r, ...body.importers]);
      setPage(body.page);
      setHasMore(body.hasMore);
      setBusyFor('more', null);
      onCreditsUsed?.();
    } catch (err) {
      setBusyFor('more', { error: err.message });
    }
  };

  const moreShipments = async (row) => {
    setBusyFor(row.id, { loading: true });
    try {
      const nextPage = Math.round(row.shipmentsLoaded / costs.shipmentsPage) + 1;
      const body = await getJson(`/api/importer-history?${new URLSearchParams({ ...base, companyId: row.id, page: nextPage })}`);
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, shipments: [...r.shipments, ...body.shipments], shipmentsLoaded: body.shipmentsLoaded } : r)));
      setBusyFor(row.id, null);
      onCreditsUsed?.();
    } catch (err) {
      setBusyFor(row.id, { error: err.message });
    }
  };

  const exportCsv = () => {
    const header = ['Importer', 'Country', 'Price they pay ($/t)', 'Last supplier', 'Origin', 'Last buy', 'Shipments', 'Total value ($)', 'Suppliers', 'Export countries', 'Unloading ports', 'Website'];
    const lines = visible.map((r) => [
      r.name, r.country, r.lastUsdPerTonne ?? '', r.lastSupplier, r.lastOrigin, r.lastDate, r.totalShipments, r.totalUsd,
      r.totalSuppliers, (r.origins || []).join('; '), (r.ports || []).join('; '), r.website,
    ]);
    downloadCsv(`importers-${args.product}-${args.country}.csv`.replace(/\s+/g, '-').toLowerCase(), [header, ...lines]);
  };

  return (
    <section className="card table-card">
      <div className="table-head">
        <div>
          <h2>{num(rows.length)} of {num(data.total)} importers</h2>
          <p className="muted">{titleCase(args.product)} into {args.country} · HS {args.hs_code} · customs data</p>
        </div>
        {rows.length > 0 && (
          <div className="toolbar">
            <input className="filter" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name or supplier" aria-label="Filter importers" />
            {origins.length > 1 && (
              <select value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Filter by origin">
                <option value="">All origins</option>
                {origins.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            <button type="button" className="btn small" onClick={exportCsv}>Export CSV</button>
          </div>
        )}
      </div>

      {data.error && <div className="banner">{data.error}</div>}

      {rows.length === 0 ? (
        <p className="empty">No importers returned.</p>
      ) : visible.length === 0 ? (
        <p className="empty">No importers match the filter.</p>
      ) : (
        <div className="scroll">
          <table className="importers">
            <thead>
              <tr>
                <SortHeader id="name" sort={sort} onSort={onSort}>Importer</SortHeader>
                <SortHeader id="price" sort={sort} onSort={onSort} className="n" title={PRICE_HELP}>Price they pay</SortHeader>
                <th>Bought from</th>
                <SortHeader id="date" sort={sort} onSort={onSort}>Last buy</SortHeader>
                <SortHeader id="shipments" sort={sort} onSort={onSort} className="n">Shipments</SortHeader>
                <SortHeader id="value" sort={sort} onSort={onSort} className="n">Total value</SortHeader>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const isOpen = open === row.id;
                const toggle = () => setOpen(isOpen ? null : row.id);
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={`row ${isOpen ? 'open' : ''}`}
                      onClick={toggle}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}
                      tabIndex={0}
                      aria-expanded={isOpen}
                    >
                      <td data-label="Importer">
                        <div className="who">
                          <span className="name">{titleCase(row.name)}</span>
                          <span className="where">{flag(row.countryCode)} {titleCase(row.country)}</span>
                        </div>
                      </td>
                      <td className="n" data-label="Price they pay">{row.lastUsdPerTonne ? <span className="price">${num(row.lastUsdPerTonne)}<small>/t</small></span> : <span className="muted">—</span>}</td>
                      <td data-label="Bought from">
                        {row.lastSupplier
                          ? <span><span className="supplier-name">{titleCase(row.lastSupplier)}</span>{row.lastOrigin && <span className="muted"> · {titleCase(row.lastOrigin)}</span>}</span>
                          : titleCase(row.lastOrigin) || <span className="muted">—</span>}
                      </td>
                      <td className="nowrap" data-label="Last buy">{row.lastDate || <span className="muted">—</span>}</td>
                      <td className="n" data-label="Shipments">{num(row.totalShipments)}</td>
                      <td className="n" data-label="Total value"><span title={money(row.totalUsd)}>{usd(row.totalUsd)}</span></td>
                      <td className="chev" aria-hidden="true">{isOpen ? '▴' : '▾'}</td>
                    </tr>
                    {isOpen && (
                      <tr className="details">
                        <td colSpan={7}>
                          <ImporterDetails row={row} onMore={() => moreShipments(row)} loading={busy[row.id]?.loading} error={busy[row.id]?.error} costPerPage={costs.shipmentsPage} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <div className="table-foot">
          <button type="button" className="btn" disabled={busy.more?.loading} onClick={moreImporters}>
            {busy.more?.loading ? <><span className="spin" />Loading</> : `Load more importers · about ${num(costs.importersPage)} credits`}
          </button>
          {busy.more?.error && <span className="err">{busy.more.error}</span>}
        </div>
      )}
    </section>
  );
}
