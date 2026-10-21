import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Select from '../common/Select';
import DesignTodo from '../common/DesignTodo';
import { fetchReportTemplate, saveReportTemplate } from '../../lib/api/projectReportStore';
import { MAX_BLOCKS, MAX_CREATIVES, MAX_METRICS, MAX_PROMPT, MAX_TITLE, PRESETS, newBlockKey, normalizeTemplate } from '../../lib/reportTemplate';
import { metricKeys } from '../../lib/clientReport';
import { metricOptions, projectKind } from '../../lib/reportMetrics';
import { cleanColumns } from '../../lib/platformColumns';
import '../../styles/projectHistory.css';

const HOW = {
  whatWasDone: 'Агент пише з історії змін у рекламних кабінетах.',
  conclusion: 'Пишеться кодом з цифр звіту, без ШІ.',
  plans: 'Заповнює людина.',
};

// «Шаблон звіту» of a project: its text blocks (titles, which reports, who sees them, the instruction the agent writes each by), the number of creatives
// and the metrics of the tables. It works for new reports: a report keeps the template it was made with, so approved reports never change.
export default function ReportTemplateEditor({ projectId, ctx }) {
  const { email } = useAuth();
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    let off = false;
    fetchReportTemplate(projectId).then((t) => { if (!off) { setSaved(t); setDraft(t); } });
    return () => { off = true; };
  }, [projectId]);

  const extraKeys = useMemo(() => [...new Set(Object.entries(ctx.columns || {}).flatMap(([p, keys]) => cleanColumns(p, keys)))], [ctx.columns]);
  const options = useMemo(() => metricOptions(ctx.custom || [], extraKeys), [ctx.custom, extraKeys]);
  const standard = useMemo(() => metricKeys(projectKind(ctx.project), extraKeys, ctx.custom || []), [ctx.project, extraKeys, ctx.custom]);
  const dirty = draft && saved && JSON.stringify(normalizeTemplate(draft)) !== JSON.stringify(saved);

  if (!draft) return null;
  const set = (patch) => { setDraft({ ...draft, ...patch }); setDone(''); };
  const setBlock = (i, patch) => set({ blocks: draft.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= draft.blocks.length) return;
    const next = [...draft.blocks];
    [next[i], next[j]] = [next[j], next[i]];
    set({ blocks: next });
  };
  const addBlock = (b) => set({ blocks: [...draft.blocks, { key: newBlockKey(), kind: 'custom', title: 'Новий блок', prompt: '', weekly: true, monthly: true, client: true, ...b }] });
  const customCount = draft.blocks.filter((b) => b.kind === 'custom').length;
  const full = draft.blocks.length >= MAX_BLOCKS;
  const metrics = draft.metrics;
  const unused = (own) => options.filter((o) => o.key === own || !(metrics || []).includes(o.key));

  async function save() {
    setBusy(true);
    setError('');
    try { const t = await saveReportTemplate(projectId, draft, email); setSaved(t); setDraft(t); setDone('Шаблон збережено. Він діє на нові звіти; створені раніше залишаються такими, як були.'); } catch (e) { setError(e.message || 'Не вдалося зберегти шаблон.'); } finally { setBusy(false); }
  }

  return (
    <div className="ph-share rte">
      <button type="button" className="rte-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="ph-chev" aria-hidden="true">›</span>
        <h3>Шаблон звіту</h3>
        <DesignTodo note="Блок «Шаблон звіту»: текстові блоки, креативи, метрики" />
        <span className="ph-sum">{draft.blocks.filter((b) => b.weekly || b.monthly).length} блоків · креативи {draft.creatives.weekly}/{draft.creatives.monthly} · {metrics ? `метрик: ${metrics.length}` : 'стандартні метрики'}</span>
      </button>
      {open && (
        <div className="rte-body">
          <div className="pacc-hint">Що входить у тижневий і місячний звіт цього проєкту і що пише агент. Зміни діють на нові звіти; вже створені та затверджені звіти зберігають свій шаблон.</div>

          <h4 className="rte-sub">Текстові блоки</h4>
          <ul className="rte-blocks">
            {draft.blocks.map((b, i) => (
              <li key={b.key} className={'rte-block' + (!b.weekly && !b.monthly ? ' off' : '')}>
                <div className="rte-row">
                  <input className="ph-share-url" value={b.title} maxLength={MAX_TITLE} aria-label="Назва блоку" onChange={(e) => setBlock(i, { title: e.target.value })} />
                  <span className="rte-moves">
                    <button type="button" className="btn" disabled={i === 0} aria-label="Вище" onClick={() => move(i, -1)}>↑</button>
                    <button type="button" className="btn" disabled={i === draft.blocks.length - 1} aria-label="Нижче" onClick={() => move(i, 1)}>↓</button>
                    {b.kind === 'custom' && <button type="button" className="btn" onClick={() => set({ blocks: draft.blocks.filter((_, j) => j !== i) })}>Видалити</button>}
                  </span>
                </div>
                <div className="rte-row rte-checks">
                  <label><input type="checkbox" checked={b.weekly} onChange={(e) => setBlock(i, { weekly: e.target.checked })} /> Тижневий звіт</label>
                  <label><input type="checkbox" checked={b.monthly} onChange={(e) => setBlock(i, { monthly: e.target.checked })} /> Місячний звіт</label>
                  <label><input type="checkbox" checked={b.client} onChange={(e) => setBlock(i, { client: e.target.checked })} /> Бачить клієнт</label>
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
              options={PRESETS.filter((p) => !draft.blocks.some((b) => b.title === p.title)).map((p) => ({ value: p.title, label: p.title }))}
              onChange={(title) => { const p = PRESETS.find((x) => x.title === title); if (p) addBlock({ title: p.title, prompt: p.prompt, weekly: false, monthly: true }); }}
            />
            {full && <span className="ph-share-meta">Не більше {MAX_BLOCKS} блоків.</span>}
            {customCount > 0 && <span className="ph-share-meta">Агент пише власні блоки за інструкцією лише з цифр звіту й списку дій; без інструкції блок лишається порожнім.</span>}
          </div>

          <h4 className="rte-sub">Креативи (Most effective creatives)</h4>
          <div className="rte-row rte-checks">
            <label>Тижневий звіт <input type="number" min={0} max={MAX_CREATIVES.weekly} value={draft.creatives.weekly} onChange={(e) => set({ creatives: { ...draft.creatives, weekly: e.target.value === '' ? 0 : Number(e.target.value) } })} /></label>
            <label>Місячний звіт <input type="number" min={0} max={MAX_CREATIVES.monthly} value={draft.creatives.monthly} onChange={(e) => set({ creatives: { ...draft.creatives, monthly: e.target.value === '' ? 0 : Number(e.target.value) } })} /></label>
            <span className="ph-share-meta">0: блок креативів не потрібен.</span>
          </div>

          <h4 className="rte-sub">Метрики в таблицях</h4>
          <div className="rte-row rte-checks">
            <label><input type="radio" name={'rte-metrics-' + projectId} checked={!metrics} onChange={() => set({ metrics: null })} /> Стандартний набір</label>
            <label><input type="radio" name={'rte-metrics-' + projectId} checked={Boolean(metrics)} onChange={() => set({ metrics: metrics || standard })} /> Свій набір</label>
          </div>
          {metrics && (
            <ul className="rte-metrics">
              {metrics.map((k, i) => (
                <li key={k + i} className="rte-row">
                  <Select value={k} ariaLabel={`Метрика ${i + 1}`} options={unused(k).map((o) => ({ value: o.key, label: o.label }))} onChange={(v) => set({ metrics: metrics.map((x, j) => (j === i ? v : x)) })} />
                  <button type="button" className="btn" disabled={metrics.length <= 1} onClick={() => set({ metrics: metrics.filter((_, j) => j !== i) })}>Прибрати</button>
                </li>
              ))}
              <li className="rte-row">
                <button type="button" className="btn" disabled={metrics.length >= MAX_METRICS || !unused('').length} onClick={() => set({ metrics: [...metrics, unused('')[0].key] })}>+ Метрика</button>
                <span className="ph-share-meta">Заміна метрики: оберіть іншу в тому ж рядку, порядок збережеться.</span>
              </li>
            </ul>
          )}

          {error && <div className="pacc-err">{error}</div>}
          {done && <div className="pacc-hint" role="status">{done}</div>}
          <div className="rte-row">
            <button type="button" className="btn btn-p" disabled={busy || !dirty} onClick={save}>{busy ? 'Зберігаємо…' : 'Зберегти шаблон'}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => { setDraft(normalizeTemplate(null)); setDone(''); }}>Скинути до стандартного</button>
            {dirty && <span className="ph-share-meta">Є незбережені зміни.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
