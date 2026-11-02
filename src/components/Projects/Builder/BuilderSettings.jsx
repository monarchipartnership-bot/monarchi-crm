import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import Select from '../../common/Select';
import GroupsStrip from '../Reports/GroupsStrip';
import { useConfirm } from '../../common/ConfirmDialog';
import { deleteCampaignGroup, deleteCustomMetric, saveReportColumns } from '../../../lib/api/projectReportStore';
import { buildColumns, filterCampaigns, groupMatches, campaignKey } from '../../../lib/campaignGroups';
import { MAX_BLOCKS, MAX_CREATIVES, MAX_PROMPT, MAX_TITLE, PRESETS, newBlockKey } from '../../../lib/reportTemplate';
import { METRIC_SETS, metricMeta } from '../../../lib/reportMetrics';
import { orderMetricKeys } from '../../../lib/reportTemplate';
import { FUNNEL_CANDIDATES, funnelColumns } from '../../../lib/reportFunnel';
import '../../../styles/projectHistory.css';

// The settings panels under the live layout of the «Конструктор звіту». Every panel changes the DRAFT (`draft`, `set`); the groups and the
// extra metrics are objects of their own and are saved at once by their windows.

// Accordion state of the settings panels: one open at a time, owned by the builder.
export const PanelContext = createContext({ open: '', toggle: () => {} });

const PANEL_ICONS = {
  kind: <path d="M4 7V5h16v2M12 5v14M9 19h6" />,
  metrics: <path d="M5 20V10M12 20V4M19 20v-7" />,
  groups: <><rect x="3" y="4" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="4" width="7.5" height="7.5" rx="2" /><rect x="3" y="14" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="14" width="7.5" height="7.5" rx="2" /></>,
  blocks: <path d="M5 6h14M5 11h14M5 16h9" />,
  funnel: <path d="M4 5h16l-6 7v6l-4 2v-8z" />,
  creatives: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 8" /></>,
};
const UP_ICON = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>;
const DOWN_ICON = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>;
const TRASH_ICON = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>;
const PLUS_ICON = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;

export function Panel({ id, icon, title, note, summary, children }) {
  const { open, toggle } = useContext(PanelContext);
  const isOpen = open === id;
  return (
    <section className={'bld-panel' + (isOpen ? ' open' : '')}>
      <button type="button" className="bld-panel-head" aria-expanded={isOpen} aria-controls={'bld-panel-' + id} onClick={() => toggle(id)}>
        <span className="bld-md"><span className="bld-mi"><svg viewBox="0 0 24 24" aria-hidden="true">{PANEL_ICONS[icon || id]}</svg></span></span>
        <span className="bld-panel-titles"><b>{title}</b>{note && <small>{note}</small>}</span>
        {summary && <span className="bld-sum">{summary}</span>}
        <span className="bld-cv" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg></span>
      </button>
      {isOpen && <div className="bld-panel-body" id={'bld-panel-' + id}>{children}</div>}
    </section>
  );
}

function Switch({ on, onChange, label }) {
  return (
    <label className="bld-switch">
      <button type="button" role="switch" aria-checked={on} className={'bld-tgl' + (on ? ' on' : '')} onClick={() => onChange(!on)}><i /></button>
      {label}
    </label>
  );
}

const KIND_OPTIONS = [
  { value: '', label: 'За полем «Тип бізнесу» проєкту' },
  { value: 'ecom', label: 'Інтернет-магазин: покупки, дохід, ROAS' },
  { value: 'leadgen', label: 'Лідогенерація: ліди, ціна ліда' },
];

export function KindPanel({ draft, set, projectKind }) {
  return (
    <Panel id="kind" title="Тип звіту" note="Від типу залежать базові метрики та шість карток зверху місячного звіту." summary={(draft.kind || projectKind) === 'leadgen' ? 'Лідогенерація' : 'Інтернет-магазин'}>
      <div className="bld-opts">
        {KIND_OPTIONS.map((o) => (
          <label key={o.value} className={'bld-opt' + ((draft.kind || '') === o.value ? ' on' : '')}>
            <input type="radio" name="bld-kind" checked={(draft.kind || '') === o.value} onChange={() => set({ kind: o.value || null })} />
            <span className="bld-ck" aria-hidden="true" />
            <span>{o.label}{o.value === '' ? ` (зараз: ${projectKind === 'leadgen' ? 'лідогенерація' : 'інтернет-магазин'})` : ''}</span>
          </label>
        ))}
      </div>
    </Panel>
  );
}

// Metrics in the order the layout chose. The chips can be dragged, or picked (a click) and moved with the arrows; the order is part of the layout (saved by «Зберегти макет»).
export function MetricsPanel({ projectId, platform, kind, extraKeys, custom, order = [], onOrder, onOpen, onChanged }) {
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [picked, setPicked] = useState('');
  const [dragKey, setDragKey] = useState('');
  const baseKeys = (METRIC_SETS[kind] || METRIC_SETS.ecom);
  const base = baseKeys.map((k) => metricMeta(k, custom).label);
  const removable = new Map([
    ...extraKeys.map((k) => [k, { id: 'c:' + k, remove: { type: 'column', key: k } }]),
    ...custom.map((c) => [c.key, { id: 'm:' + c.id, remove: { type: 'custom', metric: c } }]),
  ]);
  const allKeys = useMemo(() => orderMetricKeys([...baseKeys, ...extraKeys, ...custom.map((c) => c.key)], order), [baseKeys, extraKeys, custom, order]);
  const moveKey = (key, to) => {
    const from = allKeys.indexOf(key);
    if (from < 0 || to < 0 || to >= allKeys.length || from === to) return;
    const next = [...allKeys];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onOrder?.(next);
  };

  async function remove(item) {
    const r = item.remove;
    if (r.type === 'custom') {
      const shared = r.metric.project_id == null;
      const ok = await confirm({
        title: 'Видалити метрику?',
        body: shared ? `«${r.metric.name}» є спільною: вона є в усіх проєктах, і її буде видалено скрізь. Створені раніше звіти не змінюються.` : `Видалити метрику «${r.metric.name}»? Створені раніше звіти не змінюються.`,
        confirmLabel: 'Видалити метрику', danger: true,
      });
      if (!ok) return;
    }
    setBusy(item.id);
    setError('');
    try {
      if (r.type === 'column') await saveReportColumns(projectId, platform, extraKeys.filter((k) => k !== r.key));
      else await deleteCustomMetric(r.metric.id);
      await onChanged();
    } catch (e) { setError(e.message || 'Не вдалося видалити метрику.'); } finally { setBusy(''); }
  }

  return (
    <Panel id="metrics" title="Метрики" summary={`${base.length} + ${removable.size}`} note="Базові є завжди; додаткові (виділені) — стовпці кабінету й власні формули: вони додаються й видаляються одразу. Порядок метрик: перетягніть або натисніть метрику й пересуньте стрілками; він зберігається разом з макетом. Око біля метрики на макеті ховає її від клієнта.">
      <div className="bld-chips bld-chips--order" aria-label="Метрики в порядку звіту">
        {allKeys.map((key, i) => {
          const it = removable.get(key);
          const on = picked === key;
          return (
            <span key={key} className={'bld-chip' + (it ? ' bld-chip--extra' : '') + (on ? ' bld-chip--picked' : '') + (dragKey === key ? ' bld-chip--drag' : '')}
              draggable onDragStart={(e) => { setDragKey(key); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', key); }}
              onDragOver={(e) => { if (dragKey) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (dragKey) moveKey(dragKey, i); setDragKey(''); }}
              onDragEnd={() => setDragKey('')}>
              {on && <button type="button" className="bld-chip-mv" disabled={i === 0} aria-label={`${metricMeta(key, custom).label}: перемістити ліворуч`} onClick={() => moveKey(key, i - 1)}>&lsaquo;</button>}
              <button type="button" className="bld-chip-label" aria-pressed={on} title="Натисніть, щоб обрати й пересунути стрілками, або перетягніть" onClick={() => setPicked(on ? '' : key)}>{metricMeta(key, custom).label}</button>
              {on && <button type="button" className="bld-chip-mv" disabled={i === allKeys.length - 1} aria-label={`${metricMeta(key, custom).label}: перемістити праворуч`} onClick={() => moveKey(key, i + 1)}>&rsaquo;</button>}
              {it && <button type="button" className="bld-chip-x" disabled={busy === it.id} aria-label={`Прибрати метрику ${metricMeta(key, custom).label}`} title="Прибрати метрику" onClick={() => remove(it)}>&times;</button>}
            </span>
          );
        })}
      </div>
      {order.length > 0 && <div className="rte-row"><button type="button" className="btn" onClick={() => { setPicked(''); onOrder?.([]); }}>Скинути порядок</button></div>}
      {error && <div className="pacc-err">{error}</div>}
      <div className="rte-row"><button type="button" className="btn" onClick={onOpen}>{PLUS_ICON} Метрика</button></div>
      {confirmDialog}
    </Panel>
  );
}

// What is in the report: groups (a highlighted column with the total of the group, then its campaigns) and campaigns picked by hand, one column
// each, one after another. Everything not selected is not in the report. Saved with the layout.
export function SelectionPanel({ platform, groups, campaigns, problem, draft, set }) {
  const sel = draft.campaignSel;
  const [query, setQuery] = useState('');
  const chosenGroups = groups.filter((g) => sel.groups.includes(g.id));
  const viaGroup = (name) => chosenGroups.find((g) => groupMatches(g, platform, name));
  const shown = useMemo(() => filterCampaigns(campaigns || [], query), [campaigns, query]);
  const keyOf = (c) => campaignKey(platform, c.name);
  const picked = (c) => Boolean(viaGroup(c.name)) || sel.campaigns.includes(keyOf(c));
  const columns = useMemo(() => buildColumns({ platform, campaigns: campaigns || [], groups, selection: sel }), [platform, campaigns, groups, sel]);
  const toggleGroup = (id) => set({ campaignSel: { ...sel, groups: sel.groups.includes(id) ? sel.groups.filter((x) => x !== id) : [...sel.groups, id] } });
  const toggleCampaign = (c) => set({ campaignSel: { ...sel, campaigns: sel.campaigns.includes(keyOf(c)) ? sel.campaigns.filter((k) => k !== keyOf(c)) : [...sel.campaigns, keyOf(c)] } });
  const free = shown.filter((c) => !viaGroup(c.name));
  const allFreePicked = free.length > 0 && free.every((c) => sel.campaigns.includes(keyOf(c)));
  const setFree = (on) => {
    const keys = new Set(sel.campaigns);
    free.forEach((c) => (on ? keys.add(keyOf(c)) : keys.delete(keyOf(c))));
    set({ campaignSel: { ...sel, campaigns: [...keys] } });
  };
  const outside = (campaigns || []).filter((c) => !picked(c)).length;
  return (
    <Panel id="selection" icon="groups" title="Що в звіті: групи та кампанії" summary={`колонок: ${columns.length}`} note="Кожна кампанія у власній колонці; група додає колонку із сумою групи. Не обране у звіт не потрапляє.">
      <div className="pacc-hint">Загальні показники завжди за весь кабінет. Нові кампанії самі в звіт не потрапляють: додайте їх тут і збережіть макет, або візьміть групу з правилом за назвою.</div>
      <div className="pk-field"><label>Групи у звіті</label></div>
      <div className="bld-chips" aria-label="Групи у звіті">
        {groups.length ? groups.map((g) => (
          <button key={g.id} type="button" className={'bld-toggle' + (sel.groups.includes(g.id) ? ' on' : '')} aria-pressed={sel.groups.includes(g.id)} onClick={() => toggleGroup(g.id)}>{g.name}</button>
        )) : <span className="ph-share-meta">Груп ще немає: створіть групу нижче, і її можна буде підключити одним кліком.</span>}
      </div>
      <div className="pk-field"><label>Кампанії у звіті</label></div>
      <div className="cg-pick-bar">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пошук кампанії" aria-label="Пошук кампанії" />
        <button type="button" className="btn" disabled={!free.length} onClick={() => setFree(!allFreePicked)}>{allFreePicked ? 'Зняти всі' : 'Обрати всі'}{query ? ' знайдені' : ''}</button>
        <span className="cg-pick-count">У звіті колонок: <b>{columns.length}</b></span>
      </div>
      {campaigns === null && <div className="pacc-hint">Завантажуємо кампанії з кабінету…</div>}
      {problem && <div className="pacc-hint">Кампанії не вдалося завантажити: {problem} (це працює на робочому сайті).</div>}
      {campaigns && campaigns.length === 0 && !problem && <div className="pacc-hint">За 90 днів у кабінеті немає кампаній з активністю.</div>}
      <div className="cg-list bld-camps">
        {shown.map((c) => {
          const g = viaGroup(c.name);
          return (
            <label key={keyOf(c)} className={'cg-item' + (picked(c) ? ' on' : '')}>
              <input type="checkbox" checked={picked(c)} disabled={Boolean(g)} onChange={() => toggleCampaign(c)} />
              <span className="cg-item-name">{c.name}</span>
              <span className="cg-item-meta">{g ? `через групу «${g.name}»` : c.spend ? Math.round(c.spend).toLocaleString('uk-UA') : ''}</span>
            </label>
          );
        })}
      </div>
      {campaigns && outside > 0 && <div className="pacc-hint">Не в звіті: {outside} з {campaigns.length} кампаній.</div>}
    </Panel>
  );
}

// The groups themselves: a set of campaigns (and, if wanted, a rule by name) that can be switched into a report in one click above. Only create, edit, delete here.
export function GroupsPanel({ groups, campaigns, onEdit, onCreate, onChanged }) {
  return (
    <Panel id="groups" title="Групи кампаній" summary={`${groups.length}`} note="Набір кампаній, який підключається до звіту одним кліком вище; правило за назвою додає нові. Зберігаються одразу.">
      <GroupsStrip
        groups={groups} known={campaigns || []} activeId={undefined} hideAll hint="Оберіть групу, щоб змінити чи видалити її."
        onEdit={onEdit} onCreate={onCreate}
        onDelete={async (id) => { await deleteCampaignGroup(id); await onChanged(); }}
      />
    </Panel>
  );
}

// The funnel picture for the client: which stages and whether it is shown. Meta gives the counts of the stages as extra columns of the cabinet, so choosing a stage
// also adds its column to the report (saved at once, like the extra metrics); the switch and the choice of stages are part of the layout («Зберегти макет»).
export function FunnelPanel({ projectId, platform, draft, set, extraKeys, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const f = draft.funnel || { enabled: false, stages: [] };
  async function change(next) {
    setError('');
    const missing = funnelColumns(next.stages).filter((k) => !extraKeys.includes(k));
    if (next.enabled && missing.length) {
      setBusy(true);
      try { await saveReportColumns(projectId, platform, [...extraKeys, ...missing]); await onChanged(); } catch (e) { setError(e.message || 'Не вдалося додати стовпці кабінету.'); setBusy(false); return; }
      setBusy(false);
    }
    set({ funnel: next });
  }
  const toggleStage = (k) => {
    const has = f.stages.includes(k);
    const stages = FUNNEL_CANDIDATES.filter((c) => (c === k ? !has : f.stages.includes(c)));
    if (stages.length < 2) { setError('У воронці мають бути щонайменше два етапи.'); return; }
    change({ ...f, stages });
  };
  const meta = platform === 'meta';
  return (
    <Panel id="funnel" title="Воронка" summary={f.enabled ? `${f.stages.length} етапи` : 'вимкнена'} note="Картинка для клієнта: перегляд товару, кошик, оформлення, продаж, і де людей стає найменше.">
      <Switch on={!!f.enabled} onChange={(v) => change({ ...f, enabled: v })} label="Показувати воронку в звіті" />
      {!meta && <div className="pacc-hint">Етапи воронки (перегляди, кошик, оформлення) віддає кабінет Meta. Для цієї платформи є лише продажі, тож воронка не зʼявиться.</div>}
      <div className="bld-chips" aria-label="Етапи воронки">
        {FUNNEL_CANDIDATES.map((k) => {
          const on = f.stages.includes(k);
          return <button type="button" key={k} className={'bld-chip' + (on ? ' bld-chip--picked' : '')} aria-pressed={on} disabled={busy} onClick={() => toggleStage(k)}>{metricMeta(k, []).label}</button>;
        })}
      </div>
      <div className="pacc-hint">Етапи йдуть у порядку шляху клієнта. Вибір етапу додає його стовпець із кабінету; зміни діють після «Зберегти макет».</div>
      {error && <div className="pacc-err">{error}</div>}
    </Panel>
  );
}

export function BlocksPanel({ draft, set }) {
  const blocks = draft.blocks;
  const setBlock = (i, patch) => set({ blocks: blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    set({ blocks: next });
  };
  const addBlock = (b) => set({ blocks: [...blocks, { key: newBlockKey(), kind: 'custom', title: 'Новий блок', prompt: '', weekly: true, monthly: true, client: true, ...b }] });
  const full = blocks.length >= MAX_BLOCKS;
  const HOW = { whatWasDone: 'Агент пише з історії змін у рекламних кабінетах.', conclusion: 'Пишеться кодом з цифр звіту, без ШІ.', plans: 'Заповнює людина.' };
  return (
    <Panel id="blocks" title="Текстові блоки" summary={`${blocks.length} ${blocks.length === 1 ? 'блок' : 'блоки'}`} note="Назва, у яких звітах блок є, і що агент має написати. Команда бачить усі блоки; клієнт лише ті, що ввімкнені оком на макеті.">
      <ul className="bld-blocks">
        {blocks.map((b, i) => (
          <li key={b.key} className={'bld-block' + (!b.weekly && !b.monthly ? ' off' : '')}>
            <div className="bld-block-head">
              <input className="bld-block-title" value={b.title} maxLength={MAX_TITLE} aria-label="Назва блоку" onChange={(e) => setBlock(i, { title: e.target.value })} />
              <span className="bld-moves">
                <button type="button" className="bld-ib" disabled={i === 0} aria-label="Вище" onClick={() => move(i, -1)}>{UP_ICON}</button>
                <button type="button" className="bld-ib" disabled={i === blocks.length - 1} aria-label="Нижче" onClick={() => move(i, 1)}>{DOWN_ICON}</button>
                {b.kind === 'custom' && <button type="button" className="bld-ib bld-ib--bad" aria-label="Видалити блок" onClick={() => set({ blocks: blocks.filter((_, j) => j !== i) })}>{TRASH_ICON}</button>}
              </span>
            </div>
            <div className="bld-block-sw">
              <Switch on={b.weekly} onChange={(v) => setBlock(i, { weekly: v })} label="Тижневий звіт" />
              <Switch on={b.monthly} onChange={(v) => setBlock(i, { monthly: v })} label="Місячний звіт" />
            </div>
            {b.kind === 'custom' ? (
              <label className="rte-prompt">
                <span>Інструкція для агента (порожньо: блок заповнює людина)</span>
                <textarea rows={3} maxLength={MAX_PROMPT} value={b.prompt} onChange={(e) => setBlock(i, { prompt: e.target.value })} placeholder="Наприклад: у 2–3 реченнях поясни, з чим збіглися зміни результатів, лише за цифрами й діями." />
              </label>
            ) : <div className="bld-how">{HOW[b.key]}</div>}
          </li>
        ))}
      </ul>
      <div className="rte-row">
        <button type="button" className="btn" disabled={full} onClick={() => addBlock({})}>{PLUS_ICON} Додати блок</button>
        <Select
          value="" placeholder="+ Готовий блок…" ariaLabel="Додати готовий блок" disabled={full}
          options={PRESETS.filter((p) => !blocks.some((b) => b.title === p.title)).map((p) => ({ value: p.title, label: p.title }))}
          onChange={(title) => { const p = PRESETS.find((x) => x.title === title); if (p) addBlock({ title: p.title, prompt: p.prompt, weekly: false, monthly: true }); }}
        />
        {full && <span className="ph-share-meta">Не більше {MAX_BLOCKS} блоків.</span>}
      </div>
    </Panel>
  );
}

export function CreativesPanel({ draft, set }) {
  const num = (key, max) => (
    <input type="number" min={0} max={max} value={draft.creatives[key]} onChange={(e) => set({ creatives: { ...draft.creatives, [key]: e.target.value === '' ? 0 : Number(e.target.value) } })} />
  );
  return (
    <Panel id="creatives" title="Креативи" summary={`${draft.creatives.weekly} / ${draft.creatives.monthly}`} note="Скільки найкращих оголошень Meta (Most effective creatives) потрапляє у звіт; відбір за ROAS. 0: блоку креативів немає.">
      <div className="bld-crn">
        <label>Тижневий звіт {num('weekly', MAX_CREATIVES.weekly)}</label>
        <label>Місячний звіт {num('monthly', MAX_CREATIVES.monthly)}</label>
      </div>
    </Panel>
  );
}
