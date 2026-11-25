import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../components/common/ConfirmDialog';
import { fetchSettingsData, saveConfig, saveNotifyChat, setSmallActions } from '../../lib/api/agentSettings';
import { saveLimits, setGlobalStop, setProjectCap, setProjectPaused } from '../../lib/api/workflow';
import { DEFAULTS, SPEC, getPath, resolveConfig, sourceOf } from '../../lib/workflow/agentConfig';
import ProjectAgentTab from '../../components/Projects/Agent/ProjectAgentTab';

// «Налаштування агентів» (owner's rule 2026-11-26: all the settings in one place, one page with two entrances: the card of a project and the section AI Agents).
// Two levels: «усі проєкти» and «цей проєкт» (it overrides the first). A change is saved with one button; a value of a project can be put back to the level above.
const SOURCE_NAME = { project: 'своє значення', global: 'як для всіх проєктів', default: 'типове' };

export default function AgentSettings({ projectId: fixedProject = null, onOpen }) {
  const { email } = useAuth();
  const [project, setProject] = useState(fixedProject);
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({}); // path → value | null (null = back to the level above)
  const [lim, setLim] = useState(null); // { monthly, project, own, chat } while edited
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [confirm, confirmDialog] = useConfirm();
  const scope = project ? 'project' : 'global';

  const load = useCallback(async () => {
    try { const d = await fetchSettingsData(project); setData(d); setDraft({}); setLim(null); setErr(''); } catch (e) { setErr(e.message || String(e)); }
  }, [project]);
  useEffect(() => { load(); }, [load]);

  const g = data?.settings?.config || {};
  const p = data?.state?.config || {};
  const base = useMemo(() => resolveConfig(g, scope === 'project' ? p : {}), [g, p, scope]);
  const above = useMemo(() => resolveConfig(g, {}), [g]); // what a project gets when it has no value of its own
  if (!data) return <div className="wf wf-page">{err ? <div className="wf-err" role="alert">{err}</div> : <div className="wf-load">Завантаження…</div>}</div>;

  const dirty = Object.keys(draft).length > 0 || !!lim;
  const val = (path) => (path in draft ? (draft[path] === null ? getPath(scope === 'project' ? above : DEFAULTS, path) : draft[path]) : getPath(base, path));
  const src = (path) => (path in draft ? (draft[path] === null ? (sourceOf(path, g, {}) === 'global' ? 'global' : 'default') : scope === 'project' ? 'project' : 'global') : sourceOf(path, g, scope === 'project' ? p : {}));
  const set = (path, v) => setDraft((d) => ({ ...d, [path]: v }));
  const run = async (fn, msg) => { setBusy(true); setErr(''); setOk(''); try { await fn(); await load(); setOk(msg || 'Збережено.'); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); } };

  async function saveAll() {
    await run(async () => {
      if (Object.keys(draft).length) await saveConfig({ scope, projectId: project, changes: draft }, email);
      if (lim) {
        if (scope === 'global') {
          if ('monthly' in lim || 'projectDefault' in lim) await saveLimits({ monthly_cap_usd: lim.monthly ?? data.settings.monthly_cap_usd, project_cap_default_usd: lim.projectDefault ?? data.settings.project_cap_default_usd });
          if ('chat' in lim) await saveNotifyChat(lim.chat);
        } else if ('own' in lim) await setProjectCap(project, lim.own, email);
      }
    }, 'Налаштування збережено.');
  }

  const field = (path) => {
    const s = SPEC[path];
    const v = val(path);
    const from = scope === 'project' ? src(path) : null;
    return (
      <div className="wf-set" key={path}>
        <div className="t"><b>{s.label}</b>{from && <span className={'wf-set-src ' + from}>{SOURCE_NAME[from]}</span>}</div>
        <div className="c">
          {s.type === 'bool'
            ? <label className="wf-sw"><input type="checkbox" aria-label={s.label} checked={!!v} onChange={(e) => set(path, e.target.checked)} /><i /></label>
            : <><input className="wf-bd-in wf-set-num" aria-label={s.label} inputMode="decimal" value={v ?? ''} onChange={(e) => set(path, e.target.value)} />{s.unit && <span className="wf-muted">{s.unit}</span>}</>}
          {scope === 'project' && from === 'project' && <button type="button" className="wf-btn sm" onClick={() => set(path, null)} title="Повернути значення, яке діє для всіх проєктів">Скинути</button>}
        </div>
      </div>
    );
  };
  const only = (paths) => paths.filter((x) => scope === 'global' || SPEC[x].scope === 'project');

  const st = data.state;
  return (
    <div className="wf wf-page wf-col">
      {confirmDialog}
      <div className="wf-card">
        <div className="wf-row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0 }}>Налаштування агентів</h3>
            <div className="wf-muted" style={{ fontSize: 13, marginTop: 4, maxWidth: 640 }}>Тут усе, що керує роботою агентів: коли працюють, скільки витрачають, що роблять самі, про що повідомляють. {scope === 'project' ? 'Значення цього проєкту мають перевагу над загальними.' : 'Ці значення діють для всіх проєктів, де немає власного.'}</div>
          </div>
          <div className="wf-row">
            <label htmlFor="wf-set-scope" className="wf-muted" style={{ fontSize: 12.5 }}>Для кого:</label>
            {fixedProject
              ? <select id="wf-set-scope" className="wf-bd-in" value={project ? 'project' : 'global'} onChange={(e) => setProject(e.target.value === 'project' ? fixedProject : null)} disabled={dirty}><option value="project">Цей проєкт (свої значення)</option><option value="global">Усі проєкти (за замовчуванням)</option></select>
              : <select id="wf-set-scope" className="wf-bd-in" value={project || ''} onChange={(e) => setProject(e.target.value ? Number(e.target.value) : null)} disabled={dirty}><option value="">Усі проєкти (за замовчуванням)</option>{data.projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
          </div>
        </div>
      </div>
      {err && <div className="wf-err" role="alert">{err}</div>}
      {ok && !dirty && <div className="wf-muted" role="status" style={{ fontSize: 13 }}>{ok}</div>}

      <div className="wf-set-grid">
        <div className="wf-card">
          <h3>Коли працюють</h3>
          {only(['optimize.every_hours', 'optimize.at_hour', 'optimize.skip_weekends', 'month_plan.day']).map(field)}
          <div className="wf-muted" style={{ fontSize: 12.5, marginTop: 8 }}>Оркестратор перевіряє, що пора робити, щохвилини, цілодобово. Розклад тижневого й місячного звітів для клієнта налаштовується нижче, у блоці «Звіти для клієнта».</div>
        </div>

        <div className="wf-card">
          <h3>Скільки можуть витрачати</h3>
          {scope === 'global' ? (
            <>
              <div className="wf-set"><div className="t"><b>Усі агенти на місяць</b></div><div className="c"><span className="wf-muted">$</span><input className="wf-bd-in wf-set-num" aria-label="Загальний ліміт на місяць" inputMode="decimal" value={lim?.monthly ?? data.settings.monthly_cap_usd} onChange={(e) => setLim((l) => ({ ...(l || {}), monthly: e.target.value }))} /></div></div>
              <div className="wf-set"><div className="t"><b>На один проєкт за замовчуванням</b></div><div className="c"><span className="wf-muted">$</span><input className="wf-bd-in wf-set-num" aria-label="Ліміт на проєкт" inputMode="decimal" value={lim?.projectDefault ?? data.settings.project_cap_default_usd} onChange={(e) => setLim((l) => ({ ...(l || {}), projectDefault: e.target.value }))} /></div></div>
            </>
          ) : (
            <div className="wf-set"><div className="t"><b>Ліміт цього проєкту на місяць</b><span className={'wf-set-src ' + (st?.cost_cap_usd != null ? 'project' : 'default')}>{st?.cost_cap_usd != null ? 'своє значення' : `як для всіх: $${data.settings.project_cap_default_usd}`}</span></div><div className="c"><span className="wf-muted">$</span><input className="wf-bd-in wf-set-num" aria-label="Ліміт проєкту" inputMode="decimal" placeholder={String(data.settings.project_cap_default_usd)} value={lim && 'own' in lim ? lim.own : st?.cost_cap_usd ?? ''} onChange={(e) => setLim({ own: e.target.value })} />{(st?.cost_cap_usd != null || (lim && lim.own)) && <button type="button" className="wf-btn sm" onClick={() => setLim({ own: '' })}>Скинути</button>}</div></div>
          )}
          {only(['video_per_month']).map(field)}
          <div className="wf-muted" style={{ fontSize: 12.5, marginTop: 8 }}>Коли ліміт вичерпано, кроки чекають, а вам приходить сповіщення. Витрати за місяць видно у вікні «Витрати».</div>
        </div>

        <div className="wf-card">
          <h3>Що роблять самі</h3>
          {scope === 'project' ? (
            <div className="wf-set"><div className="t"><b>Дрібні дії оптимізатора</b><span className="wf-muted" style={{ display: 'block', fontSize: 12.5 }}>{st?.auto_small_actions ? 'Увімкнено: сам призупиняє слабке оголошення (не останнє в групі) і піднімає бюджет доброї групи кроком у межах бюджету з брифу. Кожна дія в журналі з відкотом.' : 'Вимкнено: лише рекомендації, у кабінеті нічого не змінюється.'}</span></div><div className="c"><label className="wf-sw"><input type="checkbox" aria-label="Дрібні дії оптимізатора" checked={!!st?.auto_small_actions} disabled={busy || dirty} onChange={(e) => run(() => setSmallActions(project, e.target.checked, email), e.target.checked ? 'Дрібні дії ввімкнено.' : 'Дрібні дії вимкнено.')} /><i /></label></div></div>
          ) : <div className="wf-muted" style={{ fontSize: 13, marginBottom: 6 }}>Дрібні дії оптимізатора вмикаються окремо для кожного проєкту, за замовчуванням вимкнено. Оберіть проєкт угорі.</div>}
          {only(['small_actions.max_pauses', 'small_actions.max_scales']).map(field)}
          {scope === 'global' && field('reports_via_orchestrator')}
        </div>

        <div className="wf-card">
          <h3>Пороги рішень оптимізатора</h3>
          {only(['thresholds.learning_days', 'thresholds.min_spend_factor', 'thresholds.budget_step_pct', 'thresholds.budget_step_hours', 'thresholds.much_worse_factor']).map(field)}
          <div className="wf-muted" style={{ fontSize: 12.5, marginTop: 8 }}>Зміна бюджету більша за крок завжди йде на Апрув 3. Пороги підтверджує керівництво.</div>
        </div>

        {scope === 'global' && (
          <div className="wf-card">
            <h3>Про що повідомляти в Telegram</h3>
            <div className="wf-set"><div className="t"><b>ID чату</b><span className="wf-muted" style={{ display: 'block', fontSize: 12.5 }}>Порожньо: береться чат зі «Сповіщень» AI Agents</span></div><div className="c"><input className="wf-bd-in" style={{ width: 150 }} aria-label="ID чату Telegram" value={lim?.chat ?? data.settings.notify_telegram_chat ?? ''} onChange={(e) => setLim((l) => ({ ...(l || {}), chat: e.target.value }))} /></div></div>
            {['notify.approvals', 'notify.stopped', 'notify.cost_cap', 'notify.waiting', 'notify.waiting_after_min', 'notify.auto_actions', 'notify.digest', 'notify.digest_hour'].map(field)}
          </div>
        )}

        {scope === 'global' ? (
          <div className="wf-card wf-set-stop">
            <h3>Аварійна зупинка всіх агентів</h3>
            <div className="wf-muted" style={{ fontSize: 13, marginBottom: 8 }}>{data.settings.stopped ? `Зараз усе зупинено${data.settings.stopped_by ? ` (${data.settings.stopped_by})` : ''}: нові кроки не запускаються, у кабінети нічого не пишеться.` : 'Зупиняє всю роботу одразу в усіх проєктах. Зняти можна тут же.'}</div>
            {data.settings.stopped
              ? <button type="button" className="wf-btn p" disabled={busy} onClick={() => run(() => setGlobalStop(false, email), 'Роботу відновлено.')}>Відновити роботу</button>
              : <button type="button" className="wf-btn d" disabled={busy} onClick={async () => { if (await confirm({ title: 'Зупинити всіх агентів?', body: 'Нові кроки не запускаються, у кабінети нічого не пишеться, доки ви не відновите роботу.', confirmLabel: 'Зупинити все', danger: true })) run(() => setGlobalStop(true, email, 'Зупинено в налаштуваннях агентів'), 'Усе зупинено.'); }}>Зупинити все</button>}
          </div>
        ) : (
          <div className="wf-card">
            <h3>Пауза проєкту</h3>
            <div className="wf-muted" style={{ fontSize: 13, marginBottom: 8 }}>{st?.paused ? 'Проєкт на паузі: агенти нічого не планують і не запускають.' : 'Зупиняє роботу агентів лише в цьому проєкті.'}</div>
            <button type="button" className={'wf-btn' + (st?.paused ? ' p' : '')} disabled={busy} onClick={() => run(() => setProjectPaused(project, !st?.paused, email), st?.paused ? 'Паузу знято.' : 'Проєкт на паузі.')}>{st?.paused ? 'Зняти паузу' : 'Поставити на паузу'}</button>
          </div>
        )}
      </div>

      {scope === 'project' && (
        <div className="wf-col" key={'reports-' + project}>
          <div className="wf-card">
            <h3>Звіти для клієнта</h3>
            <div className="wf-muted" style={{ fontSize: 13 }}>Агент звітів (навичка Супроводу): які звіти робить, коли, для кого, кому й куди повідомляє. Тут же журнал його дій. Самі звіти лежать у вкладці «Звітність». Ці налаштування зберігаються окремою кнопкою «Зберегти» всередині блоку.</div>
          </div>
          <ProjectAgentTab projectId={project} />
        </div>
      )}

      {dirty && (
        <div className="wf-set-bar" role="region" aria-label="Незбережені зміни">
          <span>Є незбережені зміни</span>
          <button type="button" className="wf-btn" disabled={busy} onClick={() => { setDraft({}); setLim(null); }}>Скасувати</button>
          <button type="button" className="wf-btn p" disabled={busy} onClick={saveAll}>Зберегти зміни</button>
        </div>
      )}
      {onOpen && <div className="wf-muted" style={{ fontSize: 12.5 }}>Дізнатись, що саме роблять агенти, можна у вікні «Як це працює».</div>}
    </div>
  );
}
