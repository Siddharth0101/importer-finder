import { money, num, safeUrl, titleCase, usd } from '../format.js';

const PRICE_HELP = 'Value ÷ quantity of this customs record, when the quantity is in KG or MT.';

function Transactions({ rows }) {
  return (
    <div className="scroll">
      <table className="tx">
        <thead>
          <tr>
            <th>Date</th><th>Supplier</th><th>Origin</th><th>Product</th>
            <th className="n">Quantity</th><th className="n">Value (USD)</th><th className="n" title={PRICE_HELP}>Price / t</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={i}>
              <td className="nowrap">{s.date || '—'}</td>
              <td>{titleCase(s.supplier) || '—'}</td>
              <td>{titleCase(s.origin) || '—'}</td>
              <td className="product" title={s.product}>{s.product || '—'}</td>
              <td className="n">{s.quantity != null ? `${num(s.quantity)} ${s.unit}` : '—'}</td>
              <td className="n">{money(s.value)}</td>
              <td className="n">{s.usdPerTonne ? <b>${num(s.usdPerTonne)}</b> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Stat = ({ label, children }) => (
  <div className="stat">
    <span className="stat-label">{label}</span>
    <span className="stat-value">{children}</span>
  </div>
);

// One importer: its totals from the API, then its shipment records.
export default function ImporterDetails({ row, onMore, loading, error, costPerPage }) {
  return (
    <div className="details-body">
      <div className="stats">
        <Stat label="Shipments">{num(row.totalShipments)}</Stat>
        <Stat label="Total value"><span title={money(row.totalUsd)}>{usd(row.totalUsd)}</span></Stat>
        <Stat label="Suppliers">{num(row.totalSuppliers)}</Stat>
        <Stat label="Buys from">{row.origins?.map(titleCase).join(', ') || '—'}</Stat>
        <Stat label="Port">{row.ports?.map(titleCase).join(', ') || '—'}</Stat>
        {safeUrl(row.website) && <Stat label="Website"><a href={row.website} target="_blank" rel="noopener noreferrer">{row.website.replace(/^https?:\/\//, '')}</a></Stat>}
      </div>

      {row.shipments.length ? <Transactions rows={row.shipments} /> : <p className="muted">No shipment records returned.</p>}

      {row.shipmentsLoaded < row.totalShipments && (
        <div className="details-actions">
          <button type="button" className="btn small" disabled={loading} onClick={onMore}>
            {loading ? <><span className="spin" />Loading</> : `Load ${costPerPage} more shipments · ${costPerPage} credits`}
          </button>
          <span className="muted">{num(Math.min(row.shipmentsLoaded, row.totalShipments))} of {num(row.totalShipments)} loaded</span>
          {error && <span className="err">{error}</span>}
        </div>
      )}
    </div>
  );
}
