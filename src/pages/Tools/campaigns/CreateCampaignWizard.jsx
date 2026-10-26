import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ActionIcon from '../../../components/common/ActionIcon';
import { useAuth } from '../../../contexts/AuthContext';
import useDialogA11y from '../../../lib/useDialogA11y';
import { kickQueue, saveAgent } from '../../../lib/api/agents';
import { changeCampaignPlatforms, createCampaign, fetchClientsForCampaigns, launchCampaign, loadCampaignTeam, setAgentsEnabled, updateCampaign } from '../../../lib/api/campaigns';
import { dependents } from '../../../lib/agents/chain';
import { CAMPAIGN_ROLES, participants, PLATFORMS, PLATFORM_KEYS, STAGES } from '../../../lib/agents/campaignTeam';
import { CREATIVE_OPTIONAL, CREATIVE_REQUIRED, CREATIVE_ROLES, CREATIVE_STAGES, creativeAutofill } from '../../../lib/agents/creativeTeam';
import { fetchDeptClientSetup, saveCreativeSetup } from '../../../lib/api/creatives';
import { updateClientLink } from '../../../lib/api/deptAgents';
import ChainDiagram from './ChainDiagram';

const WEEKDAYS = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота', 'Неділя'];
const COST_PER_RUN = 0.07; // a rough price of one agent run, for the estimate on the last screen only
const STEPS = ['Клієнт і канали', 'Налаштування агентів', 'Запуск'];

const platformLabel = (p) => PLATFORMS[p]?.label || p;
const scheduleText = (agent) => (agent.schedule?.weekday ? `щотижня, ${WEEKDAYS[agent.schedule.weekday - 1].toLowerCase()} о ${agent.schedule.time}` : agent.config?.trigger === 'upstream' ? 'після того, як закінчать агенти вище по ланцюжку' : 'один раз, при запуску');

function Field({ id, label, hint, children }) {
  return <div className="cmp-field"><label htmlFor={id}>{label}</label>{children}{hint && <span className="cmp-hint">{hint}</span>}</div>;
}

// «Створити кампанію»: 1) the client and the channels, with the chain of agents lighting up for the chosen channels,
// 2) every agent set up for this client one after another, 3) the summary and the launch.
export default function CreateCampaignWizard({ onClose, onLaunched, notify }) {
  const { email } = useAuth();
  const box = useRef(null);
  const [step, setStep] = useState(1);
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
  useDialogA11y(box, () => { if (!busy) onClose(); });

  useEffect(() => { fetchClientsForCampaigns().then(setClients).catch((e) => { setClients([]); setError(e.message || 'Не вдалося завантажити клієнтів.'); }); }, []);

  const available = useMemo(() => new Set(project ? [...project.accounts.map((a) => a.platform).filter((p) => PLATFORMS[p]), 'tiktok'] : []), [project]);
  const choose = (p) => {
    setProject(p); setError('');
    const have = p.accounts.map((a) => a.platform).filter((x) => x === 'meta' || x === 'google');
    setPlatforms(have.length ? have : ['tiktok']);
  };
  const toggle = (k) => setPlatforms((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const active = useMemo(() => new Set(participants(platforms).map((r) => r.role)), [platforms]);
  const chosenRoles = useMemo(() => (creative.enabled ? [...CREATIVE_REQUIRED, ...CREATIVE_OPTIONAL.filter((r) => creative.optional[r])] : []), [creative]);
  const list = useMemo(() => (clients || []).filter((c) => c.accounts.length && (`${c.name} ${c.client || ''}`).toLowerCase().includes(query.trim().toLowerCase())), [clients, query]);

  // ---- step 1 -> 2: the campaign (a draft) and its team are created, the forms are filled from what is saved
  async function toAgents() {
    if (!project || !platforms.length) return;
    setBusy(true); setError('');
    try {
      let c = campaign;
      let t;
      if (!c) { c = await createCampaign({ project, platforms, email }); t = await loadCampaignTeam(c, email); }
      else if ([...platforms].sort().join() !== [...c.platforms].sort().join()) { const r = await changeCampaignPlatforms(c, platforms, email); c = r.campaign; t = await loadCampaignTeam(c, email); }
      else t = await loadCampaignTeam(c, email);
      c = await saveCreativeSetup(c, { enabled: creative.enabled, roles: chosenRoles }, email); // the client is linked to the chosen agents of the department
      setDept(creative.enabled ? await fetchDeptClientSetup(c, email) : null);
      setDeptForms({});
      setCampaign(c); setTeam(t);
      setGeneral({ name: c.name, language: c.config?.language || 'uk', brief: c.config?.brief || '', goals: c.config?.goals || '' });
      const f = {};
      t.agents.forEach((a) => { f[a.id] = { enabled: c.config?.agentsConfigured ? a.enabled : true, config: { ...(a.config || {}) }, schedule: a.schedule }; });
      setForms(f); setStep(2); setIdx(0); setSeen(new Set([0]));
    } catch (e) { setError(e.message || 'Не вдалося створити кампанію.'); } finally { setBusy(false); }
  }

  const ordered = useMemo(() => (team ? CAMPAIGN_ROLES.map((r) => team.agents.find((a) => a.role === r.role)).filter(Boolean) : []), [team]);
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
        // the on/off switches of all agents are written once, here
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
    if (!team || step !== 3) return [];
    const w = [];
    const cfg = campaign?.config || {};
    if (!cfg.brief) w.push('Бриф кампанії порожній: агенти працюватимуть лише з даними кабінетів. Краще заповнити бриф.');
    platforms.forEach((p) => { if (!project.accounts.some((a) => a.platform === p) && p !== 'tiktok') w.push(`До проєкту не привʼязано кабінет ${platformLabel(p)}: аналітик цього каналу не зможе працювати.`); });
    const by = (r) => team.agents.find((a) => a.role === r);
    if (by('tiktok_analyst')?.enabled && !String(by('tiktok_analyst').config?.pasted || '').trim()) w.push('Для TikTok немає прямого підключення: вставте дані з рекламного кабінету в налаштуваннях аналітика TikTok, інакше він зупиниться з повідомленням.');
    if (by('competitor_research')?.enabled && !String(by('competitor_research').config?.competitors || '').trim()) w.push('Не вказано конкурентів: дослідник конкурентів не зможе працювати.');
    team.agents.filter((a) => !a.enabled).forEach((a) => {
      const stopped = dependents(a.id, team.links).map((id) => team.agents.find((x) => x.id === id)).filter((x) => x?.enabled);
      if (stopped.length) w.push(`«${a.name}» вимкнено, тому не працюватимуть: ${stopped.map((x) => x.name).join(', ')}.`);
    });
    return w;
  }, [team, step, campaign, platforms, project]);

  async function launch() {
    setBusy(true); setError('');
    try {
      await launchCampaign(campaign.id);
      kickQueue().catch(() => {});
      notify?.('Кампанію запущено: перші агенти вже працюють.');
      onLaunched(campaign.id);
    } catch (e) { setError(e.message || 'Не вдалося запустити.'); setBusy(false); }
  }

  return createPortal(
    <div className="cmp-overlay ai-immersive" data-ai-safe>
      <div ref={box} className="cmp-wizard" role="dialog" aria-modal="true" aria-labelledby="cmp-wiz-title" tabIndex={-1}>
        <header className="cmp-wiz-head">
          <div>
            <span className="cmp-kicker">Нова кампанія</span>
            <h2 id="cmp-wiz-title">Створити команду агентів для клієнта</h2>
          </div>
          <ol className="cmp-steps" aria-label="Кроки">
            {STEPS.map((s, i) => <li key={s} className={step === i + 1 ? 'is-current' : step > i + 1 ? 'is-done' : ''}><i>{step > i + 1 ? <ActionIcon name="select" size={14} /> : i + 1}</i>{s}</li>)}
          </ol>
          <button type="button" className="cmp-x" onClick={onClose} disabled={busy} aria-label="Закрити"><ActionIcon name="close" size={20} /></button>
        </header>

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
                        <span className="cmp-client-name">{c.name}</span>
                        <span className="cmp-client-sub">{c.client || '—'}</span>
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
                    <div className="cmp-platforms">
                      <h3>2. Які канали ведемо для «{project.name}»?</h3>
                      <div className="cmp-chips" role="group" aria-label="Канали кампанії">
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
                      <p className="cmp-muted">Можна обрати кілька каналів разом. На схемі підсвічено агентів, які працюватимуть над цією кампанією, решта згасає.</p>
                    </div>
                    <div className="cmp-scheme"><ChainDiagram active={active} /></div>
                    <p className="cmp-count">Агентів у кампанії: <b>{active.size}</b> з {CAMPAIGN_ROLES.length}</p>
                    <div className={'cmp-dept' + (creative.enabled ? '' : ' is-off')}>
                      <div className="cmp-dept-head">
                        <h3>Відділ креативів для «{project.name}»</h3>
                        <label className="cmp-switch"><input type="checkbox" checked={creative.enabled} onChange={(e) => setCreative((c) => ({ ...c, enabled: e.target.checked }))} /><span>{creative.enabled ? 'Підключено' : 'Не підключати'}</span></label>
                      </div>
                      <p className="cmp-muted">Агенти відділу спільні для всіх клієнтів і працюють по черзі: клієнт лише підключається до них, нових копій не створюється. Креативи, тексти й технічні завдання робляться за запитами менеджера.</p>
                      {creative.enabled && (
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
                      {creative.enabled && <p className="cmp-muted cmp-dept-legend">Суцільна рамка: без цього агента відділ не працює. Пунктир: можна вимкнути для цього клієнта.</p>}
                    </div>
                  </>
                )}
                {!project && <p className="cmp-placeholder">Оберіть клієнта зліва: тут зʼявиться схема агентів і вибір каналів.</p>}
              </section>
            </div>
          )}

          {step === 2 && team && (
            <div className="cmp-step2">
              <nav className="cmp-agentnav" aria-label="Агенти кампанії">
                <ol>
                  <li><button type="button" className={idx === 0 ? 'is-current' : seen.has(0) ? 'is-seen' : ''} onClick={() => go(0)} disabled={busy}>Загальне про кампанію</button></li>
                  {ordered.map((a, i) => (
                    <li key={a.id}>
                      <button type="button" className={(idx === i + 1 ? 'is-current ' : seen.has(i + 1) ? 'is-seen ' : '') + (forms[a.id]?.enabled ? '' : 'is-off')} onClick={() => go(i + 1)} disabled={busy}>
                        <span>{a.name}</span>{!forms[a.id]?.enabled && <small>вимкнено</small>}
                      </button>
                    </li>
                  ))}
                  {deptItems.length > 0 && <li className="cmp-agentnav-sep" aria-hidden="true">Відділ креативів</li>}
                  {deptItems.map((it, j) => {
                    const n = ordered.length + j + 1;
                    return (
                      <li key={it.agent.id}>
                        <button type="button" className={idx === n ? 'is-current' : seen.has(n) ? 'is-seen' : ''} onClick={() => go(n)} disabled={busy}><span>{it.agent.name}</span></button>
                      </li>
                    );
                  })}
                </ol>
              </nav>

              <section className="cmp-agentform">
                {idx === 0 && (
                  <>
                    <h3>Загальне про кампанію</h3>
                    <p className="cmp-muted">Це бачать усі агенти кампанії. Чим конкретніше, тим точніші їхні висновки.</p>
                    <Field id="cmp-name" label="Назва кампанії"><input id="cmp-name" className="cmp-input" value={general.name} onChange={(e) => setGeneral((g) => ({ ...g, name: e.target.value }))} maxLength={120} /></Field>
                    <Field id="cmp-lang" label="Мова звітів"><select id="cmp-lang" className="cmp-input" value={general.language} onChange={(e) => setGeneral((g) => ({ ...g, language: e.target.value }))}><option value="uk">Українська</option><option value="en">English</option></select></Field>
                    <Field id="cmp-brief" label="Бриф: чим займається бізнес клієнта" hint="Що продають, кому, у якій країні, ціновий рівень, сезонність, що вже пробували."><textarea id="cmp-brief" className="cmp-input" rows={6} value={general.brief} onChange={(e) => setGeneral((g) => ({ ...g, brief: e.target.value }))} maxLength={4000} /></Field>
                    <Field id="cmp-goals" label="Цілі кампанії і KPI" hint="Наприклад: 200 лідів на місяць за CPL до $15, або ROAS від 3 при бюджеті $5000."><textarea id="cmp-goals" className="cmp-input" rows={3} value={general.goals} onChange={(e) => setGeneral((g) => ({ ...g, goals: e.target.value }))} maxLength={1500} /></Field>
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
                            {deptForm.filled[fld.key] && <span className="cmp-dept-from">{deptForm.filled[fld.key] === 'project' ? 'Заповнено з вкладки «Креативи» проєкту (обмеження клієнта)' : 'Заповнено з цілей кампанії'}: перевірте й поправте</span>}
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
                      <Field id="cmp-extra" label="Додаткова інструкція для цього клієнта" hint="Додається до промту агента лише для цієї кампанії. Повний промт можна редагувати після запуску.">
                        <textarea id="cmp-extra" className="cmp-input" rows={3} value={forms[current.id].config.extra || ''} onChange={(e) => setCfg('extra', e.target.value)} maxLength={2000} placeholder="Наприклад: писати коротко, завжди називати кампанії за іменем" />
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

          {step === 3 && team && campaign && (
            <div className="cmp-step3">
              <section className="cmp-summary">
                <h3>Підсумок перед запуском</h3>
                <dl>
                  <div><dt>Клієнт</dt><dd>{project.name}{project.client ? ` · ${project.client}` : ''}</dd></div>
                  <div><dt>Кампанія</dt><dd>{campaign.name}</dd></div>
                  <div><dt>Канали</dt><dd>{platforms.map(platformLabel).join(', ')}</dd></div>
                  <div><dt>Мова звітів</dt><dd>{campaign.config?.language === 'en' ? 'English' : 'Українська'}</dd></div>
                  <div><dt>Агентів увімкнено</dt><dd>{enabledAgents.length} з {team.agents.length}</dd></div>
                  <div><dt>Відділ креативів</dt><dd>{creative.enabled ? `${chosenRoles.length} з ${CREATIVE_ROLES.length} агентів: ${CREATIVE_ROLES.filter((d) => chosenRoles.includes(d.role)).map((d) => d.name.replace(/^Агент /, '')).join(', ')}` : 'не підключено'}</dd></div>
                  <div><dt>Орієнтовна вартість</dt><dd>≈ ${(enabledAgents.length * COST_PER_RUN).toFixed(2)} за тиждень роботи (оцінка, точна сума в розділі «Витрати»)</dd></div>
                </dl>
                {warnings.length > 0 && (
                  <div className="cmp-warnbox" role="status"><b>Варто звернути увагу</b><ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>
                )}
                <div className="cmp-flow">
                  <b>Що буде після запуску</b>
                  <ol>
                    <li>Одразу стартують дослідники й аналітики каналів: читають бриф, сайти й дані кабінетів.</li>
                    <li>Стратег зводить дослідження; оптимізатори, креативи й копірайтер працюють за ланцюжком, контролер перевіряє.</li>
                    <li>Звіт і чернетка листа клієнту зʼявляються в кінці. Нічого не надсилається й не змінюється в кабінетах: усе чекає вашого рішення.</li>
                    <li>Далі аналітики запускаються щотижня за розкладом.</li>
                    {creative.enabled && <li>Відділ креативів чекає запитів: на сторінці кампанії, у блоці «Відділ креативів», натисніть «Новий запит» і опишіть задачу.</li>}
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
              <section className="cmp-scheme cmp-scheme--small"><ChainDiagram active={new Set(enabledAgents.map((a) => a.role))} compact /></section>
            </div>
          )}
        </div>

        <footer className="cmp-wiz-foot">
          {step === 1 && (<><button type="button" className="cmp-btn" onClick={onClose}>Скасувати</button><button type="button" className="cmp-btn cmp-btn--primary" disabled={!project || !platforms.length || busy} onClick={toAgents}>{busy ? 'Створюємо…' : 'Підтвердити й налаштувати агентів'}</button></>)}
          {step === 2 && (
            <>
              <button type="button" className="cmp-btn" onClick={() => (idx === 0 ? setStep(1) : go(idx - 1))} disabled={busy}>Назад</button>
              <span className="cmp-foot-note">{idx === 0 ? 'Загальне' : `Агент ${idx} з ${stepItems.length}`}</span>
              {idx < stepItems.length ? <button type="button" className="cmp-btn cmp-btn--primary" onClick={() => go(idx + 1)} disabled={busy}>{busy ? 'Зберігаємо…' : 'Далі'}</button> : <button type="button" className="cmp-btn cmp-btn--primary" onClick={() => go('summary')} disabled={busy}>{busy ? 'Зберігаємо…' : 'До підсумку'}</button>}
              {idx < stepItems.length && <button type="button" className="cmp-btn" onClick={() => go('summary')} disabled={busy}>Пропустити решту</button>}
            </>
          )}
          {step === 3 && (<><button type="button" className="cmp-btn" onClick={() => setStep(2)} disabled={busy}>Назад до налаштувань</button><button type="button" className="cmp-btn cmp-btn--primary cmp-btn--launch" onClick={launch} disabled={busy || !enabledAgents.length}>{busy ? 'Запускаємо…' : 'Запустити кампанію'}</button></>)}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
