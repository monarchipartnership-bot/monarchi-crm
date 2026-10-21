import { useEffect, useMemo, useState } from 'react';
import Select from '../../common/Select';
import DesignTodo from '../../common/DesignTodo';
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

export function Panel({ title, note, children }) {
  return (
    <section className="bld-panel">
      <h4>{title} <DesignTodo note={`Панель «${title}» конструктора звіту`} /></h4>
      {note && <div className="pacc-hint">{note}</div>}
      {children}
    </section>
  );
}

const KIND_OPTIONS = [
  { value: '', label: 'За полем «Тип бізнесу» проєкту' },
  { value: 'ecom', label: 'Інтернет-магазин: покупки, дохід, ROAS' },
  { value: 'leadgen', label: 'Лідогенерація: ліди, ціна ліда' },
];

export function KindPanel({ draft, set, projectKind }) {
  return (
    <Panel title="Тип звіту" note="Від типу залежать базові метрики та шість карток зверху місячного звіту.">
      <div className="rte-row rte-checks">
        {KIND_OPTIONS.map((o) => (
          <label key={o.value}>
            <input type="radio" name="bld-kind" checked={(draft.kind || '') === o.value} onChange={() => set({ kind: o.value || null })} /> {o.label}{o.value === '' ? ` (зараз: ${projectKind === 'leadgen' ? 'лідогенерація' : 'інтернет-магазин'})` : ''}
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
    <Panel title="Метрики" note="Базові метрики є завжди. Додаткові: стовпці рекламного кабінету та власні формули; їх можна додати й прибрати. Око на макеті вище вмикає чи вимикає метрику для клієнта. Додаткові метрики зберігаються одразу, окремо від кнопки «Зберегти макет».">
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
      <div className="rte-row"><button type="button" className="btn" onClick={onOpen}>+ Метрика</button></div>
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
    <Panel title="Кампанії та групи" note="Кожна група це колонка таблиці. Група це кампанії, які ви обрали, і, за бажанням, правило за назвою: нові кампанії з такою назвою потрапляють у групу самі. Кампанія, що не в жодній групі, у звіті входить у «Other campaigns». Групи зберігаються одразу.">
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
    <Panel title="Текстові блоки" note="Назва, у яких звітах блок є, і що агент має написати. Усі блоки тут завжди видно команді; чи бачить блок клієнт, вмикається оком на макеті вище.">
      <ul className="rte-blocks">
        {blocks.map((b, i) => (
          <li key={b.key} className={'rte-block' + (!b.weekly && !b.monthly ? ' off' : '')}>
            <div className="rte-row">
              <input className="ph-share-url" value={b.title} maxLength={MAX_TITLE} aria-label="Назва блоку" onChange={(e) => setBlock(i, { title: e.target.value })} />
              <span className="rte-moves">
                <button type="button" className="btn" disabled={i === 0} aria-label="Вище" onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="btn" disabled={i === blocks.length - 1} aria-label="Нижче" onClick={() => move(i, 1)}>↓</button>
                {b.kind === 'custom' && <button type="button" className="btn" onClick={() => set({ blocks: blocks.filter((_, j) => j !== i) })}>Видалити</button>}
              </span>
            </div>
            <div className="rte-row rte-checks">
              <label><input type="checkbox" checked={b.weekly} onChange={(e) => setBlock(i, { weekly: e.target.checked })} /> Тижневий звіт</label>
              <label><input type="checkbox" checked={b.monthly} onChange={(e) => setBlock(i, { monthly: e.target.checked })} /> Місячний звіт</label>
            </div>
            {b.kind === 'custom' ? (
              <label className="rte-prompt">
                <span>Інструкція для агента (порожньо: блок заповнює людина)</span>
                <textarea rows={3} maxLength={MAX_PROMPT} value={b.prompt} onChange={(e) => setBlock(i, { prompt: e.target.value })} placeholder="Наприклад: у 2–3 реченнях поясни, з чим збіглися зміни результатів, лише за цифрами й діями." />
              </label>
            ) : <div className="ph-share-meta">{HOW[b.key]}</div>}
          </li>
        ))}
      </ul>
      <div className="rte-row">
        <button type="button" className="btn" disabled={full} onClick={() => addBlock({})}>+ Додати блок</button>
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
    <Panel title="Креативи (Most effective creatives)" note="Скільки найкращих оголошень Meta потрапляє у звіт; їх відбирають за ROAS. 0 означає, що блоку креативів немає.">
      <div className="rte-row rte-checks">
        <label>Тижневий звіт {num('weekly', MAX_CREATIVES.weekly)}</label>
        <label>Місячний звіт {num('monthly', MAX_CREATIVES.monthly)}</label>
      </div>
    </Panel>
  );
}
