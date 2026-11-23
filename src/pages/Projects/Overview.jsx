import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchOverviewData, saveLimits, setGlobalStop, setProjectCap, setProjectPaused } from '../../lib/api/workflow';
import { FILTERS, KIND, buildOverview, digestText, filterRows, money, usage } from '../../lib/workflow/overview';
import { STAGES } from '../../lib/workflow/view';
import { Pill } from '../../components/Workflow/parts';
import { useConfirm } from '../../components/common/ConfirmDialog';
import '../../styles/projectWorkspace.css'; // the look of the confirmation window

// «Огляд проєктів» (step A11, concept A «Пульт»): one strip per project: the six stages, who waits and for how long, what the agents spent against the limit.
// On top: the emergency stop of all agents, the counters, the spend against the limit and the preview of the daily digest.

function Bar({ spent, cap }) {
  const u = usage(spent, cap);
  return <div className={'wf-bar' + (u.hot ? ' hot' : '')} role="img" aria-label={`Витрачено ${money(spent)} з ${cap == null ? 'без ліміту' : money(cap)}`}><i style={{ width: (cap == null ? 0 : u.pct) + '%' }} /></div>;
}

function Pipe({ stage, bad }) {
  return (
    <div className="wf-pipe" role="img" aria-label={`Етап ${stage + 1} з ${STAGES.length}: ${STAGES[stage]?.title || ''}`}>
      {STAGES.map((s, i) => (
        <span key={s.n} className="wf-pipe-i">
          {i > 0 && <span className={'l' + (i <= stage ? ' done' : '')} />}
          <span className={'s' + (i < stage ? ' done' : i === stage ? ' cur' + (bad ? ' bad' : '') : '')} title={s.title}>{i < stage ? '✓' : i + 1}</span>
        </span>
      ))}
    </div>
  );
}

function Drawer({ row, ov, email, onDone, onOpen, setErr }) {
  const [capText, setCapText] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn) => { setBusy(true); setErr(''); try { await fn(); await onDone(); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); } };
  const k = KIND[row.kind];
  const box = useRef(null);
  useEffect(() => { box.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, []); // the panel opens under a long list: bring it into view
  return (
    <div className="wf-card wf-ov-drawer" ref={box}>
      <div className="wf-row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{row.name}</h3>
        <Pill tone={k.tone}>{k.label}</Pill>
      </div>
      <div style={{ marginTop: 6 }}><b>{row.what}</b>{row.who && <span className="wf-muted"> · чекаємо: {row.who}{row.age ? `, ${row.age} дн.` : ''}</span>}</div>
      {row.last && <p className="wf-muted" style={{ margin: '4px 0 10px' }}>{row.last}</p>}
      <div style={{ maxWidth: 320 }}>
        <div className="wf-muted" style={{ fontSize: 12.5 }}>Витрати агентів {money(row.cost)} з ліміту {row.cap == null ? 'немає' : money(row.cap)}{row.ownCap == null ? ' (загальний)' : ' (власний)'}</div>
        <Bar spent={row.cost} cap={row.cap} />
      </div>
      <div className="wf-row" style={{ marginTop: 12 }}>
        <button type="button" className="wf-btn p sm" onClick={() => onOpen(row, row.act === 'dossier' ? 'dossier' : row.act === 'tasks' ? 'tasks' : 'process')}>Відкрити проєкт</button>
        <button type="button" className="wf-btn sm" disabled={busy || ov.stopped} onClick={() => run(() => setProjectPaused(row.id, !row.paused, email))}>{row.paused ? 'Зняти паузу' : 'Поставити на паузу'}</button>
        <button type="button" className="wf-btn sm" onClick={() => { setEditing((x) => !x); setCapText(row.ownCap == null ? '' : String(row.ownCap)); }} aria-expanded={editing}>Змінити ліміт</button>
      </div>
      {editing && (
        <div className="wf-row" style={{ marginTop: 10 }}>
          <label htmlFor={'wf-cap-' + row.id} className="wf-muted" style={{ fontSize: 12.5 }}>Ліміт на місяць, $ (порожньо = загальний)</label>
          <input id={'wf-cap-' + row.id} className="wf-inp" inputMode="decimal" value={capText} onChange={(e) => setCapText(e.target.value)} style={{ width: 110 }} />
          <button type="button" className="wf-btn p sm" disabled={busy} onClick={() => run(async () => { await setProjectCap(row.id, capText.trim(), email); setEditing(false); })}>Зберегти</button>
        </div>
      )}
    </div>
  );
}

export default function Overview() {
  const { email } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const [limits, setLimits] = useState(null); // { monthly, project } while the limits are edited
  const load = useCallback(async () => {
    try { setData(await fetchOverviewData()); setErr(''); } catch (e) { setErr(e.message || String(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const ov = useMemo(() => (data ? buildOverview({ ...data, now: new Date() }) : null), [data]);
  if (!ov) return <div className="wf wf-page">{err ? <div className="wf-err" role="alert">{err}</div> : <div className="wf-load">Завантаження…</div>}</div>;

  const settings = data.settings;
  const rows = filterRows(ov.rows, filter);
  const chosen = ov.rows.find((r) => r.id === sel) || null;
  const total = usage(ov.spent, ov.cap);
  const go = (fn) => async () => { setBusy(true); setErr(''); try { await fn(); await load(); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); } };
  const open = (r, tab) => navigate(r.act === 'decide' ? '/projects/approvals' : `/projects/${r.id}?tab=${tab}`);

  return (
    <div className="wf wf-page">
      {confirmDialog}
      {err && <div className="wf-err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {settings.missing && <div className="wf-err" role="status" style={{ marginBottom: 12 }}>Налаштування системи ще не створено в базі (міграція 20261071): аварійну зупинку й ліміти поки не можна змінити.</div>}
      <div className="wf-card wf-ov-glob">
        {ov.stopped && (
          <div className="wf-ov-stopbar" role="alert">
            <span>Усі агенти зупинено{settings.stopped_by ? ` (${settings.stopped_by})` : ''}. Нові кроки не запускаються, у кабінети нічого не пишеться.</span>
            <button type="button" className="wf-btn sm" disabled={busy || settings.missing} onClick={go(() => setGlobalStop(false, email))}>Відновити роботу</button>
          </div>
        )}
        <div className="wf-row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0 }}>Мої проєкти · {ov.counts.all}</h3>
            <div className="wf-muted">{new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}</div>
          </div>
          {!ov.stopped && <button type="button" className="wf-btn d" disabled={busy || settings.missing} onClick={async () => { if (await confirm({ title: 'Зупинити всіх агентів?', body: 'Нові кроки не запускатимуться, і в рекламні кабінети нічого не писатиметься, доки ви не відновите роботу. Кроки, що вже виконуються, завершаться.', confirmLabel: 'Зупинити', danger: true })) await go(() => setGlobalStop(true, email, 'Аварійна зупинка з огляду проєктів.'))(); }}>Аварійна зупинка</button>}
        </div>
        <div className="wf-ov-nums">
          <div className={'wf-ov-num' + (ov.counts.needYou ? ' hot' : '')}><b>{ov.counts.needYou}</b><span>потрібна ваша дія або помилка</span></div>
          <div className="wf-ov-num"><b>{ov.counts.wait}</b><span>чекаємо на клієнта</span></div>
          <div className="wf-ov-num"><b>{ov.counts.ok}</b><span>працює без втручання</span></div>
          <div className="wf-ov-num">
            <b>{money(ov.spent)}</b>
            <span>витрачено агентами цього місяця{ov.cap != null ? ` з ${money(ov.cap)}` : ''}</span>
            <Bar spent={ov.spent} cap={ov.cap} />
            {total.over && <span className="wf-ov-warn">Загальний ліміт вичерпано: агенти чекають.</span>}
          </div>
        </div>
        <div className="wf-row" style={{ marginTop: 10 }}>
          <button type="button" className="wf-btn sm" aria-expanded={!!limits} onClick={() => setLimits(limits ? null : { monthly: String(settings.monthly_cap_usd), project: String(settings.project_cap_default_usd) })}>Ліміти витрат</button>
        </div>
        {limits && (
          <div className="wf-row" style={{ marginTop: 10 }}>
            <label htmlFor="wf-lim-m" className="wf-muted" style={{ fontSize: 12.5 }}>Усього на місяць, $</label>
            <input id="wf-lim-m" className="wf-inp" inputMode="decimal" value={limits.monthly} onChange={(e) => setLimits({ ...limits, monthly: e.target.value })} style={{ width: 100 }} />
            <label htmlFor="wf-lim-p" className="wf-muted" style={{ fontSize: 12.5 }}>На проєкт за замовчуванням, $</label>
            <input id="wf-lim-p" className="wf-inp" inputMode="decimal" value={limits.project} onChange={(e) => setLimits({ ...limits, project: e.target.value })} style={{ width: 100 }} />
            <button type="button" className="wf-btn p sm" disabled={busy || settings.missing} onClick={go(async () => { await saveLimits({ monthly_cap_usd: limits.monthly, project_cap_default_usd: limits.project }); setLimits(null); })}>Зберегти</button>
          </div>
        )}
        <details style={{ marginTop: 10 }}>
          <summary className="wf-muted" style={{ cursor: 'pointer' }}>Щоденний дайджест (о 9:00, канал ще не обрано) · перегляд</summary>
          <pre className="wf-ov-digest">{digestText(ov)}</pre>
        </details>
      </div>

      {ov.counts.all === 0 ? (
        <div className="wf-card" style={{ marginTop: 14 }}><div className="wf-empty">Жодного проєкту ще не запущено. Процес запускається з картки проєкту, вкладка «Огляд».</div></div>
      ) : (
        <>
          <div className="wf-row" role="group" aria-label="Фільтр" style={{ margin: '14px 0 8px' }}>
            {FILTERS.map(([key, label]) => (
              <button key={key} type="button" className="wf-fb" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} · {key === 'all' ? ov.counts.all : ov.counts[key]}</button>
            ))}
          </div>
          <div className="wf-ov-list">
            {rows.length === 0 && <div className="wf-empty">У цьому фільтрі порожньо.</div>}
            {rows.map((r) => (
              <button key={r.id} type="button" className="wf-ov-strip" aria-pressed={sel === r.id} onClick={() => setSel(sel === r.id ? null : r.id)}>
                <div><b>{r.name}</b><div className="wf-muted" style={{ fontSize: 12.5 }}>{r.stageTitle}</div></div>
                <Pipe stage={r.stage} bad={r.kind === 'failed'} />
                <div>
                  <Pill tone={KIND[r.kind].tone}>{r.what}</Pill>
                  {r.who && r.age > 0 && <div className="wf-muted" style={{ fontSize: 12.5, marginTop: 3 }}>{r.who}, {r.age} дн.</div>}
                </div>
                <div>
                  <div className="wf-muted" style={{ fontSize: 12 }}>{money(r.cost)} / {r.cap == null ? '∞' : money(r.cap)}</div>
                  <Bar spent={r.cost} cap={r.cap} />
                </div>
              </button>
            ))}
          </div>
          {chosen && <Drawer key={chosen.id} row={chosen} ov={ov} email={email} onDone={load} onOpen={open} setErr={setErr} />}
        </>
      )}
    </div>
  );
}
