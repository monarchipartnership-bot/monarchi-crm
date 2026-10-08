import { Link } from 'react-router-dom';
import ProjectPicker from '../Projects/ProjectPicker';
import SlideView from './SlideView';
import ActionIcon from '../common/ActionIcon';
import { AlignButtons, ColorField, FontMenu, SizeField, StyleButtons, WeightSelect, keepFocus } from './TextControls';
import { slideTitle } from './Filmstrip';
import { MONTH_NAMES, computeWeeksForMonth, fmtDate, yearOptions } from '../../lib/dateHelpers';
import { FONT_BY_ID } from '../../lib/presentation/fonts';
import { PLATFORMS, STYLES, sampleSlide, typeInfo, platformName } from '../../lib/presentation/deckModel';
import { canHaveImage, tableInfo } from '../../lib/presentation/deckOps';
import { useRef, useState } from 'react';
import { readSlideImage } from '../../lib/presentation/imageFile';
import { MIXED, plain, text } from '../../lib/presentation/textModel';
import Select from '../common/Select';

const STATUS = { draft: 'Чернетка', reviewed: 'Перевірено', final: 'Фінал' };

// ----- Дані ---------------------------------------------------------------------------------
export function DataPanel({ sel, setSel, report, reportState, platforms, deck, hasDeck, building, message, onBuild, onClient, onPeriod, onLang }) {
  const weeks = computeWeeksForMonth(sel.year, sel.month);
  const lang = deck?.meta.lang || sel.lang;
  return (
    <div className="pb-panel">
      <h2>Дані звіту</h2>
      <ProjectPicker value={sel.projectId} onChange={(id) => setSel({ ...sel, projectId: id })} />

      <div className="pb-row2">
        <div className="pk-field">
          <label>Тип звіту</label>
          <Select value={sel.periodType} onChange={(v) => setSel({ ...sel, periodType: v })} ariaLabel="Тип звіту" options={[{ value: 'weekly', label: 'Тижневий' }, { value: 'monthly', label: 'Місячний' }]} />
        </div>
        <div className="pk-field">
          <label>Платформа</label>
          <Select value={sel.platform} ariaLabel="Платформа"
            onChange={(v) => { if (!platforms || platforms.includes(v)) setSel({ ...sel, platform: v }); }}
            options={PLATFORMS.map((p) => ({ value: p.id, label: p.name + (platforms && !platforms.includes(p.id) ? ' (немає у звіті)' : '') }))} />
        </div>
      </div>

      <div className="pk-field">
        <label>Період</label>
        <div className="pb-row2">
          <Select ariaLabel="Рік" value={sel.year} onChange={(v) => setSel({ ...sel, year: v })} options={yearOptions().map((y) => ({ value: y, label: String(y) }))} />
          <Select ariaLabel="Місяць" value={sel.month} onChange={(v) => setSel({ ...sel, month: v })} options={MONTH_NAMES.map((n, i) => ({ value: i + 1, label: n }))} />
        </div>
        {sel.periodType === 'weekly' && (
          <Select ariaLabel="Тиждень" value={Math.min(sel.weekIndex, weeks.length)} onChange={(v) => setSel({ ...sel, weekIndex: v })} style={{ marginTop: 8 }}
            options={weeks.map((w) => ({ value: w.index, label: `Тиждень ${w.index} (${fmtDate(w.start.getFullYear(), w.start.getMonth() + 1, w.start.getDate())}–${fmtDate(w.end.getFullYear(), w.end.getMonth() + 1, w.end.getDate())})` }))} />
        )}
      </div>

      <div className="pk-field">
        <label>Мова слайдів</label>
        <Select value={lang} onChange={onLang} ariaLabel="Мова слайдів" options={[{ value: 'en', label: 'English (для клієнта)' }, { value: 'uk', label: 'Українська' }]} />
        {hasDeck && <span className="pacc-hint">Мова застосовується при створенні презентації зі звіту.</span>}
      </div>

      <div className="pb-source">
        <div className="pb-source-title"><ActionIcon name="data" size={18} /> Джерело даних: звіт проєкту</div>
        {reportState === 'loading' && <div className="pacc-hint">Шукаємо збережений звіт…</div>}
        {reportState === 'none' && sel.projectId && (
          <div className="pacc-hint">За цей період звіту ще немає. <Link to={sel.periodType === 'weekly' ? '/projects/reports/weekly' : '/projects/reports/monthly'}>Створіть і збережіть звіт</Link>, і презентація збереться з нього.</div>
        )}
        {reportState === 'ready' && report && (
          <div className="pacc-hint">Звіт збережено · {STATUS[report.status] || report.status} · {new Date(report.updated_at).toLocaleString('uk-UA')}{platforms && !platforms.includes(sel.platform) ? ` · у звіті немає даних ${platformName(sel.platform)}` : ''}</div>
        )}
        <button type="button" className="btn btn-p pb-wide" disabled={reportState !== 'ready' || building || (platforms && !platforms.includes(sel.platform))} onClick={onBuild}>
          <ActionIcon name="import" size={18} /> {building ? 'Створюємо…' : hasDeck ? 'Підтягнути зі звіту знову' : 'Створити презентацію зі звіту'}
        </button>
        {hasDeck && <span className="pacc-hint">Повторне підтягування замінить усі слайди; ви побачите підтвердження.</span>}
      </div>
      {message && <div className="pacc-hint">{message}</div>}

      {hasDeck && (
        <div className="pb-shared">
          <h3>Текст на слайдах</h3>
          <div className="pk-field">
            <label>Назва клієнта</label>
            <input type="text" value={plain(deck.meta.client)} onChange={(e) => onClient(e.target.value)} />
          </div>
          <div className="pk-field">
            <label>Період звіту</label>
            <input type="text" value={plain(deck.meta.period)} onChange={(e) => onPeriod(e.target.value)} />
          </div>
          <span className="pacc-hint">Ці два поля спільні: зміна тут або на титульному слайді оновлює їх у всій презентації.</span>
        </div>
      )}
    </div>
  );
}

// ----- Дизайн ---------------------------------------------------------------------------------
export function DesignPanel({ deck, onStyle }) {
  return (
    <div className="pb-panel">
      <h2>Стиль презентації</h2>
      <p className="pacc-hint">Стиль змінює фон, заголовки й оформлення всіх слайдів. Вручну змінений текст зберігається.</p>
      <div className="pb-styles" role="radiogroup" aria-label="Стиль">
        {STYLES.map((s) => {
          const demo = { ...deck, meta: { ...deck.meta, style: s.id, client: text(''), period: text('') } };
          const slide = sampleSlide('section', deck.meta.lang);
          slide.data.heading = text(s.name);
          slide.data.body = text('');
          return (
            <button key={s.id} type="button" role="radio" aria-checked={deck.meta.style === s.id} className={'pb-style' + (deck.meta.style === s.id ? ' on' : '')} onClick={() => onStyle(s.id)}>
              <span className="pb-style-view"><span style={{ transform: 'scale(.1167)', transformOrigin: '0 0', width: 960, height: 540, display: 'block', pointerEvents: 'none' }}><SlideView slide={slide} deck={demo} pageNo={0} /></span></span>
              <span className="pb-style-text"><b>{s.name}</b><small>{s.desc}</small></span>
              {deck.meta.style === s.id && <ActionIcon name="select" size={18} />}
            </button>
          );
        })}
      </div>
      <div className="pb-source"><div className="pb-source-title">Платформа: {platformName(deck.meta.platform)}</div><span className="pacc-hint">Фон обкладинки залежить від платформи презентації. Її обирають у режимі «Дані».</span></div>
    </div>
  );
}

// ----- Слайди (nothing selected) --------------------------------------------------------------------
export function SlidePanel({ slide, index, total, onAdd, onHide, onDuplicate, onRemove, tableCmd, onImage }) {
  const tbl = tableInfo(slide);
  const fileRef = useRef(null);
  const [imgErr, setImgErr] = useState('');
  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { setImgErr(''); onImage(await readSlideImage(file)); } catch (err) { setImgErr(err.message || 'Не вдалося прочитати зображення.'); }
  }
  return (
    <div className="pb-panel">
      <h2>Слайд {index + 1}</h2>
      <div className="pb-source">
        <div className="pb-source-title">{typeInfo(slide.type).name}</div>
        <span className="pacc-hint">{slideTitle(slide)}</span>
      </div>
      {tbl && (
        <div className="pb-source">
          <div className="pb-source-title">{tbl.label ? `Кількість ${tbl.label}: ${tbl.rows}` : `Таблиця: ${tbl.rows} рядків${tbl.canCols ? `, ${tbl.cols} стовпців` : ''}`}</div>
          <div className="pb-btnrow">
            <button type="button" className="btn" onClick={() => tableCmd('addRow')}><ActionIcon name="create" size={16} /> {tbl.label ? 'Додати' : 'Рядок'}</button>
            <button type="button" className="btn" disabled={tbl.rows <= 1} onClick={() => tableCmd('removeRow')}><ActionIcon name="delete" size={16} /> {tbl.label ? 'Прибрати останнє' : 'Рядок'}</button>
            {tbl.canCols && <button type="button" className="btn" onClick={() => tableCmd('addCol')}><ActionIcon name="create" size={16} /> Стовпець</button>}
            {tbl.canCols && <button type="button" className="btn" disabled={tbl.cols <= 1} onClick={() => tableCmd('removeCol')}><ActionIcon name="delete" size={16} /> Стовпець</button>}
          </div>
          <span className="pacc-hint">Числа й підписи в комірках редагуються прямо на слайді.</span>
        </div>
      )}
      {canHaveImage(slide) && (
        <div className="pb-source">
          <div className="pb-source-title"><ActionIcon name="upload" size={18} /> Зображення</div>
          {slide.image?.src && <img className="pb-imgprev" src={slide.image.src} alt="Зображення на слайді" />}
          <div className="pb-btnrow">
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>{slide.image?.src ? 'Замінити' : 'Додати зображення'}</button>
            {slide.image?.src && <button type="button" className="btn" onClick={() => onImage(null)}><ActionIcon name="delete" size={16} /> Прибрати</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} />
          {imgErr && <span className="pacc-err">{imgErr}</span>}
          <span className="pacc-hint">Логотип клієнта або знімок екрана (PNG, JPEG, WebP). Зображення стискається й зберігається разом із презентацією.</span>
        </div>
      )}
      <div className="pb-btnrow col">
        <button type="button" className="btn btn-p" onClick={onAdd}><ActionIcon name="create" size={18} /> Додати готовий слайд</button>
        <button type="button" className="btn" onClick={onHide}><ActionIcon name="visibility" size={16} /> {slide.hidden ? 'Показати слайд' : 'Приховати слайд'}</button>
        <button type="button" className="btn" onClick={onDuplicate}><ActionIcon name="copy" size={16} /> Дублювати</button>
        <button type="button" className="btn" disabled={total <= 1} onClick={onRemove}><ActionIcon name="delete" size={16} /> Видалити слайд</button>
      </div>
      <p className="pacc-hint">Натисніть текст на слайді, щоб змінити шрифт, розмір, насиченість, колір і вирівнювання.</p>
    </div>
  );
}

// ----- Текст (a text block is selected) ----------------------------------------------------------------
const LH = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2];

export function TextPanel({ info, cmds, onClose }) {
  const { style } = info;
  const fontId = style.f === MIXED ? null : style.f;
  const italicDisabled = fontId ? !FONT_BY_ID[fontId]?.italic : false;
  return (
    <div className="pb-panel" data-floating>
      <div className="pb-panel-head">
        <h2>Текст</h2>
        <button type="button" className="pb-iconbtn" onMouseDown={keepFocus} onClick={onClose} aria-label="Закрити панель тексту" title="Закрити"><ActionIcon name="close" size={18} /></button>
      </div>

      <label className="pb-label">Шрифт</label>
      <FontMenu value={style.f} onChange={cmds.font} />
      {fontId && !FONT_BY_ID[fontId]?.italic && <span className="pacc-hint">У цього шрифту немає курсиву, тож кнопка I вимкнена.</span>}

      <div className="pb-row2">
        <div><label className="pb-label">Розмір</label><SizeField value={style.s} onChange={cmds.size} /></div>
        <div><label className="pb-label">Насиченість</label><WeightSelect fontId={style.f} value={style.w} onChange={cmds.weight} /></div>
      </div>

      <div className="pb-row2">
        <div>
          <label className="pb-label">Стиль</label>
          <StyleButtons bold={style.w === MIXED ? MIXED : style.w >= 600} italic={style.i} underline={style.u} italicDisabled={italicDisabled} onBold={cmds.bold} onItalic={cmds.italic} onUnderline={cmds.underline} />
        </div>
        <div><label className="pb-label">Вирівнювання</label><AlignButtons value={style.align === MIXED ? null : style.align} onChange={cmds.align} /></div>
      </div>

      <label className="pb-label">Колір тексту</label>
      <ColorField value={style.c} onChange={cmds.color} />

      <div className="pb-row2">
        <div>
          <label className="pb-label" htmlFor="pb-lh">Міжрядковий інтервал</label>
          <Select ariaLabel="Міжрядковий інтервал" value={style.lh === MIXED ? '' : Number(style.lh)} onChange={(v) => { if (v !== '') cmds.lineHeight(Number(v)); }}
            options={[
              ...(style.lh === MIXED ? [{ value: '', label: 'Змішано' }] : []),
              ...(!LH.includes(style.lh) && style.lh !== MIXED ? [{ value: Number(style.lh), label: String(style.lh) }] : []),
              ...LH.map((v) => ({ value: Number(v), label: String(v) })),
            ]} />
        </div>
        <div>
          <label className="pb-label" htmlFor="pb-ls">Міжсимвольний інтервал</label>
          <Select ariaLabel="Міжсимвольний інтервал" value={style.ls === MIXED ? '' : Number(style.ls)} onChange={(v) => { if (v !== '') cmds.spacing(Number(v)); }}
            options={[
              ...(style.ls === MIXED ? [{ value: '', label: 'Змішано' }] : []),
              ...[-1, -0.5, 0, 0.5, 1, 2, 3, 4, 5].map((v) => ({ value: v, label: `${v} px` })),
              ...(style.ls !== MIXED && ![-1, -0.5, 0, 0.5, 1, 2, 3, 4, 5].includes(style.ls) ? [{ value: Number(style.ls), label: `${style.ls} px` }] : []),
            ]} />
        </div>
      </div>

      {info.canList && (
        <>
          <label className="pb-label">Списки</label>
          <span className="pb-group">
            <button type="button" className={'pb-iconbtn' + (style.list === 'bullet' ? ' on' : '')} aria-pressed={style.list === 'bullet'} aria-label="Маркований список" title="Маркований список" onMouseDown={keepFocus} onClick={() => cmds.list('bullet')}><ActionIcon name="list-bullets" size={18} /></button>
            <button type="button" className={'pb-iconbtn' + (style.list === 'number' ? ' on' : '')} aria-pressed={style.list === 'number'} aria-label="Нумерований список" title="Нумерований список" onMouseDown={keepFocus} onClick={() => cmds.list('number')}><ActionIcon name="list-numbered" size={18} /></button>
          </span>
        </>
      )}

      <button type="button" className="btn pb-wide" onMouseDown={keepFocus} onClick={cmds.reset}><ActionIcon name="regenerate" size={16} /> Скинути форматування</button>
      <p className="pacc-hint">Без виділення зміни стосуються всього блока, з виділенням — лише виділеного фрагмента. Скидання повертає вигляд зі стилю презентації.</p>
    </div>
  );
}

// ----- Комірка (a table / metric cell is selected) ----------------------------------------------------
// Cells hold plain text, so formatting applies to the whole cell (or to every cell of the slide).
export function CellPanel({ style, cmds, onClose }) {
  const [all, setAll] = useState(false);
  const italicDisabled = !FONT_BY_ID[style.f]?.italic;
  return (
    <div className="pb-panel" data-floating>
      <div className="pb-panel-head">
        <h2>Комірка</h2>
        <button type="button" className="pb-iconbtn" onMouseDown={keepFocus} onClick={onClose} aria-label="Закрити панель комірки" title="Закрити"><ActionIcon name="close" size={18} /></button>
      </div>
      <div className="pb-scope" role="radiogroup" aria-label="До чого застосувати">
        <button type="button" role="radio" aria-checked={!all} className={'prep-chipbtn' + (!all ? ' on' : '')} onMouseDown={keepFocus} onClick={() => setAll(false)}>Ця комірка</button>
        <button type="button" role="radio" aria-checked={all} className={'prep-chipbtn' + (all ? ' on' : '')} onMouseDown={keepFocus} onClick={() => setAll(true)}>Усі комірки слайда</button>
      </div>

      <label className="pb-label">Шрифт</label>
      <FontMenu value={style.f} onChange={(v) => cmds.font(v, all)} />
      <div className="pb-row2">
        <div><label className="pb-label">Розмір</label><SizeField value={style.s} onChange={(v) => cmds.size(v, all)} /></div>
        <div><label className="pb-label">Насиченість</label><WeightSelect fontId={style.f} value={style.w} onChange={(v) => cmds.weight(v, all)} /></div>
      </div>
      <div className="pb-row2">
        <div>
          <label className="pb-label">Стиль</label>
          <StyleButtons bold={style.w >= 600} italic={style.i} underline={style.u} italicDisabled={italicDisabled} onBold={() => cmds.bold(all)} onItalic={() => cmds.italic(all)} onUnderline={() => cmds.underline(all)} />
        </div>
        <div><label className="pb-label">Вирівнювання</label><AlignButtons value={style.align} onChange={(v) => cmds.align(v, all)} /></div>
      </div>
      <label className="pb-label">Колір тексту</label>
      <ColorField value={style.c} onChange={(v) => cmds.color(v, all)} />
      <button type="button" className="btn pb-wide" onMouseDown={keepFocus} onClick={() => cmds.reset(all)}><ActionIcon name="regenerate" size={16} /> Скинути форматування</button>
      <p className="pacc-hint">Числа й підписи змінюються лише на слайді. Тут змінюється вигляд: шрифт, розмір, колір.</p>
    </div>
  );
}
