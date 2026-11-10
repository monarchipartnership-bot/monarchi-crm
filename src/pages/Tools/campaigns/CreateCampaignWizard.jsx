import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ActionIcon from '../../../components/common/ActionIcon';
import { useAuth } from '../../../contexts/AuthContext';
import useDialogA11y from '../../../lib/useDialogA11y';
import { kickQueue, saveAgent } from '../../../lib/api/agents';
import { changeCampaignPlatforms, createCampaign, fetchClientsForCampaigns, launchCampaign, loadCampaignTeam, setAgentsEnabled, updateCampaign } from '../../../lib/api/campaigns';
import { dependents } from '../../../lib/agents/chain';
import { CAMPAIGN_ROLES, PLATFORMS, PLATFORM_KEYS, roleDef, STAGES } from '../../../lib/agents/campaignTeam';
import { conflictMessage, sameModeConflict } from '../../../lib/agents/operationCycles';
import { supabase } from '../../../lib/supabaseClient';
import { MODES, MODE_ORDER, litNodes, modeEstimate, modeHasDepartment, modeRoles, shortName } from '../../../lib/agents/campaignModes';
import { CREATIVE_OPTIONAL, CREATIVE_REQUIRED, CREATIVE_ROLES, CREATIVE_STAGES, creativeAutofill } from '../../../lib/agents/creativeTeam';
import { fetchDeptClientSetup, saveCreativeSetup } from '../../../lib/api/creatives';
import { updateClientLink } from '../../../lib/api/deptAgents';
import QuarterDiagram from './QuarterDiagram';

const WEEKDAYS = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота', 'Неділя'];
const STEPS = ['Клієнт і режим', 'Налаштування агентів', 'Запуск'];
const REPORT_DAY = { weekday: 1, time: '10:00' }; // «Тільки звіт»: the cross-channel report runs on its own every Monday

const ICON_PATHS = {
  spark: ['m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', 'M19 17v4M17 19h4'],
  team: ['M9 11a3 3 0 100-6 3 3 0 000 6z', 'M3 20a6 6 0 0112 0', 'M17 11a3 3 0 100-6', 'M21 20a6 6 0 00-4-5.6'],
  compass: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M15.5 8.5l-2 5-5 2 2-5z'],
  chart: ['M4 20V10m6 10V4m6 16v-7'],
  doc: ['M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5', 'M9 13h6M9 17h6'],
};
function ModeIcon({ name }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{(ICON_PATHS[name] || ICON_PATHS.team).map((d) => <path key={d} d={d} />)}</svg>;
}

const platformLabel = (p) => PLATFORMS[p]?.label || p;
const scheduleText = (agent) => (agent.schedule?.weekday ? `щотижня, ${WEEKDAYS[agent.schedule.weekday - 1].toLowerCase()} о ${agent.schedule.time}` : agent.config?.trigger === 'upstream' ? 'після того, як закінчать агенти вище по ланцюжку' : 'один раз, при запуску');

function Field({ id, label, hint, children }) {
  return <div className="cmp-field"><label htmlFor={id}>{label}</label>{children}{hint && <span className="cmp-hint">{hint}</span>}</div>;
}

// «Створити операцію»: 1) the client and the channels, with the chain of agents lighting up for the chosen channels,
// 2) every agent set up for this client one after another, 3) the summary and the launch.
// the accent of an agent: the colour of its channel, violet for the common ones (the medallions of the agent menu)
const accentOfRole = (role) => { const d = roleDef(role); return !d || d.platforms.includes('*') ? '#EB9CEF' : PLATFORMS[d.platforms[0]]?.color || '#EB9CEF'; };

export default function CreateCampaignWizard({ onClose, onLaunched, notify, initialProjectId = null }) {
  const { email } = useAuth();
  const box = useRef(null);
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState('creative'); // one of MODE_ORDER; «Тільки креативи» is the default: nothing starts by itself
  const [clients, setClients] = useState(null);
  const [query, setQuery] = useState('');
  const [project, setProject] = useState(null);
  const [platforms, setPlatforms] = useState([]);
  const [campaign, setCampaign] = useState(null);
  const [team, setTeam] = useState(null);
  const [general, setGeneral] = useState({ name: '', language: 'uk', brief: '', goals: '' });
  const [forms, setForms] = useState({}); // agent id -> { enabled, config, schedule }
  const [creative, setCreative] = useState({ enabled: true, optional: { creative_analyst: true, creative_copywriter: true, creative_quality: true } }); // step 1: the department
  const [dept, setDept] = useState(null); // step 2: the agents of the department with this client's links
  const [deptForms, setDeptForms] = useState({}); // link id -> { config, filled } (filled: field -> where the autofill came from)
  const [idx, setIdx] = useState(0); // step 2: 0 = general, 1.. = the agents in chain order, then the agents of the department
  const [seen, setSeen] = useState(new Set([0]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState([]); // the operations of the chosen project: one of a kind may work at a time
  useDialogA11y(box, () => { if (!busy) onClose(); });

  useEffect(() => { fetchClientsForCampaigns().then((list) => { setClients(list); const p = initialProjectId != null ? list.find((c) => c.id === initialProjectId && c.accounts.length) : null; if (p) choose(p); }).catch((e) => { setClients([]); setError(e.message || 'Не вдалося завантажити клієнтів.'); }); }, []);

  const available = useMemo(() => new Set(project ? [...project.accounts.map((a) => a.platform).filter((p) => PLATFORMS[p]), 'tiktok'] : []), [project]);
  const choose = (p) => {
    setProject(p); setError('');
    setExisting([]);
    supabase.from('ag_campaigns').select('id, name, status, project_id, config').eq('project_id', p.id).then(({ data }) => {
      const rows = data || [];
      setExisting(rows);
      setMode((m) => (sameModeConflict(rows, { projectId: p.id, mode: m }) ? MODE_ORDER.find((k) => !sameModeConflict(rows, { projectId: p.id, mode: k })) || m : m)); // the first kind that is still free
    });
    const have = p.accounts.map((a) => a.platform).filter((x) => x === 'meta' || x === 'google');
    setPlatforms(have.length ? have : ['tiktok']);
  };
  const toggle = (k) => setPlatforms((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const modeDef = MODES[mode];
  const clashOf = (k) => (project ? sameModeConflict(existing, { projectId: project.id, mode: k, exceptId: campaign?.id ?? null }) : null);
  const clash = clashOf(mode);
  const roles = useMemo(() => modeRoles(mode, platforms), [mode, platforms]); // the agents of the campaign team this mode switches on
  const creativeOn = modeHasDepartment(mode, creative.enabled); // the department works in «Тільки креативи» and, when wanted, in «Повна операція»
  const lit = useMemo(() => litNodes(mode, platforms, { departmentWanted: creative.enabled, optional: creative.optional }), [mode, platforms, creative]);
  const chosenRoles = useMemo(() => (creativeOn ? [...CREATIVE_REQUIRED, ...CREATIVE_OPTIONAL.filter((r) => creative.optional[r])] : []), [creative, creativeOn]);
  const list = useMemo(() => (clients || []).filter((c) => c.accounts.length && (`${c.name} ${c.client || ''}`).toLowerCase().includes(query.trim().toLowerCase())), [clients, query]);

  // ---- step 1 -> 2: the campaign (a draft) and its team are created, the forms are filled from what is saved
  async function toAgents() {
    if (!project || !platforms.length) return;
    if (clash) { setError(conflictMessage(clash)); return; }
    setBusy(true); setError('');
    try {
      let c = campaign;
      let t;
      if (!c) { c = await createCampaign({ project, platforms, email }); t = await loadCampaignTeam(c, email); }
      else if ([...platforms].sort().join() !== [...c.platforms].sort().join()) { const r = await changeCampaignPlatforms(c, platforms, email); c = r.campaign; t = await loadCampaignTeam(c, email); }
      else t = await loadCampaignTeam(c, email);
      // the mode is kept in the campaign and decides which agents of the campaign team are on (the person may still switch single agents on the next step);
      // it is applied again only when the mode or the channels changed, so the switches the person made are not lost by going back and forth
      const applied = `${mode}:${[...platforms].sort().join()}`;
      if (c.config?.modeApplied !== applied) {
        const on = t.agents.filter((a) => roles.includes(a.role)).map((a) => a.id);
        const off = t.agents.filter((a) => !roles.includes(a.role)).map((a) => a.id);
        await Promise.all([setAgentsEnabled(on, true), setAgentsEnabled(off, false)]);
        const cross = t.agents.find((a) => a.role === 'cross_channel_report'); // «Тільки звіт»: nothing upstream starts it, so it runs by itself on Mondays
        if (cross) {
          const d = roleDef(cross.role);
          await saveAgent(cross.id, { config: { ...(cross.config || {}), trigger: mode === 'report' ? 'schedule' : d.trigger }, schedule: mode === 'report' ? REPORT_DAY : d.schedule }, email);
        }
        c = await updateCampaign(c.id, { config: { ...(c.config || {}), mode, modeApplied: applied, agentsConfigured: true } });
        t = await loadCampaignTeam(c, email);
      }
      c = await saveCreativeSetup(c, { enabled: creativeOn, roles: chosenRoles }, email); // the client is linked to the chosen agents of the department
      setDept(creativeOn ? await fetchDeptClientSetup(c, email) : null);
      setDeptForms({});
      setCampaign(c); setTeam(t);
      setGeneral({ name: c.name, language: c.config?.language || 'uk', brief: c.config?.brief || '', goals: c.config?.goals || '' });
      const f = {};
      t.agents.forEach((a) => { f[a.id] = { enabled: c.config?.agentsConfigured ? a.enabled : true, config: { ...(a.config || {}) }, schedule: a.schedule }; });
      const first = modeDef.brief ? 0 : 1; // only some modes have the general page (the brief); the others start with the first agent
      setForms(f); setStep(2); setIdx(first); setSeen(new Set([first]));
    } catch (e) { setError(e.message || 'Не вдалося створити операцію.'); } finally { setBusy(false); }
  }

  const ordered = useMemo(() => (team ? CAMPAIGN_ROLES.filter((r) => roles.includes(r.role)).map((r) => team.agents.find((a) => a.role === r.role)).filter(Boolean) : []), [team, roles]);
  // the steps after «Загальне»: the agents of the campaign team, then the agents of the department that work for this client
  const deptItems = useMemo(() => (dept ? CREATIVE_ROLES.map((d) => {
    const agent = dept.agents.find((a) => a.role === d.role);
    const link = agent && dept.links.find((l) => l.agent_id === agent.id && l.enabled);
    return agent && link && chosenRoles.includes(d.role) ? { kind: 'dept', agent, link, def: d } : null;
  }).filter(Boolean) : []), [dept, chosenRoles]);
  const stepItems = useMemo(() => [...ordered.map((agent) => ({ kind: 'campaign', agent })), ...deptItems], [ordered, deptItems]);
  const item = idx > 0 ? stepItems[idx - 1] : null;
  const current = item?.kind === 'campaign' ? item.agent : null;
  const deptItem = item?.kind === 'dept' ? item : null;
  const def = current ? CAMPAIGN_ROLES.find((r) => r.role === current.role) : null;
  const auto = useMemo(() => creativeAutofill({ project: project || {}, goals: general.goals, projectCreative: dept?.projectCreative }), [project, general.goals, dept]);
  // the form of an agent of the department is filled by the card of the project the first time it is opened; what the person typed is never replaced
  const deptForm = deptItem ? deptForms[deptItem.link.id] || prepareDept(deptItem) : null;
  function prepareDept(it) {
    const config = { ...(it.link.config || {}) };
    const filled = {};
    (it.def.clientFields || []).forEach((f) => { if (!String(config[f.key] || '').trim() && auto.fields[f.key]) { config[f.key] = auto.fields[f.key]; filled[f.key] = auto.from[f.key]; } });
    return { config, filled };
  }
  const setDeptCfg = (k, v) => setDeptForms((f) => { const cur = f[deptItem.link.id] || prepareDept(deptItem); return { ...f, [deptItem.link.id]: { config: { ...cur.config, [k]: v }, filled: { ...cur.filled, [k]: null } } }; });
  const setForm = (patch) => setForms((f) => ({ ...f, [current.id]: { ...f[current.id], ...patch } }));
  const setCfg = (k, v) => setForms((f) => ({ ...f, [current.id]: { ...f[current.id], config: { ...f[current.id].config, [k]: v } } }));

  // saves what is on screen (the general part or the current agent)
  const saveCurrent = useCallback(async () => {
    if (idx === 0) {
      await updateCampaign(campaign.id, { name: general.name.trim() || campaign.name, config: { ...(campaign.config || {}), language: general.language, brief: general.brief.trim(), goals: general.goals.trim() } });
    } else if (current) {
      const f = forms[current.id];
      await saveAgent(current.id, { config: f.config, schedule: f.schedule }, email);
    } else if (deptItem) {
      const f = deptForms[deptItem.link.id] || prepareDept(deptItem);
      await updateClientLink(deptItem.link.id, { config: f.config }); // the client's own fields of the agent of the department
    }
  }, [idx, campaign, general, current, deptItem, forms, deptForms, email]); // eslint-disable-line react-hooks/exhaustive-deps

  async function go(to) {
    setBusy(true); setError('');
    try {
      await saveCurrent();
      if (to === 'summary') {
        // the on/off switches of all agents are written once, here («Тільки креативи»: the campaign team stays off, nothing to write)
        const on = ordered.filter((a) => forms[a.id]?.enabled).map((a) => a.id);
        const off = ordered.filter((a) => !forms[a.id]?.enabled).map((a) => a.id);
        await Promise.all([setAgentsEnabled(on, true), setAgentsEnabled(off, false)]);
        const merged = { ...campaign, name: general.name.trim() || campaign.name, config: { ...(campaign.config || {}), language: general.language, brief: general.brief.trim(), goals: general.goals.trim(), agentsConfigured: true } };
        await updateCampaign(campaign.id, { config: merged.config });
        setCampaign(merged);
        setTeam(await loadCampaignTeam(merged, email));
        setStep(3);
      } else { setIdx(to); setSeen((s) => new Set(s).add(to)); }
    } catch (e) { setError(e.message || 'Не вдалося зберегти.'); } finally { setBusy(false); }
  }

  // ---- step 3
  const enabledAgents = team ? team.agents.filter((a) => a.enabled) : [];
  const warnings = useMemo(() => {
    if (!team || step !== 3 || mode === 'creative') return [];
    const w = [];
    const cfg = campaign?.config || {};
    if (!cfg.brief) w.push('Бриф операції порожній: агенти працюватимуть лише з даними кабінетів. Краще заповнити бриф.');
    platforms.forEach((p) => { if (!project.accounts.some((a) => a.platform === p) && p !== 'tiktok') w.push(`До проєкту не привʼязано кабінет ${platformLabel(p)}: аналітик цього каналу не зможе працювати.`); });
    const by = (r) => team.agents.find((a) => a.role === r);
    if (by('tiktok_analyst')?.enabled && !String(by('tiktok_analyst').config?.pasted || '').trim()) w.push('Для TikTok немає прямого підключення: вставте дані з рекламного кабінету в налаштуваннях аналітика TikTok, інакше він зупиниться з повідомленням.');
    if (by('competitor_research')?.enabled && !String(by('competitor_research').config?.competitors || '').trim()) w.push('Не вказано конкурентів: дослідник конкурентів не зможе працювати.');
    team.agents.filter((a) => !a.enabled).forEach((a) => {
      const stopped = dependents(a.id, team.links).map((id) => team.agents.find((x) => x.id === id)).filter((x) => x?.enabled);
      if (stopped.length) w.push(`«${a.name}» вимкнено, тому не працюватимуть: ${stopped.map((x) => x.name).join(', ')}.`);
    });
    return w;
  }, [team, step, campaign, platforms, project, mode]);

  async function launch() {
    setBusy(true); setError('');
    try {
      await launchCampaign(campaign.id);
      if (mode === 'creative') {
        notify?.('Клієнта підключено до відділу креативів. Заповніть новий цикл (запит на креативи).');
        onLaunched(campaign.id, { newRequest: true });
      } else {
        kickQueue().catch(() => {});
        notify?.('Операцію запущено: перші агенти вже працюють.');
        onLaunched(campaign.id, { newRequest: creativeOn }); // the regular cycle of the creatives is set up at once (the form opens)
      }
    } catch (e) { setError(e.message || 'Не вдалося запустити.'); setBusy(false); }
  }

  return createPortal(
    <div className="cmp-overlay ai-immersive" data-ai-safe>
      <div ref={box} className="cmp-wizard cpw cow" role="dialog" aria-modal="true" aria-labelledby="cmp-wiz-title" tabIndex={-1}>
        <header className="cmp-wiz-head">
          <div>
            <span className="cmp-kicker">Нова операція</span>
            <h2 id="cmp-wiz-title">Створити команду агентів для клієнта</h2>
          </div>
          <button type="button" className="cmp-x" onClick={onClose} disabled={busy} aria-label="Закрити"><ActionIcon name="close" size={20} /></button>
        </header>
        <ol className="cpw-line" aria-label="Кроки">
          {STEPS.map((st, i) => (
            <Fragment key={st}>
              {i > 0 && <li className={'cpw-ln' + (step >= i + 1 ? ' is-done' : '')} aria-hidden="true" />}
              <li className={'cpw-st' + (step === i + 1 ? ' is-current' : step > i + 1 ? ' is-done' : '')} aria-current={step === i + 1 ? 'step' : undefined}><i>{step > i + 1 ? <ActionIcon name="select" size={14} /> : i + 1}</i>{st}</li>
            </Fragment>
          ))}
        </ol>

        <div className="cmp-wiz-body">
          {error && <p className="cmp-error" role="alert">{error}</p>}

          {step === 1 && (
            <div className={'cmp-step1' + (project ? ' has-client' : '')}>
              {project ? (
                <section className="cmp-chosen" aria-label="Обраний клієнт">
                  <div>
                    <span className="cmp-kicker">1. Клієнт</span>
                    <b>{project.name}</b>
                    <span className="cmp-client-sub">{project.client || 'Кабінети проєкту:'}</span>
                    <span className="cmp-client-badges">{project.accounts.map((a) => <em key={a.platform} style={{ '--c': PLATFORMS[a.platform]?.color || '#EB9CEF' }}>{platformLabel(a.platform)}</em>)}</span>
                  </div>
                  <button type="button" className="cmp-btn" onClick={() => { setProject(null); setPlatforms([]); }}>Змінити клієнта</button>
                </section>
              ) : (
              <section className="cmp-clientpick">
                <h3>1. Оберіть клієнта з кабінетом у CRM</h3>
                <input className="cmp-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пошук клієнта або проєкту" aria-label="Пошук клієнта" />
                {clients === null && <p className="cmp-muted">Завантаження…</p>}
                {clients && !list.length && <p className="cmp-muted">Немає проєктів із привʼязаним рекламним кабінетом{query ? ' за цим пошуком' : ''}. Привʼяжіть кабінет у проєкті.</p>}
                <ul className="cmp-clients">
                  {list.map((c) => (
                    <li key={c.id}>
                      <button type="button" className={'cmp-client' + (project?.id === c.id ? ' is-active' : '')} onClick={() => choose(c)} aria-pressed={project?.id === c.id}>
                        <span className="cpw-av" aria-hidden="true">{(c.name || '?').charAt(0).toUpperCase()}</span>
                        <span className="cpw-cl-tx"><span className="cmp-client-name">{c.name}</span><span className="cmp-client-sub">{c.client || '—'}</span></span>
                        <span className="cmp-client-badges">{c.accounts.map((a) => <em key={a.platform} style={{ '--c': PLATFORMS[a.platform]?.color || '#EB9CEF' }}>{platformLabel(a.platform)}</em>)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              )}

              <section className={'cmp-schemebox' + (project ? ' is-open' : '')} aria-hidden={!project}>
                {project && (
                  <>
                    <div className="cmp-modes">
                      <h3>2. Що створюємо для «{project.name}»?</h3>
                      <p className="cmp-muted">Це визначає, що саме запуститься і чи будуть витрати.</p>
                      <div className="cmp-modepick">
                        <div className="cmp-modelist" role="radiogroup" aria-label="Режим">
                          {MODE_ORDER.map((k) => (
                            <button key={k} type="button" role="radio" aria-checked={mode === k} aria-disabled={!!clashOf(k)} className={'cmp-moderow' + (mode === k ? ' is-on' : '') + (clashOf(k) ? ' is-taken' : '')} onClick={() => setMode(k)}>
                              <span className="cmp-modeicon cmp-modeicon--sm"><ModeIcon name={MODES[k].icon} /></span>
                              <span><b>{MODES[k].title}</b><small>{clashOf(k) ? 'уже працює в цьому проєкті' : MODES[k].sub}</small></span>
                              <span className="cmp-radio" aria-hidden="true" />
                            </button>
                          ))}
                        </div>
                        <div className="cmp-modepanel" aria-live="polite">
                          <div className="cmp-modecard-top">
                            <span className="cmp-modeicon"><ModeIcon name={modeDef.icon} /></span>
                            <span><b>{modeDef.title}</b><small>{modeDef.sub}</small></span>
                          </div>
                          <p className="cmp-modecard-text">{modeDef.text}</p>
                          {clash && <p className="cmp-strip cmp-strip--warn" role="alert"><b>Така операція вже працює.</b> {conflictMessage(clash)}</p>}
                          <span className="cmp-modechips">
                            <span className={'cmp-modechip ' + (modeDef.safe ? 'is-ok' : 'is-warn')}><i />Старт: {modeDef.start}</span>
                            <span className={'cmp-modechip ' + (modeDef.safe ? 'is-ok' : 'is-warn')}><i />Витрати: {modeDef.cost}</span>
                          </span>
                          <div className="cmp-who">
                            <small>Хто працює</small>
                            <span className="cmp-who-chips">
                              {roles.map((r) => <span key={r} className="cmp-whochip">{roleDef(r).name}</span>)}
                              {creativeOn && CREATIVE_ROLES.filter((d) => chosenRoles.includes(d.role)).map((d) => <span key={d.role} className="cmp-whochip is-dept">{shortName(d.name)}</span>)}
                            </span>
                          </div>
                          {modeDef.safe
                            ? <p className="cmp-strip cmp-strip--safe" role="status"><b>Безпечний режим.</b> Після створення нічого не запускається: агенти чекають на ваш запит.</p>
                            : <p className="cmp-strip cmp-strip--warn" role="status"><b>Агенти стартують одразу.</b> Після «Запустити» вони починають працювати й витрачають гроші на виклики моделі: ≈ ${modeEstimate(mode, platforms).toFixed(2)} {modeDef.repeat ? 'за запуск, далі щотижня' : 'разово'} (оцінка, 0.07 за агента).</p>}
                        </div>
                      </div>
                    </div>
                    {modeDef.channels ? (
                      <div className="cmp-platforms">
                        <h3>3. Які канали ведемо для «{project.name}»?</h3>
                        <div className="cmp-chips" role="group" aria-label="Канали операції">
                          {PLATFORM_KEYS.map((k) => {
                            const ok = available.has(k);
                            const hasAccount = project.accounts.some((a) => a.platform === k);
                            return (
                              <button key={k} type="button" className={'cmp-chip' + (platforms.includes(k) ? ' is-on' : '')} style={{ '--c': PLATFORMS[k].color }} disabled={!ok} aria-pressed={platforms.includes(k)} onClick={() => toggle(k)} title={!hasAccount && k !== 'tiktok' ? 'Кабінет не привʼязано до проєкту' : undefined}>
                                <i aria-hidden="true" />{PLATFORMS[k].label}{!hasAccount && <small>{k === 'tiktok' ? 'дані вручну' : 'немає кабінету'}</small>}
                              </button>
                            );
                          })}
                        </div>
                        <p className="cmp-muted">Можна обрати кілька каналів разом. На схемі підсвічено агентів, які працюватимуть, решта згасає.</p>
                      </div>
                    ) : (
                      <p className="cmp-muted">Канали для цього режиму не потрібні. Кабінети проєкту (Meta, Google) агенти використовують лише для читання результатів, нічого в кабінетах не змінюється.</p>
                    )}
                    {mode !== 'creative' && (<>
                      <div className="cmp-scheme"><QuarterDiagram lit={lit} /></div>
                      <p className="cmp-legend cmp-legend--scheme"><span><i className="is-solid" />обовʼязковий звʼязок</span><span><i className="is-dash" />необовʼязковий</span><span>Згаслі картки: цього режиму чи каналу немає, цих агентів не буде</span></p>
                      <p className="cmp-count">Агентів операції в цьому режимі: <b>{roles.length}</b>{creativeOn ? ` + ${chosenRoles.length} у відділі креативів` : ''}</p>
                    </>)}
                    {(mode === 'creative' || mode === 'full') && (
                      <div className={'cmp-dept' + (creativeOn ? '' : ' is-off')}>
                        <div className="cmp-dept-head">
                          <h3>{mode === 'creative' ? '' : 'Додатково: '}Відділ креативів для «{project.name}»</h3>
                          {mode === 'full' && <label className="cmp-switch"><input type="checkbox" checked={creative.enabled} onChange={(e) => setCreative((c) => ({ ...c, enabled: e.target.checked }))} /><span>{creative.enabled ? 'Підключено' : 'Не підключати'}</span></label>}
                        </div>
                        <p className="cmp-muted">Агенти відділу спільні для всіх клієнтів і працюють по черзі: клієнт лише підключається до них, нових копій не створюється. Креативи, тексти й технічні завдання робляться за запитами менеджера.</p>
                        {creativeOn && (
                          <ul className="cmp-dept-chain" aria-label="Агенти відділу креативів">
                            {CREATIVE_ROLES.map((d) => {
                              const required = CREATIVE_REQUIRED.includes(d.role);
                              const on = required || creative.optional[d.role];
                              return (
                                <li key={d.role} className={(required ? 'is-req' : 'is-opt') + (on ? '' : ' is-off')}>
                                  <b>{d.name}</b>
                                  <small>{d.short}</small>
                                  {required ? <em>обовʼязковий</em> : <label><input type="checkbox" checked={!!creative.optional[d.role]} onChange={(e) => setCreative((c) => ({ ...c, optional: { ...c.optional, [d.role]: e.target.checked } }))} /> бере участь</label>}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {creativeOn && <p className="cmp-muted cmp-dept-legend">Суцільна рамка: без цього агента відділ не працює. Пунктир: можна вимкнути для цього клієнта.</p>}
                      </div>
                    )}
                  </>
                )}
                {!project && <p className="cmp-placeholder">Оберіть клієнта зліва: тут зʼявиться схема агентів і вибір каналів.</p>}
              </section>
            </div>
          )}

          {step === 2 && team && (
            <div className="cmp-step2">
              <nav className="cmp-agentnav" aria-label="Агенти операції">
                <ol>
                  {modeDef.brief && <li><button type="button" className={idx === 0 ? 'is-current' : seen.has(0) ? 'is-seen' : ''} style={{ '--c': '#EB9CEF' }} onClick={() => go(0)} disabled={busy}><i className="cow-n" aria-hidden="true">·</i><span>Загальне про операцію</span></button></li>}
                  {ordered.map((a, i) => (
                    <li key={a.id}>
                      <button type="button" className={(idx === i + 1 ? 'is-current ' : seen.has(i + 1) ? 'is-seen ' : '') + (forms[a.id]?.enabled ? '' : 'is-off')} style={{ '--c': accentOfRole(a.role) }} onClick={() => go(i + 1)} disabled={busy}>
                        <i className="cow-n" aria-hidden="true">{i + 1}</i><span>{a.name}</span>{!forms[a.id]?.enabled && <small>вимкнено</small>}
                      </button>
                    </li>
                  ))}
                  {deptItems.length > 0 && <li className="cmp-agentnav-sep" aria-hidden="true">Відділ креативів</li>}
                  {deptItems.map((it, j) => {
                    const n = ordered.length + j + 1;
                    return (
                      <li key={it.agent.id}>
                        <button type="button" className={idx === n ? 'is-current' : seen.has(n) ? 'is-seen' : ''} style={{ '--c': '#EB9CEF' }} onClick={() => go(n)} disabled={busy}><i className="cow-n" aria-hidden="true">{n}</i><span>{it.agent.name}</span></button>
                      </li>
                    );
                  })}
                </ol>
              </nav>

              <section className="cmp-agentform">
                {idx === 0 && (
                  <>
                    <h3>Загальне про операцію</h3>
                    <p className="cmp-muted">Це бачать усі агенти операції. Чим конкретніше, тим точніші їхні висновки.</p>
                    <Field id="cmp-name" label="Назва операції"><input id="cmp-name" className="cmp-input" value={general.name} onChange={(e) => setGeneral((g) => ({ ...g, name: e.target.value }))} maxLength={120} /></Field>
                    <Field id="cmp-lang" label="Мова звітів"><select id="cmp-lang" className="cmp-input" value={general.language} onChange={(e) => setGeneral((g) => ({ ...g, language: e.target.value }))}><option value="uk">Українська</option><option value="en">English</option></select></Field>
                    <Field id="cmp-brief" label="Бриф: чим займається бізнес клієнта" hint="Що продають, кому, у якій країні, ціновий рівень, сезонність, що вже пробували."><textarea id="cmp-brief" className="cmp-input" rows={6} value={general.brief} onChange={(e) => setGeneral((g) => ({ ...g, brief: e.target.value }))} maxLength={4000} /></Field>
                    <Field id="cmp-goals" label="Цілі операції і KPI" hint="Наприклад: 200 лідів на місяць за CPL до $15, або ROAS від 3 при бюджеті $5000."><textarea id="cmp-goals" className="cmp-input" rows={3} value={general.goals} onChange={(e) => setGeneral((g) => ({ ...g, goals: e.target.value }))} maxLength={1500} /></Field>
                  </>
                )}
                {deptItem && deptForm && (
                  <>
                    <div className="cmp-agent-head">
                      <div>
                        <span className="cmp-kicker">{CREATIVE_STAGES.find((s) => s.key === deptItem.def.stage)?.label} · відділ креативів · агент {idx} з {stepItems.length}</span>
                        <h3>{deptItem.agent.name} · для «{project.name}»</h3>
                      </div>
                    </div>
                    <p className="cmp-muted">{deptItem.def.description}</p>
                    {auto.facts.length > 0 && <div className="cmp-dept-facts" aria-label="З картки проєкту">{auto.facts.map(([k, v]) => <span key={k}><small>{k}</small>{v}</span>)}</div>}
                    {(deptItem.def.clientFields || []).length === 0 ? (
                      <p className="cmp-note">Цьому агентові не потрібні окремі поля для клієнта: він бере дані з картки проєкту й вкладки «Креативи» проєкту (матеріали, Figma, кнопка, обмеження). Свої правила й промти агент має на своїй сторінці.</p>
                    ) : (
                      <>
                        {(deptItem.def.clientFields || []).map((fld) => (
                          <Field key={fld.key} id={'cmp-d-' + fld.key} label={fld.label} hint={fld.hint}>
                            <textarea id={'cmp-d-' + fld.key} className="cmp-input" rows={fld.rows || 3} value={deptForm.config[fld.key] || ''} onChange={(e) => setDeptCfg(fld.key, e.target.value)} maxLength={1500} />
                            {deptForm.filled[fld.key] && <span className="cmp-dept-from">{deptForm.filled[fld.key] === 'project' ? 'Заповнено з вкладки «Креативи» проєкту (обмеження клієнта)' : 'Заповнено з цілей операції'}: перевірте й поправте</span>}
                          </Field>
                        ))}
                        <p className="cmp-muted">Правила відділу, промти й режим роботи агента налаштовуються на його сторінці в AI Agents. Те, що не заповнене, лишається порожнім: нічого не вигадується.</p>
                      </>
                    )}
                  </>
                )}
                {idx > 0 && current && def && forms[current.id] && (
                  <>
                    <div className="cmp-agent-head">
                      <div>
                        <span className="cmp-kicker">{STAGES.find((s) => s.key === def.stage)?.label} · агент {idx} з {ordered.length}</span>
                        <h3>{current.name}</h3>
                      </div>
                      <label className="cmp-switch"><input type="checkbox" checked={forms[current.id].enabled} onChange={(e) => setForm({ enabled: e.target.checked })} /><span>{forms[current.id].enabled ? 'Бере участь' : 'Вимкнено'}</span></label>
                    </div>
                    <p className="cmp-muted">{def.description}</p>
                    {!forms[current.id].enabled && <p className="cmp-note">Агент вимкнено. Ті, хто залежить від нього, не працюватимуть: це буде видно в підсумку.</p>}
                    <div className={forms[current.id].enabled ? '' : 'cmp-disabled'}>
                      {def.fields.map((fld) => (
                        <Field key={fld.key} id={'cmp-f-' + fld.key} label={fld.label} hint={fld.hint}>
                          {fld.type === 'text'
                            ? <input id={'cmp-f-' + fld.key} className="cmp-input" value={forms[current.id].config[fld.key] || ''} onChange={(e) => setCfg(fld.key, e.target.value)} maxLength={300} />
                            : <textarea id={'cmp-f-' + fld.key} className="cmp-input" rows={fld.rows || 3} value={forms[current.id].config[fld.key] || ''} onChange={(e) => setCfg(fld.key, e.target.value)} maxLength={12000} />}
                        </Field>
                      ))}
                      <Field id="cmp-extra" label="Додаткова інструкція для цього клієнта" hint="Додається до промту агента лише для цієї операції. Повний промт можна редагувати після запуску.">
                        <textarea id="cmp-extra" className="cmp-input" rows={3} value={forms[current.id].config.extra || ''} onChange={(e) => setCfg('extra', e.target.value)} maxLength={2000} placeholder="Наприклад: писати коротко, завжди називати операції за іменем" />
                      </Field>
                      {def.schedule && forms[current.id].schedule && (
                        <div className="cmp-row2">
                          <Field id="cmp-day" label="День запуску"><select id="cmp-day" className="cmp-input" value={forms[current.id].schedule.weekday} onChange={(e) => setForm({ schedule: { ...forms[current.id].schedule, weekday: Number(e.target.value) } })}>{WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></Field>
                          <Field id="cmp-time" label="Час (Київ)"><input id="cmp-time" type="time" className="cmp-input" value={forms[current.id].schedule.time} onChange={(e) => setForm({ schedule: { ...forms[current.id].schedule, time: e.target.value } })} /></Field>
                        </div>
                      )}
                      {!def.schedule && <p className="cmp-muted">Коли працює: {scheduleText({ ...current, config: forms[current.id].config })}.</p>}
                    </div>
                  </>
                )}
              </section>
            </div>
          )}

          {step === 3 && team && campaign && mode === 'creative' && (
            <div className="cmp-step3 cmp-step3--creative">
              <section className="cmp-summary">
                <h3>Підсумок</h3>
                <dl>
                  <div><dt>Клієнт</dt><dd>{project.name}{project.client ? ` · ${project.client}` : ''}</dd></div>
                  <div><dt>Режим</dt><dd>Тільки креативи</dd></div>
                  <div><dt>Агенти відділу</dt><dd>{`${chosenRoles.length} з ${CREATIVE_ROLES.length}: ${CREATIVE_ROLES.filter((d) => chosenRoles.includes(d.role)).map((d) => shortName(d.name)).join(', ')}`}</dd></div>
                  <div><dt>Що запуститься</dt><dd>Нічого. Агенти чекають на запит</dd></div>
                  <div><dt>Витрати</dt><dd>0 до першого запиту. Вартість кожного запиту видно до генерації</dd></div>
                </dl>
                <p className="cmp-strip cmp-strip--safe" role="status"><b>Безпечний режим.</b> Нічого не публікується й не завантажується в рекламні кабінети: результат іде на ваше затвердження.</p>
              </section>
              <section className="cmp-flow">
                <b>Що буде далі</b>
                <ol>
                  <li>Відкриється сторінка клієнта з блоком «Відділ креативів».</li>
                  <li>Одразу відкриється форма «Новий цикл (запит на креативи)»: опишіть, що потрібно (канал, формати, настрій).</li>
                  <li>Стратег складе план, агент по ТЗ сформує завдання, копірайтер і креативщик підготують матеріали.</li>
                  <li>Готове перевірить контролер і віддасть вам на затвердження.</li>
                </ol>
              </section>
            </div>
          )}

          {step === 3 && team && campaign && mode !== 'creative' && (
            <div className="cmp-step3">
              <section className="cmp-summary">
                <h3>Підсумок перед запуском</h3>
                <p className="cmp-strip cmp-strip--warn" role="status"><b>Агенти стартують одразу</b> після «Запустити» й витрачають гроші на виклики моделі.</p>
                <dl>
                  <div><dt>Клієнт</dt><dd>{project.name}{project.client ? ` · ${project.client}` : ''}</dd></div>
                  <div><dt>Операція</dt><dd>{campaign.name}</dd></div>
                  <div><dt>Режим</dt><dd>{modeDef.title}</dd></div>
                  {modeDef.channels && <div><dt>Канали</dt><dd>{platforms.map(platformLabel).join(', ')}</dd></div>}
                  <div><dt>Мова звітів</dt><dd>{campaign.config?.language === 'en' ? 'English' : 'Українська'}</dd></div>
                  <div><dt>Агентів увімкнено</dt><dd>{enabledAgents.length} з {team.agents.length}</dd></div>
                  <div><dt>Відділ креативів</dt><dd>{creativeOn ? `${chosenRoles.length} з ${CREATIVE_ROLES.length} агентів: ${CREATIVE_ROLES.filter((d) => chosenRoles.includes(d.role)).map((d) => shortName(d.name)).join(', ')}` : 'не підключено'}</dd></div>
                  <div><dt>Орієнтовна вартість</dt><dd>≈ ${(enabledAgents.length * 0.07).toFixed(2)} {modeDef.repeat ? 'за запуск, далі щотижня' : 'разово'} (оцінка, точна сума в розділі «Витрати»)</dd></div>
                </dl>
                {warnings.length > 0 && (
                  <div className="cmp-warnbox" role="status"><b>Варто звернути увагу</b><ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>
                )}
                <div className="cmp-flow">
                  <b>Що буде після запуску</b>
                  <ol>
                    {modeDef.flow.map((t) => <li key={t}>{t}</li>)}
                    {creativeOn && mode !== 'creative' && <li>Відділ креативів чекає запитів: на сторінці операції, у блоці «Відділ креативів», натисніть «Новий цикл (запит на креативи)» і опишіть задачу.</li>}
                  </ol>
                </div>
                <ul className="cmp-agentlist">
                  {STAGES.map((s) => {
                    const items = team.agents.filter((a) => CAMPAIGN_ROLES.find((r) => r.role === a.role)?.stage === s.key);
                    return items.length ? (
                      <li key={s.key}><b>{s.label}</b>
                        <ul>{items.map((a) => <li key={a.id} className={a.enabled ? '' : 'is-off'}><span>{a.name}</span><small>{a.enabled ? scheduleText(a) : 'вимкнено'}</small></li>)}</ul>
                      </li>
                    ) : null;
                  })}
                </ul>
              </section>
              <section className="cmp-scheme cmp-scheme--small"><QuarterDiagram lit={lit} /></section>
            </div>
          )}
        </div>

        <footer className="cmp-wiz-foot">
          {step === 1 && (<><button type="button" className="cmp-btn" onClick={onClose}>Скасувати</button><button type="button" className="cmp-btn cmp-btn--primary" disabled={!project || !platforms.length || busy || !!clash} onClick={toAgents}>{busy ? 'Створюємо…' : 'Підтвердити й налаштувати агентів'}</button></>)}
          {step === 2 && (
            <>
              <button type="button" className="cmp-btn" onClick={() => (idx <= (modeDef.brief ? 0 : 1) ? setStep(1) : go(idx - 1))} disabled={busy}>Назад</button>
              <span className="cmp-foot-note">{idx === 0 ? 'Загальне' : `Агент ${idx} з ${stepItems.length}`}</span>
              {idx < stepItems.length ? <button type="button" className="cmp-btn cmp-btn--primary" onClick={() => go(idx + 1)} disabled={busy}>{busy ? 'Зберігаємо…' : 'Далі'}</button> : <button type="button" className="cmp-btn cmp-btn--primary" onClick={() => go('summary')} disabled={busy}>{busy ? 'Зберігаємо…' : 'До підсумку'}</button>}
              {idx < stepItems.length && <button type="button" className="cmp-btn" onClick={() => go('summary')} disabled={busy}>Пропустити решту</button>}
            </>
          )}
          {step === 3 && (<><button type="button" className="cmp-btn" onClick={() => setStep(2)} disabled={busy}>Назад до налаштувань</button><button type="button" className="cmp-btn cmp-btn--primary cmp-btn--launch" onClick={launch} disabled={busy || (mode !== 'creative' && !enabledAgents.length)}>{busy ? (mode === 'creative' ? 'Створюємо…' : 'Запускаємо…') : mode === 'creative' ? 'Створити й відкрити новий цикл' : 'Запустити'}</button></>)}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
