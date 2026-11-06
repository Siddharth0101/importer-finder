import { useEffect, useState } from 'react';

const FIELDS = [
  { name: 'groq', label: 'Groq API key', use: 'Runs the AI agent.', link: 'https://console.groq.com/keys', placeholder: 'gsk_…' },
  { name: 'bold', label: 'BillOfLadingData API key', use: 'Importers and their shipments.', link: 'https://www.billofladingdata.com', placeholder: 'Paste the key' },
];

async function postKey(name, value) {
  const res = await fetch('/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, value }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body.keys;
}

function KeyField({ field, status, autoFocus, onSaved }) {
  const [value, setValue] = useState('');
  const [state, setState] = useState(null); // { busy } | { error } | { saved }
  const id = `key-${field.name}`;

  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true });
    try {
      onSaved(await postKey(field.name, value));
      setValue('');
      setState({ saved: true });
    } catch (err) {
      setState({ error: err.message });
    }
  };

  return (
    <form className="key-field" onSubmit={save}>
      <div className="key-head">
        <label htmlFor={id}>{field.label}</label>
        {status && <span className={`key-state ${status.set ? 'ok' : ''}`}>{status.set ? `Set · ends in ${status.hint}` : 'Not set'}</span>}
      </div>
      <div className="key-row">
        <input
          id={id}
          type="password"
          value={value}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          placeholder={status?.set ? 'Paste a new key to replace it' : field.placeholder}
          onChange={(e) => { setValue(e.target.value); setState(null); }}
        />
        <button className="btn primary small" disabled={!value.trim() || state?.busy}>
          {state?.busy ? <><span className="spin light" />Checking</> : 'Save'}
        </button>
      </div>
      {state?.error ? <p className="key-note err">{state.error}</p>
        : state?.saved ? <p className="key-note ok-text">Key works. Saved to .env.</p>
        : <p className="key-note muted">{field.use} <a href={field.link} target="_blank" rel="noopener noreferrer">Get a key</a></p>}
    </form>
  );
}

// Paste API keys here, or put them in .env by hand: both end up in the same .env file.
export default function KeysDialog({ onClose, onSaved }) {
  const [keys, setKeys] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/keys').then((r) => r.json()).then(setKeys).catch(() => setError("Can't reach the app's server."));
  }, []);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog keys" role="dialog" aria-modal="true" aria-labelledby="keys-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="keys-title">API keys</h3>
        <p className="muted">
          Paste a key here, or write it in <code>importer-finder/.env</code>. Both save to the same file and work without a restart.
          Checking a key is free: no credits or tokens used.
        </p>
        {error && <p className="err">{error}</p>}
        {FIELDS.map((f, i) => (
          <KeyField key={f.name} field={f} status={keys?.[f.name]} autoFocus={i === 0} onSaved={(k) => { setKeys(k); onSaved?.(); }} />
        ))}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
