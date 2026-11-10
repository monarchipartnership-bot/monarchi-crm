import { useEffect, useState } from 'react';
import { composeText } from '../../../../lib/creatives/composeText';
import { downloadOne, downloadZip } from '../../../../lib/creatives/download';
import { estimateGeneration, generateCreatives, pollCreatives, saveFinalPicture, setCreativeStatus } from '../../../../lib/api/creatives';

const STATUS = {
  planned: ['Заплановано', 'wait'], producing: ['Генерується…', 'work'], qc: ['Перевірка', 'work'], review: ['Готово до перегляду', 'done'],
  approved: ['Схвалено', 'ok'], rejected: ['Відхилено', 'bad'], failed: ['Помилка', 'bad'],
};
const usd = (n) => `$${Number(n || 0).toFixed(2)}`;

// The pictures of a request: what Higgsfield made for every concept and format, what each cost, and the person's decisions. The price is asked before anything
// is spent (the window shows it and waits for the OK); the words are put over the picture here when the system, not the image model, writes them.
export default function CreativesGallery({ request, creatives, concepts = [], reload, notify, confirm, projectName = '' }) {
  const [busy, setBusy] = useState('');
  const [missing, setMissing] = useState(null);
  const producing = creatives.some((c) => c.status === 'producing');
  useEffect(() => {
    if (!producing) return undefined;
    const t = setInterval(() => { pollCreatives(request.id).then(() => reload()).catch(() => {}); }, 8000);
    return () => clearInterval(t);
  }, [producing, request.id, reload]);

  const conceptOf = (c) => concepts.find((x) => x.key === c.concept_key) || null;
  const todo = creatives.filter((c) => ['planned', 'failed'].includes(c.status));
  const total = creatives.reduce((s, c) => s + Number(c.cost_usd || 0), 0);
  const fileOf = (c) => ({ id: c.id, url: c.final_url || c.asset_url || '', downloadUrl: c.final_url || c.asset_url || '', ratio: c.ratio, conceptName: c.concept_name || c.concept_key });
  const ready = creatives.filter((c) => c.final_url || c.asset_url);
  // the very file from the storage, no re-drawing: the quality stays as the model made it
  async function download(c) { setBusy(`dl:${c.id}`); try { await downloadOne(fileOf(c), { project: projectName }); } catch (e) { notify(e.message || 'Не вдалося завантажити файл.', true); } finally { setBusy(''); } }
  async function downloadAll() { setBusy('dlall'); try { const n = await downloadZip(ready.map(fileOf), { project: projectName, zipName: `${projectName || 'creatives'}_zapyt-${request.id}` }); notify(`Завантажено файлів: ${n}.`); } catch (e) { notify(e.message || 'Не вдалося завантажити файли.', true); } finally { setBusy(''); } }

  async function generate(ids = null) {
    setBusy(ids ? `one:${ids[0]}` : 'all');
    try {
      const est = await estimateGeneration(request.id, ids);
      if (est.configured === false) { setMissing(est.missing || []); return; }
      setMissing(null);
      if (!est.count) {
        notify(est.failed?.length ? `Оцінка не вдалася: ${est.failed[0].error}` : est.skipped?.length ? `Ліміт витрат запиту вичерпано (${usd(est.limit)}): підніміть його в налаштуваннях Агента креативщик.` : 'Немає картинок, які можна згенерувати.', true);
        return;
      }
      const ok = await confirm({
        title: 'Згенерувати картинки?',
        body: `Картинок: ${est.count}. Оцінка Higgsfield: ≈ ${usd(est.estimateUsd)}. Разом за запит буде ${usd(est.spent)} із ліміту ${usd(est.limit)}.${est.skipped?.length ? ` Не вміщається в ліміт і лишається в черзі: ${est.skipped.length}.` : ''}${est.failed?.length ? ` Не вдалося оцінити: ${est.failed.length}.` : ''}`,
        confirmLabel: `Згенерувати за ≈ ${usd(est.estimateUsd)}`,
      });
      if (!ok) return;
      const r = await generateCreatives(request.id, ids);
      notify(r.submitted ? `Запущено картинок: ${r.submitted}. Вони зʼявляться тут за кілька хвилин.` : 'Нічого не запущено.', !r.submitted);
      await reload();
    } catch (e) { notify(e.message || 'Не вдалося запустити генерацію.', true); } finally { setBusy(''); }
  }

  async function overlay(c) {
    const concept = conceptOf(c);
    const v = c.copy?.variants?.[0] || {};
    setBusy(`text:${c.id}`);
    try {
      const copy = concept?.copy?.headline ? concept.copy : { headline: v.headline || '', subline: v.description || '', badge: '' };
      const cta = concept?.cta?.show === false ? '' : concept?.cta?.text || v.cta || '';
      const blob = await composeText({ imageUrl: c.asset_url, zone: concept?.layout?.text_zone && concept.layout.text_zone !== 'none' ? concept.layout.text_zone : 'left', headline: copy.headline, subline: copy.subline, badge: copy.badge, cta });
      await saveFinalPicture(c, blob);
      notify('Текст накладено.');
      await reload();
    } catch (e) { notify(e.message || 'Не вдалося накласти текст.', true); } finally { setBusy(''); }
  }

  async function decide(c, status) {
    setBusy(`d:${c.id}`);
    try { await setCreativeStatus(c.id, status); await reload(); } catch (e) { notify(e.message || 'Не вдалося зберегти рішення.', true); } finally { setBusy(''); }
  }

  if (!creatives.length) return null;
  return (
    <section className="stu-section stu-gal" aria-label="Картинки">
      <div className="stu-gal-head">
        <h3>Картинки</h3>
        <span className="cmp-muted">Витрачено на запит: <b>{usd(total)}</b></span>
        {ready.length > 0 && <button type="button" className="cmp-btn" disabled={!!busy} onClick={downloadAll}>{busy === 'dlall' ? 'Збираємо архів…' : `Завантажити все (${ready.length})`}</button>}
        {todo.length > 0 && <button type="button" className="cmp-btn cmp-btn--primary" disabled={!!busy} onClick={() => generate(null)}>{busy === 'all' ? 'Рахуємо вартість…' : `Згенерувати картинки (${todo.length})`}</button>}
      </div>
      {missing && (
        <div className="cmp-warnbox" role="status">
          <b>Higgsfield ще не підключено на сервері.</b> Не вистачає змінних: {missing.join(', ')}. Ключі створюються в консолі Higgsfield (console.higgsfield.ai), а назва моделі з підтримкою референсних картинок береться там же. Їх додає власник у Vercel (Settings → Environment Variables) і робить новий деплой.
        </div>
      )}
      <ul className="stu-gal-grid">
        {creatives.map((c) => {
          const concept = conceptOf(c);
          const [label, tone] = STATUS[c.status] || [c.status, 'wait'];
          const shown = c.final_url || c.asset_url;
          const canOverlay = concept?.text_render === 'overlay' && c.asset_url && ['review', 'approved'].includes(c.status);
          return (
            <li key={c.id} className={'stu-gal-card stu-gal-card--' + tone}>
              <div className={'stu-gal-pic' + (shown ? '' : ' is-empty')} style={{ aspectRatio: String(c.ratio || '1:1').replace(':', ' / ') }}>
                {shown ? <a href={shown} target="_blank" rel="noopener noreferrer" title="Відкрити в повному розмірі"><img src={shown} alt={`${c.concept_name} ${c.ratio}`} loading="lazy" /></a> : <span>{c.status === 'producing' ? 'Higgsfield малює…' : 'Картинки ще немає'}</span>}
              </div>
              <div className="stu-gal-meta">
                <b>{c.concept_name || c.concept_key}</b>
                <small>{c.ratio}{c.generations ? ` · генерацій: ${c.generations}` : ''}{Number(c.cost_usd) > 0 ? ` · ${usd(c.cost_usd)}` : ''}</small>
                <span className={'stu-gal-chip is-' + tone}>{label}</span>
                {c.final_url && <small>Текст накладено</small>}
                {c.note && <small className="stu-gal-note">{c.note}</small>}
              </div>
              <div className="stu-gal-actions">
                {canOverlay && <button type="button" className="cmp-btn" disabled={!!busy} onClick={() => overlay(c)}>{busy === `text:${c.id}` ? 'Накладаємо…' : c.final_url ? 'Накласти текст знову' : 'Накласти текст'}</button>}
                {['planned', 'review', 'rejected', 'failed', 'approved'].includes(c.status) && <button type="button" className="cmp-btn" disabled={!!busy} onClick={() => generate([c.id])}>{busy === `one:${c.id}` ? 'Рахуємо…' : c.status === 'planned' ? 'Згенерувати цю' : c.status === 'failed' ? 'Спробувати знову' : 'Згенерувати знову'}</button>}
                {shown && <button type="button" className="cmp-btn" disabled={!!busy} onClick={() => download(c)}>{busy === `dl:${c.id}` ? 'Завантажуємо…' : 'Завантажити'}</button>}
                {c.status === 'review' && <><button type="button" className="cmp-btn cmp-btn--primary" disabled={!!busy} onClick={() => decide(c, 'approved')}>Схвалити</button><button type="button" className="cmp-btn" disabled={!!busy} onClick={() => decide(c, 'rejected')}>Відхилити</button></>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
