import { useCallback, useEffect, useRef, useState } from 'react';

const EMPTY = { query: null, steps: [], benchmark: null, importers: null, confirm: null, error: null };

// Opens a server-sent events stream to /api/search and collects what the agent sends.
// `hs` skips the AI step (saved searches); `confirm` allows spending credits.
export function useAgentSearch() {
  const [state, setState] = useState(EMPTY);
  const [running, setRunning] = useState(false);
  const source = useRef(null);

  const stop = useCallback(() => {
    source.current?.close();
    source.current = null;
    setRunning(false);
  }, []);

  const search = useCallback((product, country, { hs, confirm } = {}) => {
    stop();
    setState({ ...EMPTY, query: { product, country, startedAt: Date.now() } });
    setRunning(true);
    let finished = false;
    const params = new URLSearchParams({ product, country });
    if (hs) params.set('hs', hs);
    if (confirm) params.set('confirm', '1');
    const es = new EventSource(`/api/search?${params}`);
    source.current = es;

    const on = (type, fn) => es.addEventListener(type, (e) => {
      if (!e.data) return; // the browser's own connection errors carry no data
      const data = JSON.parse(e.data);
      setState((s) => fn(s, data));
    });
    on('step', (s, step) => {
      const steps = s.steps.some((x) => x.id === step.id)
        ? s.steps.map((x) => (x.id === step.id ? step : x))
        : [...s.steps, step];
      return { ...s, steps };
    });
    on('benchmark', (s, d) => ({ ...s, benchmark: d }));
    on('importers', (s, d) => ({ ...s, importers: d }));
    on('confirm', (s, d) => ({ ...s, confirm: d }));
    on('error', (s, d) => ({ ...s, error: d.message }));
    es.addEventListener('done', () => {
      finished = true;
      // If the agent failed midway, nothing is still running: stop the spinners.
      setState((s) => ({ ...s, steps: s.steps.map((x) => (x.status === 'running' ? { ...x, status: 'error' } : x)) }));
      stop();
    });
    // EventSource reconnects by itself, which would run the search again. Don't let it.
    es.onerror = () => {
      if (!finished) setState((s) => ({ ...s, error: s.error || 'Connection to the server was lost' }));
      stop();
    };
  }, [stop]);

  const dismissConfirm = useCallback(() => setState((s) => ({ ...s, confirm: null })), []);

  useEffect(() => stop, [stop]);
  return { ...state, running, search, dismissConfirm };
}
