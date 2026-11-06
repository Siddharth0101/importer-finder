import { num } from '../format.js';

export default function Header({ status, onKeys }) {
  const connected = status && status.provider !== 'not connected';
  const low = status?.credits && status.credits.remaining < (status.costs?.importersPage || 100);
  const missing = status && (!status.groq || !connected);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17h18l-2 4H5z" /><path d="M5 17V9h6v8" /><path d="M11 13h6l2 4" /><path d="M8 9V5" />
          </svg>
        </span>
        <span className="brand-name">Importer Finder</span>
      </div>
      <div className="chips">
        {status && (
          <>
            <span className={`chip ${status.groq ? 'ok' : ''}`} title={status.model || ''}><i />AI agent {status.groq ? 'on' : 'off'}</span>
            <span className={`chip ${connected ? 'ok' : ''}`}><i />Customs data {connected ? 'on' : 'off'}</span>
            {status.credits && (
              <span className={`chip credits ${low ? 'warn' : ''}`} title={`${num(status.credits.used)} of ${num(status.credits.total)} used`}>
                {num(status.credits.remaining)} credits left
              </span>
            )}
          </>
        )}
        <button type="button" className={`chip key-btn ${missing ? 'warn' : ''}`} onClick={onKeys}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="15" r="4" /><path d="M10.85 12.15 19 4" /><path d="m18 5 2 2" /><path d="m15 8 2 2" />
          </svg>
          {missing ? 'Add API keys' : 'API keys'}
        </button>
      </div>
    </header>
  );
}
