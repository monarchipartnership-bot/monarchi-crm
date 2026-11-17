import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useProjectCockpit from '../../../lib/useProjectCockpit';
import { fetchDeliverables } from '../../../lib/api/deliverables';
import { ITEM_TEXT, buildQueue, buildRuns, dateTimeText, filterRuns, groupItems, itemStatus, runCounts, runProgress, runStatus } from '../../../lib/agents/aiResults';
import Deliverables from '../../../pages/Tools/campaigns/Deliverables';
import StepCards from '../../../pages/Tools/cockpit/StepCards';
import CompareLooksDialog from '../../../pages/Tools/cockpit/CompareLooksDialog';
import VideoDialog from '../../../pages/Tools/cockpit/VideoDialog';
import QcLine from '../../../pages/Tools/cockpit/QcLine';
import ReturnDialog from '../../../pages/Tools/cockpit/ReturnDialog';
import TextEditDialog from '../../../pages/Tools/cockpit/TextEditDialog';
import { fmtUsd } from '../../../pages/Tools/cockpit/format';
import { HubTitle } from '../hubIcons';
import { StatusPill, TaskIcon, TypeLabel } from '../Teams/teamsUi';
import { PICTURE_USD, videoUsd } from '../Teams/TaskExtras';
import '../../../pages/Tools/cockpit/cockpit.css';
import '../../../styles/projectTeamsPlum.css';
import './aiResults.css';

const canApprove = (i) => i.status === 'review' || i.status === 'rejected';
const canReturn = (i) => i.status === 'review' || i.status === 'approved';
const canDownload = (i) => ['review', 'approved', 'rejected'].includes(i.status) && (i.downloadUrl || i.url);
const shown = (i) => !!i.url && ['review', 'approved', 'rejected'].includes(i.status); // what the viewer shows; the rest is «Ще не готові»
const TYPE_FILTERS = [['regular', 'Регулярне'], ['seasonal', 'Сезонне'], ['oneoff', 'Разове']];
const STATE_FILTERS = [['wait', 'Чекають рішення'], ['work', 'В роботі'], ['ok', 'Перевірено']];

function Thumb({ item, className = '' }) {
  if (!item.url) return <span className={'ar-ph ' + className}>{item.status === 'producing' ? '…' : '·'}</span>;
  return item.kind === 'video' ? <video className={className} src={item.url} muted playsInline preload="metadata" aria-label={item.conceptName} /> : <img className={className} src={item.url} alt={item.conceptName} loading="lazy" />;
}

// how far the run is: approved / returned / waiting / being made, as a bar and one line
function Progress({ run }) {
  const p = runProgress(run);
  if (!p.total) return null;
  const seg = (n, cls) => (n ? <i className={cls} style={{ flex: n }} /> : null);
  return (
    <div className="ar-prog">
      <div className="ar-bar" aria-hidden="true">{seg(p.approved, 'a')}{seg(p.rejected, 'b')}{seg(p.review, 'w')}{seg(p.making, 'p')}</div>
      <small>перевірено {p.decided} з {p.total}</small>
    </div>
  );
}

// A run as a card with a mosaic of its first pictures (owner's pick 2026-11-16)
export function RunCard({ run, onOpen }) {
  const status = runStatus(run);
  const pics = run.items.filter((i) => i.url && i.kind !== 'video').slice(0, 3);
  return (
    <button type="button" className={'ar-rc is-' + run.kind + (status === 'ask' ? ' is-ask' : '')} onClick={onOpen}>
      <span className="ar-cv" aria-hidden="true">
        {run.source !== 'creative' ? <span className="ar-docic"><TaskIcon name="doc" /></span> : pics.length ? pics.map((i) => <Thumb key={i.id} item={i} />) : <span className="ar-docic">{run.state === 'work' ? '…' : '·'}</span>}
      </span>
      <span className="ar-cb">
        <b>{run.title}</b>
        <span className="ar-meta"><TypeLabel type={run.kind} main={run.isMain} /><span>{run.team}{run.date ? ` · ${dateTimeText(run.date)}` : ''}</span></span>
        <Progress run={run} />
        <StatusPill status={status} text={run.stateText} />
      </span>
    </button>
  );
}

// «Потребує вашого рішення»: the pictures that wait, the runs they are in and the button that walks through them one by one
export function QueueBlock({ queue, onOpenRun, onQueue }) {
  if (!queue.total) return <section className="ar-q is-empty" role="status"><h4><TaskIcon name="check" />Усе перевірено. Нічого не чекає вашого рішення</h4></section>;
  const byRun = [];
  queue.entries.forEach(({ run }) => { if (!byRun.find((x) => x.run.id === run.id)) byRun.push({ run, n: queue.entries.filter((e) => e.run.id === run.id).length, unit: 'креат.' }); });
  queue.docs.forEach((run) => byRun.push({ run, n: run.waiting, unit: 'докум.' }));
  queue.asks.forEach((run) => byRun.push({ run, n: 0, unit: run.stateText }));
  return (
    <section className="ar-q" aria-label="Потребує вашого рішення">
      <h4><TaskIcon name="alert" />Потребує вашого рішення <em>{queue.total}</em></h4>
      <div className="ar-qb">
        {queue.entries.length > 0 && <div className="ar-qth" aria-hidden="true">{queue.entries.slice(0, 6).map(({ item }) => <Thumb key={item.id} item={item} />)}</div>}
        <div className="ar-qruns">
          {byRun.map(({ run, n, unit }) => (
            <button key={run.id} type="button" className="ar-qrun" onClick={() => onOpenRun(run.id)}>
              <TypeLabel type={run.kind} main={run.isMain} /><b>{run.title}</b><span className="ar-qn">{n ? `${n} ${unit}` : unit}</span>
            </button>
          ))}
        </div>
        {queue.entries.length > 0 && <button type="button" className="btn tmx-sm tb-gold ar-qgo" onClick={onQueue}>Переглянути по черзі ({queue.entries.length})</button>}
      </div>
    </section>
  );
}

// The review of the creatives one by one (owner's pick): the big picture, the words, «Схвалити» and «Повернути» in sight, the other actions in «Ще дії»; A approves, R returns, the arrows walk,
// and after a decision the next picture that waits opens. entries: [{ item, run }] (the creatives of one run, or the queue of the project).
//   onAct(run, key, payload)   styleOf(run)
export function FocusViewer({ entries, onAct, styleOf, startId = null }) {
  const [curId, setCurId] = useState(startId);
  const [dlg, setDlg] = useState(null); // { kind: 'return' | 'edit' | 'compare' | 'video', entry }
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const idx = Math.max(0, entries.findIndex((e) => e.item.id === curId));
  const entry = entries[idx] || null;
  const state = useRef({});
  state.current = { entries, idx, entry, dlg };

  const go = useCallback((d) => { const { entries: l, idx: k } = state.current; if (l.length) { setCurId(l[(k + d + l.length) % l.length].item.id); setMenu(false); } }, []);
  const nextWaiting = useCallback(() => { const { entries: l, idx: k } = state.current; for (let d = 1; d < l.length; d += 1) { const e = l[(k + d) % l.length]; if (e.item.status === 'review') return e.item.id; } return null; }, []);
  const act = useCallback(async (key, payload, advance = false) => {
    const e = state.current.entry; if (!e) return;
    setErr(''); setBusy(key); const nx = advance ? nextWaiting() : null;
    try { await onAct(e.run, key, payload); if (advance && nx != null) setCurId(nx); } catch (x) { setErr(x?.message || 'Не вдалося виконати дію.'); } finally { setBusy(''); }
  }, [onAct, nextWaiting]);

  useEffect(() => {
    const key = (ev) => {
      const { entry: e, dlg: d } = state.current;
      if (d || !e || ev.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if (ev.key === 'ArrowLeft') go(-1); else if (ev.key === 'ArrowRight') go(1);
      else if ((ev.key === 'a' || ev.key === 'A') && canApprove(e.item)) act('approve_one', { creativeId: e.item.id }, true);
      else if ((ev.key === 'r' || ev.key === 'R') && canReturn(e.item)) setDlg({ kind: 'return', entry: e });
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [go, act]);
  useEffect(() => {
    if (!menu) return undefined;
    const away = (ev) => { if (!ev.target.closest('.ar-menu-wrap')) setMenu(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [menu]);

  if (!entry) return <p className="ar-empty">Креативів для перегляду немає.</p>;
  const { item, run } = entry;
  const styleCtx = styleOf(run);
  const canEditText = !!styleCtx && !!item.rawUrl && item.kind !== 'video' && ['review', 'approved'].includes(item.status);
  const checkable = !!styleCtx && !!item.rawUrl && item.kind !== 'video' && ['review', 'approved', 'rejected'].includes(item.status);
  const other = [
    canEditText && ['Редагувати текст', () => setDlg({ kind: 'edit', entry }), '$0'],
    checkable && ['Порівняти реалізм', () => setDlg({ kind: 'compare', entry }), `≈ $${PICTURE_USD} за вигляд`],
    checkable && ['Створити відео', () => setDlg({ kind: 'video', entry }), `від ≈ $${videoUsd(5).toFixed(2)}`],
    canEditText && item.status === 'review' && [item.qc ? 'Перевірити ще раз' : 'Перевірити якість', () => act('inspect', { creativeId: item.id })],
    canDownload(item) && ['Завантажити', () => act('download_one', { creativeId: item.id })],
  ].filter(Boolean);
  const dEntry = dlg?.entry; const dItem = dEntry?.item; const dStyle = dEntry ? styleOf(dEntry.run) : null;
  const dCanEdit = !!dStyle && !!dItem?.rawUrl && dItem?.kind !== 'video' && ['review', 'approved'].includes(dItem?.status);

  return (
    <div className="ar-fv">
      <div className="ar-stage">
        {entries.length > 1 && <button type="button" className="ar-nav is-prev" onClick={() => go(-1)} aria-label="Попередній креатив">‹</button>}
        {item.kind === 'video' ? <video src={item.url} aria-label={item.conceptName} controls playsInline loop /> : <img src={item.url} alt={item.conceptName} />}
        {entries.length > 1 && <button type="button" className="ar-nav is-next" onClick={() => go(1)} aria-label="Наступний креатив">›</button>}
      </div>
      <aside className="ar-fp" aria-label="Креатив">
        <div className="ar-fph"><h4>{item.conceptName}</h4><StatusPill status={itemStatus(item.status)} text={ITEM_TEXT[item.status]} /></div>
        <div className="ar-meta"><TypeLabel type={run.kind} main={run.isMain} /><span>{run.title} · {item.ratio || '4:5'}{item.kind === 'video' ? ' · відео' : ''}</span></div>
        {(item.copy?.headline || item.copy?.text) && <div className="ar-tx"><b>{item.copy.headline}</b>{item.copy.text}{item.copy.cta && <small>Кнопка: {item.copy.cta}</small>}</div>}
        {item.note && <p className="ar-note">{item.note}</p>}
        <QcLine qc={item.qc} />
        {err && <p className="ar-err" role="alert">{err}</p>}
        <div className="ar-big">
          {canApprove(item) && <button type="button" className="btn tb-gold" disabled={!!busy} onClick={() => act('approve_one', { creativeId: item.id }, true)}>Схвалити <kbd>A</kbd></button>}
          {canReturn(item) && <button type="button" className="btn" disabled={!!busy} onClick={() => setDlg({ kind: 'return', entry })}>Повернути <kbd>R</kbd></button>}
        </div>
        {other.length > 0 && (
          <div className="ar-menu-wrap">
            <button type="button" className="btn tmx-sm" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>⋯ Ще дії</button>
            {menu && <div className="ar-menu" role="menu">{other.map(([label, fn, hint]) => <button key={label} type="button" role="menuitem" disabled={!!busy} onClick={() => { setMenu(false); fn(); }}><span>{label}</span>{hint && <em>{hint}</em>}</button>)}</div>}
          </div>
        )}
        <small className="ar-hint">Клавіші: <kbd>A</kbd> схвалити · <kbd>R</kbd> повернути · <kbd>←</kbd><kbd>→</kbd> інші. Після рішення відкривається наступний, що чекає.</small>
      </aside>
      <div className="ar-film" role="list" aria-label="Усі креативи">
        {entries.map((e, k) => (
          <button key={e.item.id} type="button" role="listitem" className={k === idx ? 'is-cur' : ''} onClick={() => { setCurId(e.item.id); setMenu(false); }} aria-label={`${e.item.conceptName}: ${ITEM_TEXT[e.item.status]}`}>
            <Thumb item={e.item} /><span className={'ar-mk is-' + itemStatus(e.item.status)}>{{ ask: '!', done: '✓', back: '↩', run: '…', bad: '×' }[itemStatus(e.item.status)]}</span>
          </button>
        ))}
      </div>
      {dlg?.kind === 'return' && <ReturnDialog item={dItem} canEditText={dCanEdit} onClose={() => setDlg(null)} onRedo={async (comment) => { try { await onAct(dEntry.run, 'return', { creativeIds: [dItem.id], comment }); setCurId((c) => nextWaiting() ?? c); } finally { setDlg(null); } }} onText={() => setDlg({ kind: 'edit', entry: dEntry })} />}
      {dlg?.kind === 'video' && <VideoDialog item={dItem} onAct={(k, p) => onAct(dEntry.run, k, p)} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'compare' && <CompareLooksDialog item={dItem} currentLook={dStyle?.look || 'std'} onAct={(k, p) => onAct(dEntry.run, k, p)} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'edit' && dStyle && <TextEditDialog item={dItem} autoStyle={dStyle.autoStyle} taskStyle={dStyle.taskStyle} onClose={() => setDlg(null)} onSave={(edit) => onAct(dEntry.run, 'edit_text', { creativeId: dItem.id, edit })} />}
    </div>
  );
}

// The pictures that are not ready yet (being made, waiting for the confirmation, failed): a short list under the viewer
export function NotReady({ items }) {
  if (!items.length) return null;
  return (
    <section className="ar-nr" aria-label="Ще не готові">
      <h4>Ще не готові <span className="ar-n">{items.length}</span></h4>
      <ul>{items.map((i) => <li key={i.id}><b>{i.conceptName}</b><small>{i.ratio || '4:5'}</small><StatusPill status={itemStatus(i.status)} text={ITEM_TEXT[i.status] || i.status} />{i.note && <span className="ar-note">{i.note}</span>}</li>)}</ul>
    </section>
  );
}

export function RunHead({ run, onBack, label = '← Усі запуски' }) {
  return (
    <>
      <button type="button" className="ar-back" onClick={onBack}>{label}</button>
      <div className="ar-rhead">
        <h3>{run.title}</h3>
        <TypeLabel type={run.kind} main={run.isMain} />
        <span className="ar-chip">{run.team}</span>
        {run.date && <span className="ar-chip">{dateTimeText(run.date)}</span>}
        {run.cost > 0 && <span className="ar-chip">Витрати {fmtUsd(run.cost)}</span>}
        <StatusPill status={runStatus(run)} text={run.stateText} />
      </div>
      {run.goal && <p className="ar-goal">{run.goal}</p>}
    </>
  );
}

// «Результати AI команди» (owner, 2026-11-12; plum look 2026-11-16, decision 53): above everything what waits for the person, under it the history of the runs as cards with a mosaic; a run opens
// as the review one by one. The runs of the analytics team and the one-off research open as the list of documents.
//   projectId: the project of the card
export default function AiResults({ projectId }) {
  const { byId, loading, error, run: runAction } = useProjectCockpit();
  const [deliverables, setDeliverables] = useState([]);
  const [fState, setFState] = useState(null);
  const [fType, setFType] = useState(null);
  const [view, setView] = useState({ mode: 'list' }); // { mode: 'list' } | { mode: 'run', id } | { mode: 'queue' }
  const [problem, setProblem] = useState('');
  const loadDeliverables = useCallback(() => fetchDeliverables({ projectId }).then(setDeliverables).catch(() => setDeliverables([])), [projectId]);
  useEffect(() => { loadDeliverables(); }, [loadDeliverables]);
  const cockpits = useMemo(() => Object.values(byId).filter((c) => Number(c.projectId) === Number(projectId)), [byId, projectId]);
  const runs = useMemo(() => buildRuns({ cockpits, deliverables }), [cockpits, deliverables]);
  const queue = useMemo(() => buildQueue(runs), [runs]);
  const counts = useMemo(() => runCounts(runs), [runs]);
  const list = useMemo(() => filterRuns(runs, fState || 'all').filter((r) => !fType || r.kind === fType), [runs, fState, fType]);
  const open = view.mode === 'run' ? runs.find((r) => r.id === view.id) || null : null;
  useEffect(() => { if (view.mode === 'run' && !open && !loading) setView({ mode: 'list' }); }, [view, open, loading]);
  // the look of the words: the scout's decision for the client and the style of the task of this run (the editor of the words of a creative starts from both)
  const styleOf = useCallback((r) => { const c = byId[r.campaignId]; if (!c?.intel) return null; const q = (c.requests || []).find((x) => x.id === r.requestId); return { autoStyle: c.intel.autoStyle, taskStyle: q?.brief?.style, look: q?.brief?.look }; }, [byId]);
  const onAct = useCallback(async (r, key, payload = {}) => {
    setProblem('');
    try { return await runAction(null, key, { campaignId: r.campaignId, requestId: r.requestId, ...payload }); } catch (e) { setProblem(e?.message || 'Не вдалося виконати дію.'); throw e; }
  }, [runAction]);
  const back = () => setView({ mode: 'list' });
  const typeCount = (k) => runs.filter((r) => r.kind === k).length;

  return (
    <section className="ar ckp is-night ar-scope pw-dark" data-dd="night" aria-label="Результати AI команди">
      {view.mode === 'list' && (
        <>
          <div className="ar-head">
            <HubTitle icon="image">Результати AI команди</HubTitle>
            <p>Усі запуски команд цього клієнта. Спершу те, що чекає вашого рішення.</p>
          </div>
          {loading && !runs.length && <p className="ar-empty">Завантаження…</p>}
          {error && <p className="ar-err" role="alert">{error}</p>}
          {!loading && !runs.length && <p className="ar-empty">Запусків ще немає. Вони зʼявляться, коли команди почнуть працювати: у вкладці «Запуск AI команди» можна запустити команду або створити додаткове завдання.</p>}
          {runs.length > 0 && (
            <>
              <QueueBlock queue={queue} onOpenRun={(id) => setView({ mode: 'run', id })} onQueue={() => setView({ mode: 'queue' })} />
              <h4 className="ar-h2">Історія запусків</h4>
              <div className="ar-fl">
                <div className="ar-fg" role="group" aria-label="Тип запуску"><span>Тип</span>{TYPE_FILTERS.map(([k, label]) => <button key={k} type="button" aria-pressed={fType === k} className={'ar-fc is-' + k + (fType === k ? ' on' : '')} onClick={() => setFType(fType === k ? null : k)}><i />{label} <em>{typeCount(k)}</em></button>)}</div>
                <div className="ar-fg" role="group" aria-label="Стан запуску"><span>Стан</span>{STATE_FILTERS.map(([k, label]) => <button key={k} type="button" aria-pressed={fState === k} className={'ar-fc is-st-' + k + (fState === k ? ' on' : '')} onClick={() => setFState(fState === k ? null : k)}><i />{label} <em>{counts[k]}</em></button>)}</div>
              </div>
              {!list.length && <p className="ar-empty">За цими фільтрами запусків немає.</p>}
              <ul className="ar-cards">{list.map((r) => <li key={r.id}><RunCard run={r} onOpen={() => setView({ mode: 'run', id: r.id })} /></li>)}</ul>
            </>
          )}
        </>
      )}

      {view.mode === 'queue' && (
        <div className="ar-run">
          <button type="button" className="ar-back" onClick={back}>← Усі запуски</button>
          <div className="ar-rhead"><h3>Перегляд по черзі</h3><span className="ar-chip">{queue.entries.length} чекають рішення</span></div>
          {queue.entries.length ? <FocusViewer entries={queue.entries} onAct={onAct} styleOf={styleOf} /> : (
            <div className="ar-q is-empty" role="status"><h4><TaskIcon name="check" />Усе перевірено. Черга порожня</h4><button type="button" className="btn btn-p" onClick={back}>До списку запусків</button></div>
          )}
        </div>
      )}

      {open && open.source === 'creative' && (
        <div className="ar-run">
          <RunHead run={open} onBack={back} />
          {runProgress(open).review > 1 && <div><button type="button" className="btn tmx-sm btn-p" onClick={() => onAct(open, 'approve_all', { creativeIds: open.items.filter((i) => i.status === 'review').map((i) => i.id) })}>Схвалити всі ({runProgress(open).review})</button></div>}
          {!open.items.length && <p className="ar-empty">Картинок у цьому запуску ще немає: {open.state === 'work' ? 'агенти працюють, кроки видно у вкладці «Запуск AI команди».' : 'агенти їх не зробили.'}</p>}
          <FocusViewer key={open.id} entries={open.items.filter(shown).map((item) => ({ item, run: open }))} startId={open.items.find((i) => i.status === 'review' && shown(i))?.id ?? null} onAct={onAct} styleOf={styleOf} />
          <NotReady items={groupItems(open.items).flatMap((g) => g.items).filter((i) => !shown(i))} />
          {open.stages.length > 0 && (
            <details className="ar-agents">
              <summary>Агенти, тексти й технічне завдання</summary>
              <div className="ar-sheet"><StepCards stages={open.stages} /></div>
            </details>
          )}
        </div>
      )}
      {open && open.source === 'deliverable' && (
        <div className="ar-run">
          <RunHead run={open} onBack={back} />
          <div className="ar-sheet"><Deliverables projectId={projectId} light only={open.deliverableIds} notify={(t, isErr) => { if (isErr) setProblem(t); }} onChanged={loadDeliverables} /></div>
        </div>
      )}
      {problem && <p className="ar-err" role="alert">{problem}</p>}
    </section>
  );
}
