import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../common/ConfirmDialog';
import { loadBriefContext } from '../../lib/api/briefStore';
import { patchState, saveHumanVersion } from '../../lib/api/workflow';
import { saveInput, saveSettings, uploadAsset, deleteAsset } from '../../lib/api/projectCreative';
import { updateProject } from '../../lib/api/projects';
import { ASSET_GROUPS, CTA_MODES, addCtaVariant, ctaVariants, removeCtaVariant } from '../../lib/agents/projectCreative';
import { FIELD, SECTIONS, checkBrief } from '../../lib/workflow/briefSchema';
import { ROWS, STATUS_LABEL, STATUS_TONE, contentFromForm, formFromContent, rowStatus } from '../../lib/workflow/brief';
import { Pill } from './parts';
import BriefLists from './BriefLists';

// THE BRIEF of a project: the one page for everything the agents need to know (owner's rule 2026-11-26: one brief, no duplicates, nothing scattered).
// The facts live in four places (the brief itself, the project row, the project card, the files); a person sees ONE page and saves it with ONE button.
// What each fact is and who needs it: src/lib/workflow/briefSchema.js.
const ROW = Object.fromEntries(ROWS.map((r) => [r.key, r]));
const LONG = new Set(['audience', 'competitors', 'priority']);
const CARD_KEYS = ['about', 'offer', 'tone', 'copy_rules', 'seasonality', 'examples'];
const LABEL = { website: 'Сайт клієнта', about: 'Чим займається клієнт', offer: 'Оффер і відмінності', tone: 'Тон і стиль бренду', copy_rules: 'Правила до текстів', seasonality: 'Сезонність і події', examples: 'Посилання на готові креативи', restrictions: 'Заборонені слова й обмеження', figma_url: 'Макет у Figma', client_language: 'Мова текстів', geo: 'Країни показу (ГЕО)' };
const HINT = { website: 'Агенти читають сайт самі: товари, ціни, тон.', about: 'Коротко, 2-3 речення. Сайт вносити не треба.', offer: 'Головна пропозиція й акції, лише те, що точно є.', tone: 'Як бренд говорить: на «ви» чи «ти», слова, яких уникати.', copy_rules: 'Що має бути в заголовку й тексті: слоган, дисклеймер.', seasonality: 'Для плану на місяць: розпродажі, пік попиту.', examples: 'Якщо креативи не можна завантажити файлами: посилання на них.', restrictions: 'Що не можна показувати й обіцяти в рекламі. Код перевіряє тексти креативів на ці слова.', figma_url: 'Необов’язково.' };
const LAYOUT = [
  { key: 'biz', fields: [['website', 'project'], ['about', 'card'], ['offer', 'card'], ['audience', 'brief'], ['competitors', 'brief'], ['priority', 'brief']] },
  { key: 'money', fields: [['goal', 'brief'], ['budget_monthly', 'brief'], ['currency', 'brief'], ['avg_order', 'brief'], ['cogs_pct', 'brief'], ['shipping_cost', 'brief'], ['fee_pct', 'brief'], ['returns_pct', 'brief'], ['site_cvr_pct', 'brief'], ['target_roas', 'brief'], ['min_campaign_daily', 'brief']] },
  { key: 'products', lists: true, fields: [] },
  { key: 'geo', fields: [['geo', 'brief'], ['client_language', 'project']] },
  { key: 'brand', fields: [['tone', 'card'], ['copy_rules', 'card'], ['restrictions', 'setting'], ['seasonality', 'card'], ['examples', 'card'], ['figma_url', 'setting']], blocks: ['cta', 'files', 'dna'] },
  { key: 'access', fields: [['fb_page_id', 'brief'], ['dsa_name', 'brief'], ['ga4_property', 'brief']], blocks: ['cabinet'] },
  { key: 'pay', fields: [['payment_amount', 'brief'], ['payment_next_date', 'brief'], ['payment_period', 'brief']], blocks: ['flags'] },
];
const labelOf = (k) => LABEL[k] || ROW[k]?.label || FIELD[k]?.label || k;

export default function BriefPage({ projectId, onGo }) {
  const { email } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const [ctx, setCtx] = useState(null);
  const [form, setForm] = useState(null);
  const [extra, setExtra] = useState(null);
  const [init, setInit] = useState('');
  const [cta, setCta] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const fileRefs = useRef({});

  const load = useCallback(async () => {
    try {
      const c = await loadBriefContext(projectId);
      const s = c.card.settings || {}, inputs = s.inputs || {};
      const f = formFromContent(c.brief, c.briefBody);
      const e = { website: c.project?.website || '', client_language: c.project?.client_language || '', restrictions: s.restrictions || '', figma_url: s.figma_url || '', ...Object.fromEntries(CARD_KEYS.map((k) => [k, String(inputs[k]?.body || '')])) };
      setCtx(c); setForm(f); setExtra(e); setInit(JSON.stringify({ f, e })); setErr('');
    } catch (x) { setErr(x.message || String(x)); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const report = useMemo(() => (ctx ? checkBrief(ctx) : null), [ctx]);
  if (!ctx || !form) return <div className="wf wf-page">{err ? <div className="wf-err" role="alert">{err}</div> : <div className="wf-load">Завантаження…</div>}</div>;

  const dirty = JSON.stringify({ f: form, e: extra }) !== init;
  const was = JSON.parse(init || '{"f":{},"e":{}}');
  const setVal = (k, v) => setForm((f) => ({ ...f, values: { ...f.values, [k]: v } }));
  const toggleStatus = (k) => setForm((f) => ({ ...f, meta: { ...f.meta, [k]: { ...(f.meta[k] || {}), status: f.meta[k]?.status === 'confirmed' ? 'assumption' : 'confirmed' } } }));
  const setX = (k, v) => setExtra((x) => ({ ...x, [k]: v }));
  const settings = ctx.card.settings || {};
  const run = async (fn, msg, key = 'save') => { setBusy(key); setErr(''); setOk(''); try { await fn(); await load(); if (msg) setOk(msg); } catch (x) { setErr(x.message || String(x)); } finally { setBusy(''); } };

  async function saveAll() {
    await run(async () => {
      if (JSON.stringify(was.f) !== JSON.stringify(form)) await saveHumanVersion(projectId, 'brief', form.text || 'Бриф', email, 'Бриф оновлено на сторінці «Бриф»', contentFromForm(form));
      for (const k of CARD_KEYS) if ((was.e[k] || '') !== (extra[k] || '')) await saveInput(projectId, k, extra[k], email);
      if (was.e.restrictions !== extra.restrictions || was.e.figma_url !== extra.figma_url) await saveSettings(projectId, { figma_url: extra.figma_url, restrictions: extra.restrictions, cta_mode: settings.cta_mode, cta_text: settings.cta_text }, email);
      const proj = {};
      if (was.e.website !== extra.website) proj.website = extra.website.trim() || null;
      if (was.e.client_language !== extra.client_language) proj.client_language = extra.client_language || null;
      if (Object.keys(proj).length) await updateProject(projectId, proj);
    }, 'Бриф збережено.');
  }
  const saveCta = (patch) => run(() => saveSettings(projectId, { figma_url: settings.figma_url, restrictions: settings.restrictions, cta_mode: settings.cta_mode, cta_text: settings.cta_text, ...patch }, email), null, 'cta');
  async function addCta() { let next; try { next = addCtaVariant(settings.cta_text, cta); } catch (x) { setErr(x.message); return; } await saveCta({ cta_text: next }); setCta(''); }
  async function addFiles(list, kind) { await run(async () => { for (const file of [...list]) await uploadAsset(projectId, file, kind, email); }, null, 'file:' + kind); }
  async function removeAsset(a) { if (await confirm({ title: 'Прибрати файл?', body: `«${a.name}» зникне з бібліотеки клієнта.`, confirmLabel: 'Прибрати', danger: true })) run(() => deleteAsset(a), null, 'del'); }
  const flag = (k) => run(() => patchState(projectId, k === 'paid' ? { paid_at: new Date().toISOString() } : { contracts_signed_at: new Date().toISOString() }, email, k === 'paid' ? 'Оплату підтверджено.' : 'Договори підписано.'), null, k);

  const need = (k) => report.items.find((i) => i.key === k);
  const missing = report.items.filter((i) => !i.ok && i.level === 'required');
  const sec = (key) => { const its = report.items.filter((i) => i.section === key); return { ok: its.filter((i) => i.ok).length, total: its.length }; };
  const pct = report.required.total ? Math.round((report.required.ok / report.required.total) * 100) : 100;

  const fieldRow = ([k, store]) => {
    const it = need(k);
    const val = store === 'brief' ? form.values[k] ?? '' : extra[k] ?? '';
    const long = LONG.has(k) || ['about', 'offer', 'tone', 'copy_rules', 'seasonality', 'examples', 'restrictions'].includes(k);
    const lbl = labelOf(k);
    const st = store === 'brief' ? rowStatus(val, form.meta[k]) : null;
    return (
      <div className="wf-bd-row" id={'f-' + k} key={k}>
        <label htmlFor={'bf-' + k}>{lbl}{(HINT[k] || it?.why) && <small>{HINT[k] || it.why}</small>}</label>
        <div>
          {k === 'client_language'
            ? <select id={'bf-' + k} className="wf-bd-in" style={{ width: 'auto' }} value={val} onChange={(e) => setX(k, e.target.value)}><option value="">Українська (за замовчуванням)</option><option value="uk">Українська</option><option value="en">Англійська</option></select>
            : long
              ? <textarea id={'bf-' + k} className="wf-ta" rows={2} value={val} onChange={(e) => (store === 'brief' ? setVal(k, e.target.value) : setX(k, e.target.value))} placeholder={it?.ask?.placeholder} />
              : <input id={'bf-' + k} className="wf-bd-in" inputMode={store === 'brief' && !ROW[k]?.text ? 'decimal' : 'text'} value={val} onChange={(e) => (store === 'brief' ? setVal(k, e.target.value) : setX(k, e.target.value))} placeholder={it?.ask?.placeholder} />}
          <div className="wf-bd-meta">
            {it && (it.ok ? null : <Pill tone={it.level === 'required' ? 'bad' : 'warn'}>{it.level === 'required' ? 'потрібно' : 'бажано'}</Pill>)}
            {st && st !== 'empty' && <button type="button" className={'wf-st ' + STATUS_TONE[st]} onClick={() => toggleStatus(k)} title="Натисніть, щоб змінити: підтверджено або припущення"><i />{STATUS_LABEL[st]}</button>}
            {it && it.needFor?.length > 0 && !it.ok && <span className="wf-muted" style={{ fontSize: 12 }}>для: {it.needFor.join(', ')}</span>}
          </div>
        </div>
      </div>
    );
  };

  const blocks = {
    cta: (
      <div className="wf-bd-row" key="cta"><label>Текст кнопки<small>Кілька варіантів: агент бере той, що пасує креативу.</small></label>
        <div className="wf-col" style={{ gap: 8 }}>
          <div className="wf-row">
            {Object.entries(CTA_MODES).map(([k, v]) => <button key={k} type="button" className={'wf-btn sm' + (settings.cta_mode === k ? ' p' : '')} aria-pressed={settings.cta_mode === k} disabled={busy === 'cta'} onClick={() => saveCta({ cta_mode: k })}>{v}</button>)}
          </div>
          {settings.cta_mode !== 'none' && (
            <div className="wf-row">
              {ctaVariants(settings.cta_text).map((v) => <span key={v} className="wf-pill-x">{v}<button type="button" aria-label={`Прибрати «${v}»`} onClick={() => saveCta({ cta_text: removeCtaVariant(settings.cta_text, v) })}>×</button></span>)}
              <input className="wf-bd-in" style={{ width: 190 }} aria-label="Новий варіант кнопки" placeholder="Купити" value={cta} onChange={(e) => setCta(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCta(); }} />
              <button type="button" className="wf-btn sm" disabled={!cta.trim() || busy === 'cta'} onClick={addCta}>Додати</button>
            </div>
          )}
        </div>
      </div>
    ),
    files: (
      <div className="wf-bd-row" id="f-files" key="files"><label>Файли клієнта<small>Логотип, фото товару, приклади. Фото товару потрібне для креативів.</small></label>
        <div className="wf-col" style={{ gap: 10 }}>
          {ASSET_GROUPS.map((g) => {
            const list = ctx.card.assets.filter((a) => a.kind === g.kind);
            return (
              <div key={g.kind}>
                <div className="wf-row"><b style={{ fontSize: 13 }}>{g.title}</b><span className="wf-muted" style={{ fontSize: 12 }}>{list.length ? `файлів: ${list.length}` : 'немає'}</span>
                  <input ref={(el) => { fileRefs.current[g.kind] = el; }} type="file" multiple accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { addFiles(e.target.files, g.kind); e.target.value = ''; }} />
                  <button type="button" className="wf-btn sm" disabled={busy === 'file:' + g.kind} onClick={() => fileRefs.current[g.kind]?.click()}>{busy === 'file:' + g.kind ? 'Вантажу…' : 'Додати'}</button></div>
                {list.length > 0 && <div className="wf-row" style={{ marginTop: 6 }}>{list.map((a) => <span key={a.id} className="wf-pill-x">{a.name}<button type="button" aria-label={`Прибрати «${a.name}»`} onClick={() => removeAsset(a)}>×</button></span>)}</div>}
              </div>
            );
          })}
        </div>
      </div>
    ),
    dna: (
      <div className="wf-bd-row" key="dna"><label>ДНК бренду<small>Кольори, шрифти, стиль з сайту клієнта.</small></label><div><button type="button" className="wf-btn sm" onClick={() => onGo?.('dossier', 'brand_dna')}>Відкрити ДНК бренду</button></div></div>
    ),
    cabinet: (
      <div className="wf-bd-row" key="cabinet"><label>Рекламний кабінет Meta<small>Без кабінету нема чого аналізувати й нікуди запускати.</small></label>
        <div className="wf-row">{ctx.accounts.some((a) => a.platform === 'meta') ? <Pill tone="ok">підключено</Pill> : <><Pill tone="bad">не підключено</Pill><a className="wf-btn sm" href={`/projects/${projectId}?tab=overview`}>Підключити</a></>}</div></div>
    ),
    flags: (
      <div className="wf-bd-row" key="flags"><label>Оплата й договір<small>Процес стартує після обох.</small></label>
        <div className="wf-row">
          {ctx.state?.paid_at ? <Pill tone="ok">оплату підтверджено</Pill> : <button type="button" className="wf-btn sm p" disabled={busy === 'paid'} onClick={() => flag('paid')}>Підтвердити оплату</button>}
          {ctx.state?.contracts_signed_at ? <Pill tone="ok">договір підписано</Pill> : <button type="button" className="wf-btn sm p" disabled={busy === 'contracts'} onClick={() => flag('contracts')}>Договір підписано</button>}
        </div></div>
    ),
  };

  return (
    <div className="wf wf-page wf-col">
      {confirmDialog}
      <div className="wf-card">
        <div className="wf-row" style={{ justifyContent: 'space-between' }}>
          <div className="wf-row">
            <div className="wf-ring" style={{ '--p': pct }}><b>{report.required.ok}/{report.required.total}</b></div>
            <div>
              <h3 style={{ margin: 0 }}>Бриф</h3>
              <div className="wf-muted" style={{ fontSize: 13, marginTop: 2 }}>{report.ready ? 'Усе обов’язкове є.' : `Не вистачає обов’язкового: ${missing.length}.`} Усе, що агентам треба знати про клієнта, зібрано тут, повторно його ніде вводити не треба.</div>
            </div>
          </div>
          {ctx.state?.brief_pending && <button type="button" className="wf-btn p sm" disabled={!!busy || dirty} title={dirty ? 'Спершу збережіть зміни' : ''} onClick={() => run(() => patchState(projectId, { brief_pending: false }, email, 'Бриф підтверджено менеджером.'), 'Бриф підтверджено.', 'confirm')}>Підтвердити бриф</button>}
        </div>
        {missing.length > 0 && <div className="wf-row" style={{ marginTop: 10 }}>{missing.map((m) => <a key={m.key} className="wf-miss" href={'#f-' + (m.kind === 'files' ? 'files' : m.key)}>{m.label}</a>)}</div>}
        {ctx.state?.brief_pending && <div className="wf-muted" style={{ fontSize: 12.5, marginTop: 8 }}>Бриф складено з сайту: це припущення. Перевірте поля, допишіть цифри й підтвердіть: доки бриф не підтверджено, процес не стартує.</div>}
      </div>
      {err && <div className="wf-err" role="alert">{err}</div>}
      {ok && !dirty && <div className="wf-muted" role="status" style={{ fontSize: 13 }}>{ok}</div>}

      <div className="wf-bd-layout">
        <nav className="wf-card wf-bd-rail" aria-label="Розділи брифу">
          {SECTIONS.map((s) => { const c = sec(s.key); return <a key={s.key} href={'#b-' + s.key}>{s.name}{c.total > 0 && <span className={'wf-bd-n' + (c.ok === c.total ? ' ok' : '')}>{c.ok}/{c.total}</span>}</a>; })}
        </nav>
        <div className="wf-col" style={{ minWidth: 0 }}>
          {LAYOUT.map((s) => (
            <div className="wf-card wf-bd-form" id={'b-' + s.key} key={s.key}>
              <h3>{SECTIONS.find((x) => x.key === s.key).name}</h3>
              {s.fields.map(fieldRow)}
              {s.lists && <BriefLists form={form} setForm={setForm} />}
              {(s.blocks || []).map((b) => blocks[b])}
            </div>
          ))}
          <div className="wf-card wf-bd-form">
            <h3>Нотатки до брифу</h3>
            <textarea className="wf-ta" style={{ minHeight: 90 }} aria-label="Нотатки до брифу" value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))} />
          </div>
        </div>
      </div>

      {dirty && (
        <div className="wf-set-bar" role="region" aria-label="Незбережені зміни">
          <span>Є незбережені зміни</span>
          <button type="button" className="wf-btn" disabled={!!busy} onClick={load}>Скасувати</button>
          <button type="button" className="wf-btn p" disabled={!!busy} onClick={saveAll}>Зберегти бриф</button>
        </div>
      )}
    </div>
  );
}
