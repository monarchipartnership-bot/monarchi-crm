import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAgentsLive, runTickNow, setGlobalStop } from '../../lib/api/workflow';
import { agentFacts, agentStates, feedOf, podStates } from '../../lib/workflow/mapLive';
import { ARCHIVE_NOTE, agentOf, mapIslands, rightLabel } from '../../lib/workflow/registry';
import { buildOverview, monthStart, money } from '../../lib/workflow/overview';
import { buildQueue, ageText } from '../../lib/workflow/view';
import { useConfirm } from '../../components/common/ConfirmDialog';
import AgentMap3D from './map/AgentMap3D';
import '../../styles/projectWorkspace.css'; // the look of the confirmation window
import '../../styles/aiAgentsPage.css';

const TICK = { ok: 'працює', warn: 'повільно', bad: 'не відповідає' };
const tickLevel = (iso, now = new Date()) => { if (!iso) return 'bad'; const m = (now - new Date(iso)) / 60000; return m < 3 ? 'ok' : m < 15 ? 'warn' : 'bad'; };

// «AI Agents»: the home of the section is the 3D map of the team (the registry: the five agents of the client's work and the archived departments), with the numbers on top,
// the quick buttons on the left and «Що зараз» on the right. Owner's decision of 2026-11-24: the map and the spend come back as the home of the section.
export default function AiAgentsHome() {
  const nav = useNavigate();
  const { email } = useAuth();
  const [live, setLive] = useState(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState(null); // { island, agent }
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [confirm, confirmDialog] = useConfirm();
  const islands = useMemo(() => mapIslands(), []);

  const load = useCallback(async () => { try { setLive(await fetchAgentsLive()); setErr(''); } catch (e) { setErr(e.message || String(e)); } }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const ov = useMemo(() => (live ? buildOverview(live) : null), [live]);
  const queue = useMemo(() => (live ? buildQueue({ projects: live.projects, states: live.states, approvals: live.approvals }) : []), [live]);
  const states = useMemo(() => (live ? podStates(islands, agentStates({ runs: live.runs, approvals: live.approvals, states: live.states })) : {}), [live, islands]);
  const feed = useMemo(() => (live ? feedOf({ journal: live.feed, projects: live.projects, limit: 8 }) : []), [live]);
  const tick = tickLevel(live?.lastTickAt);

  const onOpenAgent = useCallback((islandKey, agentKey) => { const island = islands.find((i) => i.key === islandKey); setSel(island ? { island, agent: island.agents.find((a) => a.key === agentKey) || null } : null); }, [islands]);

  async function tickNow() { setBusy(true); setNote(''); try { const r = await runTickNow(); setNote(r?.stopped ? 'Усі агенти зупинено, крок не виконано.' : `Крок виконано: взято ${r?.claimed ?? 0}, готово ${r?.done ?? 0}${r?.failed ? `, помилок ${r.failed}` : ''}.`); await load(); } catch (e) { setNote(e.message || String(e)); } finally { setBusy(false); } }
  async function stop() {
    if (ov?.stopped) { setBusy(true); try { await setGlobalStop(false, email); await load(); } catch (e) { setNote(e.message || String(e)); } finally { setBusy(false); } return; }
    if (!(await confirm({ title: 'Зупинити всіх агентів?', body: 'Нові кроки не запускатимуться, і в рекламні кабінети нічого не писатиметься, доки ви не відновите роботу. Кроки, що вже виконуються, завершаться.', confirmLabel: 'Зупинити', danger: true }))) return;
    setBusy(true); try { await setGlobalStop(true, email, 'Аварійна зупинка з карти AI Agents.'); await load(); } catch (e) { setNote(e.message || String(e)); } finally { setBusy(false); }
  }

  const facts = sel?.agent && live && !sel.island.archived ? agentFacts({ agent: sel.agent.key, runs: live.runs, projects: live.projects, since: monthStart(new Date()) }) : null;
  const reg = sel?.agent && !sel.island.archived ? agentOf(sel.agent.key) : null;

  return (
    <div className="aia-page ai-immersive">
      {confirmDialog}
      <div className="aia-map">
        <AgentMap3D islands={islands} runStates={states} onOpenAgent={onOpenAgent} onFocusDept={() => setSel(null)} />
      </div>

      <header className="aia-brand">
        <img src={`${import.meta.env.BASE_URL}ai-world/logo/emblem.svg`} alt="" />
        <div><h1>AI Agents</h1><span>Monarchi Hub</span></div>
      </header>

      <nav className="aia-nav" aria-label="Розділи AI Agents">
        <button type="button" className="aia-tab active" aria-current="page">Мапа</button>
        <button type="button" className="aia-tab" onClick={() => nav('/projects/overview')}>Огляд проєктів</button>
        <button type="button" className="aia-tab" onClick={() => nav('/projects/approvals')}>Апруви{queue.length > 0 && <b className="aia-badge">{queue.length}</b>}</button>
      </nav>
      <button type="button" className="aia-back" onClick={() => nav('/')}>← До CRM</button>

      <div className="aia-kpis" aria-label="Показники">
        <div className="aia-kpi"><b>{ov ? ov.counts.all : '–'}</b><span>проєктів у роботі</span></div>
        <div className={'aia-kpi' + (queue.length ? ' hot' : '')}><b>{live ? queue.length : '–'}</b><span>чекає вашого рішення</span></div>
        <div className={'aia-kpi' + (ov?.counts.failed ? ' bad' : '')}><b>{ov ? ov.counts.failed : '–'}</b><span>проєктів з проблемою</span></div>
        <div className={'aia-kpi' + (ov && ov.cap > 0 && ov.spent / ov.cap >= 0.8 ? ' hot' : '')}><b>{ov ? money(ov.spent) : '–'}</b><span>витрати агентів{ov?.cap != null ? ` з ${money(ov.cap)}` : ''}</span></div>
        <div className="aia-kpi"><b><i className={'aia-lamp ' + tick} />{live?.lastTickAt ? ageText(live.lastTickAt) : '–'}</b><span>оркестратор: {TICK[tick]}</span></div>
      </div>

      {ov?.stopped && <div className="aia-stopbar" role="alert">Усі агенти зупинено. Нові кроки не запускаються, у кабінети нічого не пишеться.</div>}
      {err && <div className="aia-err" role="alert">{err}</div>}

      <aside className="aia-left" aria-label="Швидкі дії">
        <button type="button" className="aia-q primary" onClick={() => nav('/projects/approvals')}><span>Апруви</span>{queue.length > 0 && <b className="aia-badge">{queue.length}</b>}</button>
        <button type="button" className="aia-q" onClick={() => nav('/projects/overview')}>Огляд проєктів</button>
        <button type="button" className="aia-q" disabled={busy || ov?.stopped} onClick={tickNow} title="Оркестратор виконує один прохід зараз, не чекаючи наступної хвилини">Виконати крок зараз</button>
        <button type="button" className={'aia-q ' + (ov?.stopped ? 'ok' : 'danger')} disabled={busy} onClick={stop}>{ov?.stopped ? 'Відновити роботу' : 'Аварійна зупинка'}</button>
        <button type="button" className="aia-q" onClick={() => nav('/projects/help')}>Як це працює</button>
        {note && <div className="aia-note" role="status">{note}</div>}
      </aside>

      <aside className="aia-right" aria-label={sel ? 'Агент' : 'Що зараз'}>
        {!sel && (
          <>
            <h2>Що зараз</h2>
            {feed.length === 0 && <div className="aia-muted">Подій поки немає.</div>}
            {feed.map((f) => (
              <button key={f.id} type="button" className={'aia-ev' + (f.bad ? ' bad' : '')} onClick={() => nav(`/projects/${f.projectId}?tab=${f.tab}`)}>
                <b>{f.project}</b><span>{f.text}</span><time dateTime={f.at}>{ageText(f.at)} тому</time>
              </button>
            ))}
          </>
        )}
        {sel && (
          <div className="aia-agent">
            <div className="aia-row"><h2>{sel.agent ? sel.agent.name : sel.island.label}</h2><button type="button" className="aia-x" onClick={() => setSel(null)} aria-label="Закрити">×</button></div>
            {sel.island.archived && <p className="aia-muted">{sel.island.label}. {ARCHIVE_NOTE}</p>}
            {reg && (
              <>
                <p className="aia-muted">{reg.does}</p>
                <span className={'aia-right-tag ' + reg.rights}>{rightLabel(reg.rights)}</span>
                <h3>Зараз</h3>
                {facts.open.length === 0 ? <div className="aia-muted">Нічого не виконує.</div> : facts.open.map((o) => <div key={o.id} className="aia-line">{o.project}: {o.skill} <em>{o.status === 'running' ? 'працює' : o.status === 'waiting' ? 'чекає' : 'у черзі'}</em></div>)}
                <h3>Останні прогони</h3>
                {facts.recent.length === 0 ? <div className="aia-muted">Ще не було.</div> : facts.recent.map((r) => <div key={r.id} className={'aia-line' + (r.status === 'failed' ? ' bad' : '')}>{r.project}: {r.skill} <em>{r.status === 'done' ? 'готово' : r.status === 'failed' ? 'помилка' : r.status}</em></div>)}
                <h3>Навички</h3>
                <div className="aia-chips">{reg.skills.map((s) => <span key={s.key} className={'aia-chip' + (s.integrated === false ? ' mute' : '')} title={s.integrated === false ? (s.stub ? 'Ще заглушка' : 'Ще не підключено') : ''}>{s.label}</span>)}</div>
                <h3>Читає</h3><div className="aia-muted">{reg.reads.join(' · ')}</div>
                <h3>Пише</h3><div className="aia-muted">{reg.writes.join(' · ')}</div>
                <div className="aia-muted" style={{ marginTop: 8 }}>За місяць: прогонів {facts.runs}, витрати {money(facts.cost)}{facts.failed ? `, помилок ${facts.failed}` : ''}.</div>
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
