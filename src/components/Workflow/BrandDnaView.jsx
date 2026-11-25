import { useState } from 'react';
import { Pill } from './parts';
import { brandGaps, normHex, renderBrandText } from '../../../api/_lib/wf/skills/brandDnaEngine.js';

const COLOR_ROLE = { primary: 'основний', secondary: 'другий', accent: 'акцент', background: 'фон', text: 'текст' };
const FONT_ROLE = { headings: 'заголовки', body: 'основний текст' };
const FIELD_LABEL = { colors: 'кольори', fonts: 'шрифти', logo_url: 'логотип', style: 'стиль', visual_donts: 'що не показувати', overview: 'про компанію', values: 'цінності', tagline: 'слоган', tone: 'тон', taboo_words: 'заборонені слова', taboo_claims: 'заборонені твердження', headline_avoid: 'яких заголовків уникати', rules: 'правила' };
const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
const words = (s) => String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

// The section «ДНК бренду» (Zeely item 1, owner's pick 2026-11-25: variant A for reading, variant B as the editing window).
// content = what the Researcher wrote (api/_lib/wf/skills/brandDnaEngine.js) or what a person saved after editing.
export function BrandDnaView({ content, onEdit, onConfirm, busy }) {
  const c = content, id = c.identity || {}, br = c.branding || {}, cm = c.communication || {};
  const gaps = brandGaps(c);
  const edited = c.edited || [];
  const banned = [...(cm.taboo_words || []), ...(cm.taboo_claims || [])];
  return (
    <div className="wf-col">
      <div className="wf-row" style={{ justifyContent: 'space-between' }}>
        <div className="wf-row">
          {c.reviewed ? <Pill tone="ok">Перевірено менеджером</Pill> : <Pill tone="warn">Потребує перевірки</Pill>}
          <span className="wf-muted" style={{ fontSize: 12.5 }}>{c.url ? `З сайту ${c.url}` : 'Заповнено вручну'}{edited.length ? ` · ваші правки: ${edited.map((k) => FIELD_LABEL[k] || k).join(', ')}` : ''}</span>
        </div>
        <div className="wf-row">
          {!c.reviewed && <button type="button" className="wf-btn p sm" disabled={busy} onClick={onConfirm}>Підтвердити профіль</button>}
          <button type="button" className="wf-btn sm" disabled={busy} onClick={onEdit}>Редагувати поля</button>
        </div>
      </div>
      <div className="wf-bd-grid">
        <div className="wf-card">
          <h3>Кольори</h3>
          {(id.colors || []).length === 0 ? <div className="wf-muted">Не визначено.</div> : (
            <div className="wf-bd-sw">{id.colors.map((x) => <div key={x.hex}><i style={{ background: x.hex }} /><b>{x.hex}</b><span>{COLOR_ROLE[x.role] || x.role}</span></div>)}</div>
          )}
          <h3 style={{ marginTop: 16 }}>Логотип</h3>
          {id.logo_url
            ? <div className="wf-bd-logo"><img src={id.logo_url} alt="Логотип клієнта" referrerPolicy="no-referrer" /><span className="wf-muted">{id.logo_url}</span></div>
            : <div className="wf-muted">Не знайдено: завантажте його в картку проєкту.</div>}
        </div>
        <div className="wf-card">
          <h3>Шрифти</h3>
          {(id.fonts || []).length === 0 ? <div className="wf-muted">Не визначено.</div> : id.fonts.map((f) => (
            <div key={f.name} className="wf-bd-font">
              <span style={{ fontFamily: `'${f.name}', system-ui, sans-serif`, fontSize: f.role === 'headings' ? 24 : 16 }}>{f.role === 'headings' ? 'Заголовок бренду' : 'Основний текст, як його бачить покупець.'}</span>
              <small>{f.name} · {FONT_ROLE[f.role] || f.role}</small>
            </div>
          ))}
          <h3 style={{ marginTop: 16 }}>Стиль картинок</h3>
          <div>{id.style || <span className="wf-muted">Не визначено.</span>}</div>
          {(id.visual_donts || []).length > 0 && <div className="wf-row" style={{ marginTop: 8 }}>{id.visual_donts.map((t) => <Pill key={t} tone="bad">Не показувати: {t}</Pill>)}</div>}
        </div>
        <div className="wf-card">
          <h3>Бренд</h3>
          <div>{br.overview || <span className="wf-muted">Не визначено.</span>}</div>
          {br.tagline && <div style={{ marginTop: 6 }}>Слоган: <b>«{br.tagline}»</b></div>}
          {(br.values || []).length > 0 && <div className="wf-row" style={{ marginTop: 8 }}>{br.values.map((t) => <Pill key={t} tone="mute">{t}</Pill>)}</div>}
        </div>
        <div className="wf-card">
          <h3>Комунікація</h3>
          <div>Тон: {cm.tone || <span className="wf-muted">не визначено</span>}</div>
          <h3 style={{ marginTop: 14 }}>Заборонено в текстах реклами</h3>
          {banned.length === 0 ? <div className="wf-muted">Нічого не вказано.</div> : <div className="wf-row">{banned.map((t) => <Pill key={t} tone="bad">{t}</Pill>)}</div>}
          <div className="wf-muted" style={{ fontSize: 12.5, marginTop: 8 }}>Креатив із цими словами система повертає менеджеру на перевірку.</div>
          {(cm.headline_avoid || []).length > 0 && <div className="wf-muted" style={{ fontSize: 12.5, marginTop: 6 }}>Уникати заголовків: {cm.headline_avoid.join('; ')}</div>}
        </div>
      </div>
      {(c.rules || []).length > 0 && <div className="wf-card"><h3>Загальні правила для креативів</h3><ul className="wf-nlist">{c.rules.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
      {gaps.length > 0 && <div className="wf-card" style={{ background: 'var(--wf-warn-bg)', boxShadow: 'none' }}><h3>Що ще потрібно від менеджера</h3><ul className="wf-nlist">{gaps.map((g) => <li key={g}>{g}</li>)}</ul></div>}
    </div>
  );
}

// the editing window (variant B): every field is a field of the form; what a person changed is remembered in content.edited, and the agent never overwrites it
export function BrandDnaEditor({ content, busy, onSave, onCancel }) {
  const c = content || {};
  const id = c.identity || {}, br = c.branding || {}, cm = c.communication || {};
  const [colors, setColors] = useState((id.colors || []).map((x) => ({ ...x })));
  const [fonts, setFonts] = useState((id.fonts || []).map((x) => ({ ...x })));
  const [f, setF] = useState({
    logo_url: id.logo_url || '', style: id.style || '', visual_donts: (id.visual_donts || []).join('\n'), overview: br.overview || '', values: (br.values || []).join('\n'), tagline: br.tagline || '',
    tone: cm.tone || '', taboo_words: (cm.taboo_words || []).join(', '), taboo_claims: (cm.taboo_claims || []).join('\n'), headline_avoid: (cm.headline_avoid || []).join('\n'), rules: (c.rules || []).join('\n'),
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setColor = (i, patch) => setColors((p) => p.map((y, j) => (j === i ? { ...y, ...patch } : y)));
  const setFont = (i, patch) => setFonts((p) => p.map((y, j) => (j === i ? { ...y, ...patch } : y)));
  const badHex = colors.some((x) => !normHex(x.hex));

  function save() {
    const next = {
      ...c, schema: 1, reviewed: true,
      identity: { colors: colors.map((x) => ({ hex: normHex(x.hex), role: x.role })).filter((x) => x.hex), fonts: fonts.map((x) => ({ name: String(x.name).trim(), role: x.role })).filter((x) => x.name), logo_url: f.logo_url.trim(), style: f.style.trim(), visual_donts: lines(f.visual_donts) },
      branding: { overview: f.overview.trim(), values: lines(f.values), tagline: f.tagline.trim() },
      communication: { tone: f.tone.trim(), taboo_words: words(f.taboo_words), taboo_claims: lines(f.taboo_claims), headline_avoid: lines(f.headline_avoid) },
      rules: lines(f.rules),
    };
    const was = { colors: id.colors || [], fonts: id.fonts || [], logo_url: id.logo_url || '', style: id.style || '', visual_donts: id.visual_donts || [], overview: br.overview || '', values: br.values || [], tagline: br.tagline || '', tone: cm.tone || '', taboo_words: cm.taboo_words || [], taboo_claims: cm.taboo_claims || [], headline_avoid: cm.headline_avoid || [], rules: c.rules || [] };
    const now = { colors: next.identity.colors, fonts: next.identity.fonts, logo_url: next.identity.logo_url, style: next.identity.style, visual_donts: next.identity.visual_donts, overview: next.branding.overview, values: next.branding.values, tagline: next.branding.tagline, tone: next.communication.tone, taboo_words: next.communication.taboo_words, taboo_claims: next.communication.taboo_claims, headline_avoid: next.communication.headline_avoid, rules: next.rules };
    next.edited = [...new Set([...(c.edited || []), ...Object.keys(now).filter((k) => JSON.stringify(now[k]) !== JSON.stringify(was[k]))])];
    onSave(renderBrandText(next, { gaps: brandGaps(next), url: next.url }), next);
  }

  const mark = (k) => ((c.edited || []).includes(k) ? <span className="wf-bd-mark h">ваше</span> : <span className="wf-bd-mark s">{c.url ? 'з сайту' : 'вручну'}</span>);
  const row = (label, hint, body) => <div className="wf-bd-row"><label>{label}{hint && <small>{hint}</small>}</label><div>{body}</div></div>;
  const text = (key, label, rows) => <><textarea className="wf-ta" rows={rows} aria-label={label} value={f[key]} onChange={set(key)} />{mark(key)}</>;
  const line = (key, label) => <><input className="wf-bd-in" aria-label={label} value={f[key]} onChange={set(key)} />{mark(key)}</>;
  return (
    <div className="wf-col">
      <div className="wf-muted" style={{ fontSize: 12.5 }}>Кожне поле показує, звідки воно: «з сайту» чи «ваше». Після збереження агент ваші правки не перезаписує, а лише пропонує.</div>
      <div className="wf-card wf-bd-form">
        <h3>Візуальна ідентичність</h3>
        {row('Кольори', 'hex-код і роль', (
          <div className="wf-col" style={{ gap: 6 }}>
            {colors.map((x, i) => (
              <div key={i} className="wf-row">
                <input type="color" aria-label={`Колір ${i + 1}`} value={normHex(x.hex) || '#000000'} onChange={(e) => setColor(i, { hex: e.target.value })} />
                <input className="wf-bd-in" style={{ width: 110 }} aria-label={`Hex колір ${i + 1}`} value={x.hex} onChange={(e) => setColor(i, { hex: e.target.value })} />
                <select className="wf-bd-in" aria-label={`Роль кольору ${i + 1}`} value={x.role} onChange={(e) => setColor(i, { role: e.target.value })}>{Object.entries(COLOR_ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <button type="button" className="wf-btn sm d" onClick={() => setColors((p) => p.filter((_, j) => j !== i))}>Прибрати</button>
              </div>
            ))}
            <div className="wf-row"><button type="button" className="wf-btn sm" onClick={() => setColors((p) => [...p, { hex: '#7a3fd0', role: 'accent' }])}>Додати колір</button>{mark('colors')}</div>
            {badHex && <div className="wf-err" role="alert">Один із кольорів не схожий на hex-код (наприклад #c2185b).</div>}
          </div>
        ))}
        {row('Шрифти', 'назва й роль', (
          <div className="wf-col" style={{ gap: 6 }}>
            {fonts.map((x, i) => (
              <div key={i} className="wf-row">
                <input className="wf-bd-in" style={{ width: 200 }} aria-label={`Шрифт ${i + 1}`} value={x.name} onChange={(e) => setFont(i, { name: e.target.value })} />
                <select className="wf-bd-in" aria-label={`Роль шрифту ${i + 1}`} value={x.role} onChange={(e) => setFont(i, { role: e.target.value })}>{Object.entries(FONT_ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <button type="button" className="wf-btn sm d" onClick={() => setFonts((p) => p.filter((_, j) => j !== i))}>Прибрати</button>
              </div>
            ))}
            <div className="wf-row"><button type="button" className="wf-btn sm" onClick={() => setFonts((p) => [...p, { name: '', role: 'body' }])}>Додати шрифт</button>{mark('fonts')}</div>
          </div>
        ))}
        {row('Логотип', 'адреса картинки', line('logo_url', 'Адреса логотипа'))}
        {row('Стиль картинок', null, text('style', 'Стиль картинок', 2))}
        {row('Не показувати', 'по одному в рядок', text('visual_donts', 'Що не показувати', 2))}
        <h3 style={{ marginTop: 10 }}>Бренд</h3>
        {row('Про компанію', null, text('overview', 'Про компанію', 2))}
        {row('Слоган', null, line('tagline', 'Слоган'))}
        {row('Цінності', 'по одній в рядок', text('values', 'Цінності', 2))}
        <h3 style={{ marginTop: 10 }}>Комунікація</h3>
        {row('Тон', null, line('tone', 'Тон'))}
        {row('Заборонені слова', 'через кому', line('taboo_words', 'Заборонені слова'))}
        {row('Заборонені твердження', 'по одному в рядок', text('taboo_claims', 'Заборонені твердження', 2))}
        {row('Яких заголовків уникати', 'по одному в рядок', text('headline_avoid', 'Яких заголовків уникати', 2))}
        {row('Загальні правила', 'по одному в рядок', text('rules', 'Загальні правила', 3))}
      </div>
      <div className="wf-row">
        <button type="button" className="wf-btn p" disabled={busy || badHex} onClick={save}>Зберегти і підтвердити</button>
        <button type="button" className="wf-btn" disabled={busy} onClick={onCancel}>Скасувати</button>
      </div>
    </div>
  );
}
