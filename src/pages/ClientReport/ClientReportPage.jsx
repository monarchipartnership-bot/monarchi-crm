import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { buildClientModel } from '../../lib/clientReport';
import { Icon, Medallion } from '../../components/ClientReport/kit';
import { MonarchiLogo } from '../../components/ClientReport/parts';
import MonthView from '../../components/ClientReport/MonthView';
import AllMonths from '../../components/ClientReport/AllMonths';
import '../../styles/clientReportHub.css';

// The page a client opens by a link (/r/<token>): no password, outside the CRM. It reads ONLY get_shared_report(token) — approved weeks and the
// running total of the month, with everything internal stripped by the database. The same link keeps working as new weeks are approved.
const REFRESH_AFTER_MS = 15 * 60 * 1000;

const PLATFORM = {
  meta: { label: 'Meta Ads report', logo: 'm', style: { background: '#E8F0FE', color: '#1D4FB3' } },
  google: { label: 'Google Ads report', logo: null, style: { background: '#FEF3E2', color: '#9A5B00' } },
};

function initials(name) {
  const words = String(name || '').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
}

function Frame({ children }) {
  return (<div className="crh"><div className="wrap">{children}</div></div>);
}

export default function ClientReportPage() {
  const { token } = useParams();
  const [state, setState] = useState({ phase: 'loading', payload: null });
  const [tab, setTab] = useState(null); // 'all' | a month key; null = the latest month

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_shared_report', { p_token: token || '' });
    if (error) { setState((s) => (s.payload ? s : { phase: 'error', payload: null })); return; }
    setState({ phase: data ? 'ready' : 'gone', payload: data || null, loadedAt: Date.now() });
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // The page stays open for days on a manager's second screen: when it is shown again after a while it picks up new weeks by itself.
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible' && state.loadedAt && Date.now() - state.loadedAt > REFRESH_AFTER_MS) load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [load, state.loadedAt]);

  const model = useMemo(() => buildClientModel(state.payload), [state.payload]);

  useEffect(() => {
    document.title = model?.project?.name ? `${model.project.name} · Advertising report` : "Mon'Archi report";
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'robots'; document.head.appendChild(meta); }
    meta.content = 'noindex, nofollow'; // the link is private: it must never be found through a search
  }, [model]);

  if (state.phase === 'loading') return <Frame><div className="emp crh-state">Loading the report…</div></Frame>;
  if (state.phase === 'error') return <Frame><div className="top"><div className="client" /><MonarchiLogo /></div><div className="emp crh-state">The report could not be loaded. Please check your connection and reload the page.</div></Frame>;
  if (state.phase === 'gone') {
    return (
      <Frame>
        <div className="top"><div className="client" /><MonarchiLogo /></div>
        <div className="emp crh-state"><Icon name="shield" className="crh-state-ic" /><b>This link is no longer active.</b><br />Please ask your Mon&apos;Archi manager for the current link to the report.</div>
      </Frame>
    );
  }

  const months = model.months;
  const current = tab || (months.length ? months[months.length - 1].key : 'all');
  const month = months.find((m) => m.key === current) || months[months.length - 1] || null;
  const pf = PLATFORM[model.platform] || { label: 'Advertising report', logo: null, style: { background: '#F3E3F7', color: '#682768' } };

  return (
    <Frame>
      <div className="top">
        <div className="client">
          <Medallion text={initials(model.project.name)} cls="lg" />
          <div>
            <h1>{model.project.name}</h1>
            <div className="cs"><span className="plb" style={pf.style}>{pf.logo ? <span className={`ic ${pf.logo}`} style={{ width: 18, height: 18, borderRadius: '50%' }} /> : null}{pf.label}</span></div>
          </div>
        </div>
        <MonarchiLogo />
      </div>

      {months.length === 0 ? (
        <div className="emp crh-state">The first report will appear here as soon as it is approved. This page updates itself — you can keep the link.</div>
      ) : (
        <>
          <div className="pl-list six ms7" role="group" aria-label="Months">
            {months.length > 1 && (
              <button type="button" className={`pt${current === 'all' ? ' on' : ''}`} aria-pressed={current === 'all'} onClick={() => setTab('all')}><Medallion icon="chart" /><b>All months</b></button>
            )}
            {months.map((m) => (
              <button type="button" key={m.key} className={`pt${current === m.key ? ' on' : ''}`} aria-pressed={current === m.key} onClick={() => setTab(m.key)}>
                <Medallion icon="cal" p={Math.round((m.weeksApproved / Math.max(m.weeksTotal, 1)) * 100)} st={m.running ? 'st-paused' : ''} /><b>{m.name}</b>
              </button>
            ))}
          </div>
          <div id="view">{current === 'all' && months.length > 1 ? <AllMonths model={model} /> : month ? <MonthView month={month} model={model} /> : null}</div>
        </>
      )}
    </Frame>
  );
}
