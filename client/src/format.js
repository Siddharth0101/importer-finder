// Short money for totals: $11.7M. The exact number goes in the tooltip.
export const usd = (n) => {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
};

// Exact money as the API sent it: $78,750 or $1,291.5
export const money = (n) => (n == null ? '—' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);

export const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }));

// Links come from outside data, so only allow plain http(s) URLs.
export const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

// Display only: customs names come in ALL CAPS. "PELIKAN STAR FOODSTUFF TRADING LLC" ->
// "Pelikan Star Foodstuff Trading LLC", keeping company-type acronyms upper case.
const KEEP_UPPER = new Set(['LLC', 'FZE', 'FZCO', 'FZ', 'DMCC', 'LLP', 'PLC', 'PVT', 'UAE', 'USA', 'UK', 'DR', 'SA', 'SARL', 'BV', 'NV', 'AG', 'GMBH', 'EPZ', 'JLT', 'II', 'III', 'SCM']);
export function titleCase(s) {
  const str = String(s || '').trim().replace(/,\s*$/, '');
  const letters = str.replace(/[^A-Za-z]/g, '');
  const upper = letters.replace(/[^A-Z]/g, '').length;
  if (!letters || upper / letters.length < 0.7) return str; // already mixed case
  return str
    .toLowerCase()
    .split(/(\s+|-|\/|\()/)
    .map((part) => {
      const bare = part.replace(/[^a-z]/g, '').toUpperCase();
      if (KEEP_UPPER.has(bare)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

// "KE" -> 🇰🇪
export const flag = (iso2) => (/^[A-Z]{2}$/.test(iso2 || '') ? String.fromCodePoint(...[...iso2].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '');

export function timeAgo(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 60) return `${Math.max(min, 1)} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export function downloadCsv(filename, rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = rows.map((r) => r.map(cell).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
