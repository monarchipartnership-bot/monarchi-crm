import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import Select from '../../common/Select';
import GroupsStrip from '../Reports/GroupsStrip';
import { useConfirm } from '../../common/ConfirmDialog';
import { deleteCampaignGroup, deleteCustomMetric, saveReportColumns } from '../../../lib/api/projectReportStore';
import { campaignsOutsideGroups } from '../../../lib/campaignGroups';
import { fetchProjectCampaigns } from '../../../lib/periodReport';
import { MAX_BLOCKS, MAX_CREATIVES, MAX_PROMPT, MAX_TITLE, PRESETS, newBlockKey } from '../../../lib/reportTemplate';
import { METRIC_SETS, metricMeta } from '../../../lib/reportMetrics';
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

export function MetricsPanel({ projectId, platform, kind, extraKeys, custom, onOpen, onChanged }) {
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const base = (METRIC_SETS[kind] || METRIC_SETS.ecom).map((k) => metricMeta(k, custom).label);
  const extras = [
    ...extraKeys.map((k) => ({ id: 'c:' + k, label: metricMeta(k, custom).label, remove: { type: 'column', key: k } })),
    ...custom.map((c) => ({ id: 'm:' + c.id, label: c.name, remove: { type: 'custom', metric: c } })),
  ];

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
    <Panel id="metrics" title="Метрики" summary={`${base.length} + ${extras.length}`} note="Базові є завжди; додаткові: стовпці кабінету й власні формули. Зберігаються одразу, окремо від «Зберегти макет». Око біля метрики на макеті ховає її від клієнта.">
      <div className="bld-chips" aria-label="Базові метрики">{base.map((l) => <span className="bld-chip" key={l}>{l}</span>)}</div>
      <div className="bld-chips" aria-label="Додаткові метрики">
        {extras.length ? extras.map((it) => (
          <span className="bld-chip bld-chip--extra" key={it.id}>
            {it.label}
            <button type="button" className="bld-chip-x" disabled={busy === it.id} aria-label={`Прибрати метрику ${it.label}`} title="Прибрати метрику" onClick={() => remove(it)}>&times;</button>
          </span>
        )) : <span className="ph-share-meta">Додаткових метрик ще немає.</span>}
      </div>
      {error && <div className="pacc-err">{error}</div>}
      <div className="rte-row"><button type="button" className="btn" onClick={onOpen}>{PLUS_ICON} Метрика</button></div>
      {confirmDialog}
    </Panel>
  );
}

export function GroupsPanel({ projectId, platform, kind, accounts, groups, onEdit, onCreate, onChanged }) {
  const [campaigns, setCampaigns] = useState(null); // null: loading; [] none or not available
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let off = false;
    setCampaigns(null);
    setProblem('');
    fetchProjectCampaigns(accounts, kind).then((r) => { if (!off) { setCampaigns(r.campaigns); setProblem(Object.values(r.errors || {})[0] || ''); } }).catch((e) => { if (!off) { setCampaigns([]); setProblem(e.message || 'не вдалося отримати кампанії'); } });
    return () => { off = true; };
  }, [accounts, kind, groups]);

  const outside = useMemo(() => (campaigns ? campaignsOutsideGroups(groups, campaigns) : []), [groups, campaigns]);
  return (
    <Panel id="groups" title="Кампанії та групи" summary={`${groups.length} ${groups.length === 1 ? 'група' : 'груп'}`} note="Кожна група це колонка таблиці; кампанії поза групами йдуть в «Other campaigns». Групи зберігаються одразу.">
      <GroupsStrip
        groups={groups} known={campaigns || []} activeId={undefined} hideAll hint="Оберіть групу, щоб змінити чи видалити її."
        onEdit={onEdit} onCreate={onCreate}
        onDelete={async (id) => { await deleteCampaignGroup(id); await onChanged(); }}
      />
      {campaigns === null && <div className="pacc-hint">Перевіряємо кампанії в кабінеті…</div>}
      {campaigns && outside.length > 0 && (
        <div className="prep-internal-note" role="note">
          <b>Кампаній поза групами: {outside.length}.</b> У звіті вони підуть в «Other campaigns»: {outside.slice(0, 8).map((c) => c.name).join('; ')}{outside.length > 8 ? '…' : ''}. Додайте їх у групу або створіть групу з правилом.
        </div>
      )}
      {campaigns && campaigns.length > 0 && outside.length === 0 && <div className="pacc-hint">Усі кампанії за 90 днів входять у групи.</div>}
      {problem && <div className="pacc-hint">Перевірити кампанії не вдалося: {problem} (це працює на робочому сайті).</div>}
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
