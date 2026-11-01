import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchCockpits, pollProducing, runCockpitAction } from './api/projectCockpit';

const DISMISS_KEY = 'cockpit-dismissed';
const REFRESH_MS = 20000;

const readDismissed = () => { try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')); } catch { return new Set(); } };
const saveDismissed = (set) => { try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...set].slice(-400))); } catch { /* the choice is only for this browser */ } };

// The data of the cabinets for the screens: the list of the active projects (for the card on the map and the page «Проєкти»), the cabinet of each project
// and one function that runs what the person presses. The data is read again every 20 seconds while the screen is open, and after every action.
// What the person said «зрозуміло» to stays hidden in this browser; the cost estimate lives while the page is open.
export default function useProjectCockpit({ enabled = true } = {}) {
  const { email } = useAuth();
  const [state, setState] = useState({ list: [], byId: {}, loading: true, error: '' });
  const [dismissed, setDismissed] = useState(readDismissed);
  const [estimates, setEstimates] = useState({}); // request id -> { usd, count, limitUsd }
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const data = await fetchCockpits();
      if (alive.current) setState({ ...data, loading: false, error: '' });
      pollProducing(data.byId).catch(() => {});
    } catch (e) { if (alive.current) setState((s) => ({ ...s, loading: false, error: e?.message || 'Не вдалося завантажити проєкти.' })); }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return undefined;
    reload();
    const t = setInterval(reload, REFRESH_MS);
    return () => { alive.current = false; clearInterval(t); };
  }, [enabled, reload]);

  // what the screens get: the cabinets without the dismissed points, with the estimate put into its card
  const { list, byId } = useMemo(() => {
    const out = {};
    Object.values(state.byId).forEach((c) => {
      const attention = c.attention.filter((i) => !dismissed.has(i.id)).map((i) => {
        const est = i.kind === 'estimate' ? estimates[i.requestId] : null;
        if (!est) return i;
        return { ...i, text: `Оцінка: $${est.usd.toFixed(2)} за ${est.count} картинок (ліміт на запит $${est.limitUsd || '—'}).${est.skipped ? ` ${est.skipped} не вміщаються в ліміт.` : ''}`, estimate: est,
          actions: [{ key: 'confirm_generation', label: `Підтвердити генерацію · $${est.usd.toFixed(2)}`, primary: true }, { key: 'estimate', label: 'Оцінити ще раз' }] };
      });
      const tone = attention.some((i) => i.tone === 'problem') ? 'problem' : attention.length ? 'attention' : 'ok';
      out[c.id] = { ...c, attention, waiting: attention.length, tone };
    });
    const rank = { problem: 0, attention: 1, ok: 2 };
    const rows = state.list.map((s) => ({ ...s, waiting: out[s.id]?.waiting ?? s.waiting, tone: out[s.id]?.tone ?? s.tone })).sort((a, b) => rank[a.tone] - rank[b.tone]);
    return { list: rows, byId: out };
  }, [state, dismissed, estimates]);

  const waitingTotal = useMemo(() => list.filter((p) => p.waiting > 0).length, [list]);

  const byIdAll = state.byId;
  const run = useCallback(async (item, key, payload = {}) => {
    const cockpit = (payload.campaignId != null ? byIdAll[payload.campaignId] : null) || Object.values(byIdAll).find((c) => c.attention.some((i) => i.id === item?.id)) || null;
    const res = await runCockpitAction(item, key, payload, { cockpit, email });
    if (res.estimate) setEstimates((e) => ({ ...e, [item.requestId]: res.estimate }));
    if (res.dismissed) setDismissed((d) => { const n = new Set(d); n.add(res.dismissed); saveDismissed(n); return n; });
    await reload();
    return res;
  }, [byIdAll, email, reload]);

  return { list, byId, loading: state.loading, error: state.error, waitingTotal, reload, run };
}
