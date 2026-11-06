import { num } from '../format.js';

export default function Header({ status }) {
  const connected = status && status.provider !== 'not connected';
  const low = status?.credits && status.credits.remaining < (status.costs?.importersPage || 100);
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
      {status && (
        <div className="chips">
          <span className={`chip ${status.groq ? 'ok' : ''}`} title={status.model || ''}><i />AI agent {status.groq ? 'on' : 'off'}</span>
          <span className={`chip ${connected ? 'ok' : ''}`}><i />Customs data {connected ? 'on' : 'off'}</span>
          {status.credits && (
            <span className={`chip credits ${low ? 'warn' : ''}`} title={`${num(status.credits.used)} of ${num(status.credits.total)} used`}>
              {num(status.credits.remaining)} credits left
            </span>
          )}
        </div>
      )}
    </header>
  );
}
