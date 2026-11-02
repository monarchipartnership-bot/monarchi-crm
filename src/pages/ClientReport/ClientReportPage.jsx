import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { buildClientModel, dmy } from '../../lib/clientReport';
import { Chip, Icon, Medallion } from '../../components/ClientReport/kit';
import { MonarchiLogo } from '../../components/ClientReport/parts';
import MonthView from '../../components/ClientReport/MonthView';
import AllMonths from '../../components/ClientReport/AllMonths';
import PeriodView from '../../components/ClientReport/PeriodView';
import SectionNav from '../../components/ClientReport/SectionNav';
import { LangProvider } from '../../components/ClientReport/langContext';
import { daysText, monthNameIn, monthShortIn, normLang, trFor } from '../../lib/clientLang';
import '../../styles/clientReportHub.css';

// The page a client opens by a link (/r/<token>): no password, outside the CRM. It reads ONLY get_shared_report(token) — approved weeks and the
// running total of the month, with everything internal stripped by the database. The same link keeps working as new weeks are approved.
const REFRESH_AFTER_MS = 15 * 60 * 1000;

const PLATFORM = {
  meta: { label: 'Meta Ads report', logo: 'm', style: { background: '#E8F0FE', color: '#1D4FB3' } },
  google: { label: 'Google Ads report', logo: null, style: { background: '#FEF3E2', color: '#9A5B00' } },
};
// the language of a loading, failed or revoked page: the browser's (a Ukrainian reads Ukrainian); a loaded page follows the project and its reports
const browserLang = () => (typeof navigator !== 'undefined' && /^uk/i.test(navigator.language || '') ? 'uk' : 'en');

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
    const t = trFor(model ? model.lang : browserLang());
    document.title = model?.project?.name ? t('{name} · Advertising report', { name: model.project.name }) : t("Mon'Archi report");
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'robots'; document.head.appendChild(meta); }
    meta.content = 'noindex, nofollow'; // the link is private: it must never be found through a search
  }, [model]);

  const tb = trFor(browserLang());
  if (state.phase === 'loading') return <Frame><div className="emp crh-state">{tb('Loading the report…')}</div></Frame>;
  if (state.phase === 'error') return <Frame><div className="top"><div className="client" /><MonarchiLogo /></div><div className="emp crh-state">{tb('The report could not be loaded. Please check your connection and reload the page.')}</div></Frame>;
  if (state.phase === 'gone') {
    return (
      <Frame>
        <div className="top"><div className="client" /><MonarchiLogo /></div>
        <div className="emp crh-state"><Icon name="shield" className="crh-state-ic" /><b>{tb('This link is no longer active.')}</b><br />{tb("Please ask your Mon'Archi manager for the current link to the report.")}</div>
      </Frame>
    );
  }
  const lang = normLang(model.single ? model.single.lang : model.lang); // a link of one report speaks that report's language
  const t = trFor(lang);

  const months = model.months;
  const current = tab || (months.length ? months[months.length - 1].key : 'all');
  const month = months.find((m) => m.key === current) || months[months.length - 1] || null;
  const asOf = (iso) => (iso ? dmy(String(iso).slice(0, 10)) : '—');
  let chips = [];
  if (model.isSingle && model.single) {
    const v = model.single;
    const days = Math.round((new Date(v.end) - new Date(v.start)) / 86400000) + 1;
    chips = [
      { icon: 'cal', node: <>{t('Period')} <b>{dmy(v.start)} – {dmy(v.end)}</b> · {daysText(days, lang)}</> },
      { icon: 'check', tone: 'ok', node: <b>{t('Final')}</b> },
      { icon: 'clock', node: <>{t('Data as of')} <b>{asOf(v.updatedAt)}</b></> },
    ];
  } else if (!model.isSingle && month && current !== 'all') {
    const complete = month.weeksApproved === month.weeksTotal;
    chips = [
      { icon: 'cal', node: <>{t('Month')} <b>{monthNameIn(month.key, lang)}</b></> },
      { icon: 'check', tone: complete ? 'ok' : 'warn', node: <>{t('Weeks approved')} <b>{t('{a} of {b}', { a: month.weeksApproved, b: month.weeksTotal })}</b></> },
      { icon: 'file', tone: month.running ? 'warn' : '', node: <>{t('Month report')} <b>{!month.monthly ? t('not ready') : month.running ? t('to date') : t('final')}</b></> },
      { icon: 'clock', node: <>{t('Data as of')} <b>{asOf(month.asOf)}</b></> },
    ];
  }
  const pf = PLATFORM[model.platform] || { label: 'Advertising report', logo: null, style: { background: '#F3E3F7', color: '#682768' } };

  return (
    <LangProvider lang={lang}>
    <Frame>
      <header className="cx-head">
        <Medallion text={initials(model.project.name)} cls="lg" />
        <div className="cx-hm">
          <h1>{model.project.name}</h1>
          <div className="cx-chips">
            <span className="plb" style={pf.style}>{pf.logo ? <span className={`ic ${pf.logo}`} style={{ width: 18, height: 18, borderRadius: '50%' }} /> : null}{t(pf.label)}</span>
            {chips.map((c) => <Chip key={c.icon} icon={c.icon} tone={c.tone}>{c.node}</Chip>)}
          </div>
        </div>
        <MonarchiLogo />
      </header>
      <SectionNav watch={model.isSingle ? 'single' : current} />

      {model.isSingle ? (
        model.single ? <PeriodView view={model.single} model={model} /> : <div className="emp crh-state">{t("This report is not available any more. Please ask your Mon'Archi manager for a new link.")}</div>
      ) : months.length === 0 ? (
        <div className="emp crh-state">{t('The first report will appear here as soon as it is approved. This page updates itself — you can keep the link.')}</div>
      ) : (
        <>
          <div className="pl-list six ms7" role="group" aria-label={t('Months')}>
            {months.length > 1 && (
              <button type="button" className={`pt${current === 'all' ? ' on' : ''}`} aria-pressed={current === 'all'} onClick={() => setTab('all')}><Medallion icon="chart" /><b>{t('All months')}</b></button>
            )}
            {months.map((m) => (
              <button type="button" key={m.key} className={`pt${current === m.key ? ' on' : ''}`} aria-pressed={current === m.key} onClick={() => setTab(m.key)}>
                <Medallion icon="cal" p={Math.round((m.weeksApproved / Math.max(m.weeksTotal, 1)) * 100)} st={m.running ? 'st-paused' : ''} /><b>{monthNameIn(m.key, lang)}</b>
              </button>
            ))}
          </div>
          <div id="view">{current === 'all' && months.length > 1 ? <AllMonths model={model} /> : month ? <MonthView month={month} model={model} /> : null}</div>
        </>
      )}
    </Frame>
    </LangProvider>
  );
}
