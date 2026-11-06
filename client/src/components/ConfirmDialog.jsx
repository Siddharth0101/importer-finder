import { useEffect, useRef } from 'react';
import { num } from '../format.js';

// Asks before anything that spends customs data credits.
export default function ConfirmDialog({ title, cost, credits, onYes, onNo }) {
  const yes = useRef(null);
  useEffect(() => {
    yes.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onNo();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNo]);
  const notEnough = credits && credits.remaining < cost;

  return (
    <div className="overlay" onClick={onNo}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="dlg-title">{title}</h3>
        <p>
          This uses about <b>{num(cost)} credits</b>
          {credits && <> · you have <b>{num(credits.remaining)}</b> left</>}.
        </p>
        <p className="muted">Results are saved for 7 days, so opening this search again is free.</p>
        {notEnough && <p className="err">Not enough credits for this.</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onNo}>Cancel</button>
          <button type="button" className="btn primary" ref={yes} disabled={notEnough} onClick={onYes}>Use credits</button>
        </div>
      </div>
    </div>
  );
}
