import { useCallback, useEffect, useState } from 'react';
import { useAgentSearch } from './useAgentSearch.js';
import Header from './components/Header.jsx';
import SearchBar from './components/SearchBar.jsx';
import Progress from './components/Progress.jsx';
import MarketBar from './components/MarketBar.jsx';
import ImporterTable from './components/ImporterTable.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import KeysDialog from './components/KeysDialog.jsx';

function useJson(url, retry) {
  const [value, setValue] = useState(null);
  const refresh = useCallback(() => {
    // In dev the API can start a moment after the page; try again until it answers.
    fetch(url).then((r) => r.json()).then(setValue).catch(() => retry && setTimeout(refresh, 2000));
  }, [url, retry]);
  useEffect(refresh, [refresh]);
  return [value, refresh];
}

function Skeleton() {
  return (
    <section className="card table-card" aria-hidden="true">
      <div className="sk sk-title" />
      {Array.from({ length: 5 }, (_, i) => <div key={i} className="sk sk-row" />)}
    </section>
  );
}

export default function App() {
  const result = useAgentSearch();
  const [status, refreshStatus] = useJson('/api/status', true);
  const [recent, refreshRecent] = useJson('/api/recent', true);
  const [dialog, setDialog] = useState(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [notice, setNotice] = useState(null);

  // Credits are checked by the server at most every 20 s.
  const creditsChanged = useCallback(() => setTimeout(refreshStatus, 21000), [refreshStatus]);
  useEffect(() => {
    if (!result.running && result.importers) { refreshRecent(); creditsChanged(); }
  }, [result.running, result.importers, refreshRecent, creditsChanged]);

  // The server stopped a search that would spend credits: ask, then rerun with confirm.
  useEffect(() => {
    const c = result.confirm;
    if (!c) return;
    setDialog({
      title: `Search ${c.args.product} importers in ${c.args.country}?`,
      cost: c.cost,
      onYes: () => { setDialog(null); result.dismissConfirm(); result.search(c.args.product, c.args.country, { hs: c.args.hs_code, confirm: true }); },
      onNo: () => { setDialog(null); result.dismissConfirm(); setNotice('Search cancelled. No credits used.'); },
    });
  }, [result.confirm]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmSpend = ({ title, cost }) => new Promise((resolve) => {
    setDialog({ title, cost, onYes: () => { setDialog(null); resolve(true); }, onNo: () => { setDialog(null); resolve(false); } });
  });

  const run = (product, country, opts) => { setNotice(null); result.search(product, country, opts); };
  const started = Boolean(result.query);
  const waitingForData = result.running && !result.importers;

  return (
    <>
      <Header status={status} onKeys={() => setKeysOpen(true)} />
      <main>
        <SearchBar
          running={result.running}
          onSearch={(p, c) => run(p, c)}
          recent={Array.isArray(recent) ? recent : []}
          onOpenRecent={(r) => run(r.product, r.country, { hs: r.hs_code })}
        />
        <Progress steps={result.steps} running={result.running} error={result.error} />
        {notice && <p className="notice">{notice}</p>}

        {started && (result.benchmark || result.importers) && <MarketBar data={result.benchmark} />}
        {waitingForData && !result.confirm && <Skeleton />}
        {result.importers && (
          <ImporterTable
            data={result.importers}
            costs={status?.costs || { importersPage: 100, importersPerPage: 5, shipmentsPage: 5 }}
            confirmSpend={confirmSpend}
            onCreditsUsed={creditsChanged}
          />
        )}
      </main>
      {dialog && <ConfirmDialog {...dialog} credits={status?.credits} />}
      {keysOpen && <KeysDialog onClose={() => setKeysOpen(false)} onSaved={refreshStatus} />}
    </>
  );
}
