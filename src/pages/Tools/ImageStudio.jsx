import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import ActionIcon from '../../components/common/ActionIcon';
import { logActivity } from '../../lib/api/activityLog';
import CoverStage from './studio/CoverStage';
import { exportCover } from './studio/exportCover';
import {
  COLOR_KEYS, PRESETS, SIZE_LABELS, SIZE_RANGE, TYPES,
} from './studio/model';
import { TEMPLATE_BY_ID, templatesOf } from './studio/templates';
import useStudio from './studio/useStudio';
import CasesPanel from './studio/panel/CasesPanel';
import ColorField from './studio/panel/ColorField';
import ImageSlot from './studio/panel/ImageSlot';
import TagsEditor from './studio/panel/TagsEditor';
import '../../styles/imageStudioPage.css';
import '../../styles/studioPanel.css';

// Image Studio: upload-ready Upwork covers (Project Catalog / Portfolio · Web /
// Portfolio · Mobile). Every cover is plain HTML/CSS laid out in a fixed
// 1000x750 block, scaled for the preview/thumbnails and exported straight
// from the same DOM (see ./studio). The panel on the left edits the state in
// ./studio/useStudio.js, which autosaves to localStorage.
const STATUS_TEXT = {
  idle: 'Автозбереження у браузері',
  saved: 'Збережено у браузері',
  error: 'Не вдалося зберегти у браузері',
};

const sameColors = (a, b) => Object.keys(a).every((k) => a[k] === b[k]);

export default function ImageStudio() {
  const navigate = useNavigate();
  const { email } = useAuth();
  const { state, status, actions, cases, saveCase, deleteCase } = useStudio();
  const coverRef = useRef(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const list = templatesOf(state.type);
  const tpl = TEMPLATE_BY_ID[state.templates[state.type]] || list[0];
  const typeName = TYPES.find((t) => t.id === state.type)?.nm;
  const has = (f) => tpl.fields.includes(f);
  const c = state.content;
  const text = (key) => (e) => actions.patchContent({ [key]: e.target.value });
  const cover = { template: tpl.id, c, colors: state.colors, images: state.images, sizes: state.sizes };

  async function doExport(type) {
    if (!coverRef.current || busy) return;
    setBusy(true);
    try {
      const url = await exportCover(coverRef.current, type);
      setResult({ url, name: `monarchi-${tpl.id}.${type === 'jpeg' ? 'jpg' : 'png'}` });
      logActivity('image_studio', 'export', { format: state.type, template: tpl.id, type }, email);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio-page">
      <div id="app" className="studio-shell">
        <div className="studio-grid">
          <aside className="studio-inspector" aria-label="Параметри обкладинки">
            <div className="si-scroll">
              <section className="si-section" aria-labelledby="si-h-type">
                <h2 className="si-h" id="si-h-type">Тип обкладинки</h2>
                <div className="type-grid" role="group" aria-labelledby="si-h-type">
                  {TYPES.map((t) => (
                    <button type="button" key={t.id} className={'fmt-btn' + (state.type === t.id ? ' on' : '')} aria-pressed={state.type === t.id} onClick={() => actions.setType(t.id)}>
                      <span className="fmt-dot" aria-hidden="true" />
                      <span className="fmt-nm">{t.nm}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="si-section" aria-labelledby="si-h-template">
                <h2 className="si-h" id="si-h-template">Шаблон</h2>
                <div className="cards" role="group" aria-labelledby="si-h-template">
                  {list.map((t) => (
                    <button type="button" key={t.id} className={'card' + (t.id === tpl.id ? ' on' : '')} aria-pressed={t.id === tpl.id} onClick={() => actions.setTemplate(t.id)}>
                      <span className="sw"><CoverStage {...cover} template={t.id} /></span>
                      <span className="nm">{t.nm}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="si-section" aria-labelledby="si-h-palette">
                <h2 className="si-h" id="si-h-palette">Палітра</h2>
                <div className="presets" role="group" aria-labelledby="si-h-palette">
                  {Object.entries(PRESETS).map(([k, p]) => {
                    const on = sameColors(p, state.colors);
                    const nm = k.charAt(0).toUpperCase() + k.slice(1);
                    return (
                      <button type="button" key={k} className={'preset' + (on ? ' on' : '')} aria-pressed={on} aria-label={`Палітра ${nm}`} onClick={() => actions.setColors(p)}>
                        <span className="pre-sw" style={{ background: `linear-gradient(135deg,${p.bgA},${p.bgB} 55%,${p.mag})` }} />
                        <span className="pre-nm">{nm}</span>
                      </button>
                    );
                  })}
                </div>
                <button type="button" className="si-link" onClick={actions.resetColors} hidden={sameColors(PRESETS.royal, state.colors)}>
                  <ActionIcon name="regenerate" size={14} />Скинути кольори до стандартних
                </button>
              </section>

              <section className="si-section" aria-labelledby="si-h-colors">
                <h2 className="si-h" id="si-h-colors">Кольори</h2>
                <div className="color-grid">
                  {COLOR_KEYS.map((k) => (
                    <ColorField key={k.key} id={`col-${k.key}`} label={k.label} value={state.colors[k.key]} onChange={(v) => actions.setColor(k.key, v)} />
                  ))}
                </div>
              </section>

              <section className="si-section" aria-labelledby="si-h-text">
                <h2 className="si-h" id="si-h-text">Текстовий контент</h2>
                {has('kicker') && (
                  <div className="si-field"><label htmlFor="f-kicker">Кікер (маленький тег)</label><input id="f-kicker" className="field" maxLength={42} value={c.kicker} onChange={text('kicker')} /></div>
                )}
                {has('title') && (
                  <div className="si-field"><label htmlFor="f-title">Заголовок</label><input id="f-title" className="field" maxLength={90} value={c.title} onChange={text('title')} /></div>
                )}
                {has('accent') && (
                  <div className="si-field"><label htmlFor="f-accent">Заголовок (акцентом)</label><input id="f-accent" className="field" maxLength={90} value={c.accent} onChange={text('accent')} /></div>
                )}
                {has('subtitle') && (
                  <div className="si-field"><label htmlFor="f-sub">Підзаголовок</label><textarea id="f-sub" className="field" rows={3} maxLength={170} value={c.subtitle} onChange={text('subtitle')} /></div>
                )}
                {has('url') && (
                  <div className="si-field"><label htmlFor="f-url">Адреса в рядку браузера</label><input id="f-url" className="field" maxLength={60} value={c.url} onChange={text('url')} /></div>
                )}
                <p className="si-note">Порожнє поле зникає з обкладинки.</p>
              </section>

              {has('metrics') && (
                <section className="si-section" aria-labelledby="si-h-metrics">
                  <h2 className="si-h" id="si-h-metrics">Ключові показники <span className="si-hint">порожнє значення — прихований</span></h2>
                  {c.metrics.map((m, i) => (
                    <div className="mrow" role="group" aria-label={`Показник ${i + 1}`} key={i}>
                      <input className="field sm" maxLength={12} aria-label={`Показник ${i + 1}: значення`} value={m.v} onChange={(e) => actions.setMetric(i, 'v', e.target.value)} />
                      <input className="field" maxLength={40} aria-label={`Показник ${i + 1}: підпис`} value={m.l} onChange={(e) => actions.setMetric(i, 'l', e.target.value)} />
                    </div>
                  ))}
                </section>
              )}

              {has('tags') && (
                <section className="si-section" aria-labelledby="si-h-tags">
                  <h2 className="si-h" id="si-h-tags">Технології та теги</h2>
                  <TagsEditor tags={c.tags} max={tpl.tagsMax || 6} onAdd={actions.addTag} onChange={actions.setTag} onRemove={actions.removeTag} />
                </section>
              )}

              <section className="si-section" aria-labelledby="si-h-sizes">
                <h2 className="si-h" id="si-h-sizes">Розмір тексту</h2>
                {tpl.sizes.map((k) => (
                  <div className="size-row" key={k}>
                    <label htmlFor={`sz-${k}`}>{SIZE_LABELS[k]}</label>
                    <input id={`sz-${k}`} type="range" min={SIZE_RANGE.min} max={SIZE_RANGE.max} step={SIZE_RANGE.step} value={state.sizes[k]} onChange={(e) => actions.setSize(k, Number(e.target.value))} />
                    <output htmlFor={`sz-${k}`}>{state.sizes[k]}%</output>
                  </div>
                ))}
                <button type="button" className="si-link" onClick={actions.resetSizes}><ActionIcon name="regenerate" size={14} />Скинути розміри</button>
                <p className="si-note">100% — як задумано в шаблоні.</p>
              </section>

              <section className="si-section" aria-labelledby="si-h-images">
                <h2 className="si-h" id="si-h-images">Зображення</h2>
                <div className={tpl.images.length > 2 ? 'img-grid' : undefined}>
                  {tpl.images.map((im) => (
                    <ImageSlot
                      key={im.key}
                      id={`img-${im.key}`}
                      label={im.label}
                      hint={im.hint}
                      compact={tpl.images.length > 2}
                      value={state.images[im.key]}
                      onChange={(d) => actions.setImage(im.key, d)}
                    />
                  ))}
                </div>
              </section>

              <section className="si-section" aria-labelledby="si-h-cases">
                <h2 className="si-h" id="si-h-cases">Мої кейси</h2>
                <CasesPanel cases={cases} onSave={(name) => saveCase(name, c)} onApply={actions.applyContent} onDelete={deleteCase} />
              </section>
            </div>

            <div className="si-foot">
              <button type="button" className="si-btn si-btn--soft" onClick={actions.resetAll}>
                <ActionIcon name="regenerate" size={18} />Скинути до стандартних
              </button>
              <p className={'si-status' + (status === 'error' ? ' is-error' : '')} role="status" aria-live="polite">{STATUS_TEXT[status]}</p>
            </div>
          </aside>

          <section className="studio-main" aria-label="Попередній перегляд">
            <div className="studio-toolbar">
              <button type="button" className="si-btn si-btn--soft" onClick={() => navigate(-1)}>
                <ActionIcon name="back" size={18} />Назад
              </button>
              <span className="meta-line">1000 × 750 · {typeName} · {tpl.nm}</span>
              <button type="button" className="si-btn si-btn--primary" onClick={() => doExport('png')} disabled={busy} aria-label="Завантажити PNG">
                <ActionIcon name="download" size={18} /><span><span className="si-verb">Завантажити </span>PNG</span>
              </button>
              <button type="button" className="si-btn si-btn--primary" onClick={() => doExport('jpeg')} disabled={busy} aria-label="Завантажити JPEG">
                <ActionIcon name="download" size={18} /><span><span className="si-verb">Завантажити </span>JPEG</span>
              </button>
            </div>
            <div className="stage">
              <div className="stage-cover">
                <CoverStage coverRef={coverRef} {...cover} />
              </div>
            </div>
          </section>
        </div>

        {result && (
          <div className="ov" role="dialog" aria-modal="true" aria-label={'Експорт: ' + result.name} onClick={(e) => e.target === e.currentTarget && setResult(null)}>
            <div className="ovbox">
              <div className="ovtop">
                <b>{result.name}</b>
                <button type="button" className="ovx" aria-label="Закрити" onClick={() => setResult(null)}>✕</button>
              </div>
              <img src={result.url} alt="Експорт" />
              <div className="ovrow">
                <a className="btn btn-p" href={result.url} download={result.name}>Завантажити</a>
                <a className="btn" href={result.url} target="_blank" rel="noopener">Відкрити в новій вкладці</a>
                <span className="ovhint">Якщо завантаження не почалось, відкрийте в новій вкладці або клікніть правою кнопкою на зображенні → Зберегти зображення як…</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
