import { useState } from 'react';
import AutoResizeTextarea from '../../Reports/AutoResizeTextarea';
import CreativeGrid from '../CreativeGrid';
import CreativePickerDialog from '../CreativePickerDialog';
import { HubTitle } from '../hubIcons';
import { useConfirm } from '../../common/ConfirmDialog';
import { suggestCreatives } from '../../../lib/api/reportCreatives';
import { buildWhatWasDone } from '../../../lib/reportEngine';

// «Показники за період»: under the numbers, the same fields the weekly and the monthly report have — the texts (conclusions and the rest of the layout's blocks) and the
// creatives of the chosen dates. Both are saved with the custom report («Зберегти»). The state lives in PeriodStats; this only draws and edits it.
export default function PeriodExtras({ projectId, ctx, range, blocks, sections, onSections, creatives, onCreatives }) {
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState('');
  const [work, setWork] = useState(null);
  const [workError, setWorkError] = useState('');
  const [picking, setPicking] = useState(null);
  const [cerr, setCerr] = useState('');
  const period = { start: range.from, end: range.to };
  const days = Math.round((new Date(range.to) - new Date(range.from)) / 86400000) + 1;
  const canCreatives = ctx.scope === 'meta' || ctx.scope === 'all';
  const count = creatives?.count || ctx.layout?.creatives?.monthly || 4;
  const items = creatives?.items || [];
  const setItems = (next) => onCreatives({ count, items: next });

  async function suggest() {
    setBusy('creatives'); setCerr('');
    try {
      const found = await suggestCreatives({ projectId, start: period.start, end: period.end, count });
      if (!found.length) setCerr('За цей період у кабінеті Meta не знайдено оголошень.'); else setItems(found);
    } catch (e) { setCerr(e.message || 'Не вдалося підібрати креативи.'); } finally { setBusy(''); }
  }

  async function fillWhatWasDone() {
    if ((sections.whatWasDone || '').trim() && !(await confirm({ title: 'Замінити текст?', body: 'Поточний текст «What was done» буде замінено. Продовжити?', confirmLabel: 'Замінити', cancelLabel: 'Залишити' }))) return;
    setBusy('work'); setWork(null); setWorkError('');
    try {
      const result = await buildWhatWasDone({ source: 'history', periodType: days <= 10 ? 'weekly' : 'monthly', period, accounts: ctx.accounts, projectName: ctx.project.name, note: '' });
      if (result.empty) { setWork({ empty: result.empty }); return; }
      onSections({ ...sections, whatWasDone: result.text });
      setWork({ facts: result.info.facts || [], writer: result.writer });
    } catch (e) { setWorkError(e.message || 'Не вдалося сформувати текст.'); } finally { setBusy(''); }
  }

  return (
    <>
      {blocks.length > 0 && (
        <section className="report-section">
          <HubTitle icon="note">Текст звіту (англійською)</HubTitle>
          <div className="pacc-hint">Це кастомний звіт: у клієнта він не з’являється, тексти потрібні вам і для вивантаження.</div>
          <div className="prep-texts">
            {blocks.map((b) => (
              <div className="ov-field-box" key={b.key}>
                <div className="ov-field-label">{b.title}</div>
                <AutoResizeTextarea value={sections[b.key] || ''} onChange={(v) => onSections({ ...sections, [b.key]: v })} placeholder={b.title + '…'} />
                {b.key === 'whatWasDone' && (
                  <div className="prep-work">
                    <div className="prep-work-actions">
                      <button type="button" className="btn" onClick={fillWhatWasDone} disabled={busy === 'work' || !ctx.accounts.length}>{busy === 'work' ? 'Формуємо…' : 'Сформувати з історії кабінетів'}</button>
                      {!ctx.accounts.length && <span className="pacc-hint">Потрібен підключений кабінет.</span>}
                    </div>
                    {workError && <div className="form-err">{workError}</div>}
                    {work && (
                      <div className="prep-internal-note" role="note">
                        <b>Тільки для внутрішнього користування.</b>{' '}
                        {work.empty || `Текст написано за ${work.facts.length} діями з кабінетів (системні сповіщення відфільтровано).`}
                        {work.writer === 'plain' && ' Автоматичне оформлення зараз недоступне, тому показано сирий список дій: відредагуйте його.'}
                        {work.facts?.length > 0 && <details className="prep-work-facts"><summary>Які дії враховано</summary><ul>{work.facts.map((f) => <li key={f}>{f}</li>)}</ul></details>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {canCreatives && (
        <section className="report-section">
          <HubTitle icon="layers">Most effective creatives</HubTitle>
          {items.length > 0 ? <CreativeGrid items={items} onReplace={(i) => setPicking(i)} onRemove={(i) => setItems(items.filter((_, j) => j !== i))} /> : <div className="pacc-hint">Креативів у звіті ще немає.</div>}
          <div className="crx-tools">
            <button type="button" className="btn" disabled={busy === 'creatives'} onClick={suggest}>{busy === 'creatives' ? 'Працюємо…' : items.length ? 'Підібрати знову' : 'Підібрати креативи за цей період'}</button>
            <button type="button" className="btn" onClick={() => setPicking(items.length)}>+ Додати креатив</button>
            {cerr && <span className="form-err">{cerr}</span>}
          </div>
        </section>
      )}
      {picking != null && (
        <CreativePickerDialog
          row={{ project_id: projectId, period_start: period.start, period_end: period.end }} taken={items.map((c) => c.adId)} onClose={() => setPicking(null)}
          onPicked={(item) => { const at = picking; setPicking(null); setItems(at >= items.length ? [...items, item] : items.map((c, j) => (j === at ? item : c))); }}
        />
      )}
      {confirmDialog}
    </>
  );
}
