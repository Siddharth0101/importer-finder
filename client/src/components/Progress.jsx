// The agent's steps as a row of pills while it works, and any problem after.
export default function Progress({ steps, running, error }) {
  const problems = steps.filter((s) => s.status === 'error' && s.detail);
  if (!running && !error && !problems.length) return null;
  return (
    <div className="progress" aria-live="polite">
      {steps.map((s) => (
        <span key={s.id} className={`step ${s.status}`} title={s.detail || ''}>
          {s.status === 'running' ? <span className="spin" /> : <span className="dot" />}
          {s.status === 'done' && s.detail?.startsWith('From cache') ? `${s.label} (saved)` : s.label}
        </span>
      ))}
      {problems.map((s) => <p key={`p${s.id}`} className="err">{s.label}: {s.detail}</p>)}
      {error && <p className="err">{error}</p>}
    </div>
  );
}
