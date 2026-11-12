import { useState } from 'react';
import { Ic, Spinner } from './parts';
import { fmtAgo, fmtUsd } from './format';
import LiveSteps from './LiveSteps';
import StyleEditor from './StyleEditor';
import { styleRows } from '../../../lib/agents/projectStyle';
import '../../../styles/stepDetails.css';

const STATE = {
  running: { label: 'вивчає', cls: 'is-work' }, refreshing: { label: 'оновлює', cls: 'is-work' }, ready: { label: 'готово', cls: 'is-ok' },
  partial: { label: 'неповний', cls: 'is-warn' }, failed: { label: 'не вдалося', cls: 'is-bad' }, none: { label: 'ще не запускалась', cls: '' },
};

// «Розвідка клієнта» (owner, 2026-11-12): what the scout learned about the client before the first creative: the site (products, tone, look), the ads that already ran, the product photos
// taken from the site (the maker uses them as references by itself). The agents read this profile; the manager sees it, and can make it again.
//   intel: cockpit.intel (or null)   steps: the live lines of the scout   busy   onRefresh(): starts the scout (the page asks first, it costs about $0.3-0.6)
export default function IntelCard({ intel, steps = [], busy = false, onRefresh, samples = [], onSaveStyle }) {
  const [open, setOpen] = useState(false);
  const [styling, setStyling] = useState(false);
  const [photo, setPhoto] = useState(null);
  const st = STATE[intel?.status || 'none'];
  const working = ['running', 'refreshing'].includes(intel?.status);
  const has = intel && ['ready', 'partial', 'refreshing'].includes(intel.status) && (intel.summary || intel.products?.length);
  return (
    <section className="ckp-box sd-intel" aria-label="Розвідка клієнта">
      <div className="ckp-sec-h">
        <h3>Розвідка клієнта</h3>
        <span className={'ckp-chip ' + st.cls}>{st.label}</span>
        {intel?.updatedAt && !working && <span className="opv-date">оновлено {fmtAgo(intel.updatedAt) || '—'}{intel.costUsd ? ` · ${fmtUsd(intel.costUsd)}` : ''}</span>}
      </div>
      {!intel && <p className="sd-note">Агент-розвідник ще не вивчав цього клієнта. Він читає сайт (товари, ціни, тон, фото) і найкращі реклами з кабінету Meta, щоб креативи й тексти відповідали справжнім товарам. Запускається разом із командою або кнопкою нижче.</p>}
      {working && <p className="sd-note" role="status">Агент вивчає сайт і кабінет клієнта: кроки видно нижче.{intel?.status === 'running' ? ' Перше завдання почнеться, коли профіль буде готовий.' : ' Поточний профіль діє, поки не буде готовий новий.'}</p>}
      {intel?.status === 'failed' && <p className="sd-note is-bad">Не вдалося вивчити клієнта{intel.gaps?.length ? `: ${intel.gaps[0]}` : ''} Агенти працюватимуть за карткою проєкту.</p>}
      {has && (
        <>
          <p className="sd-intel-sum">{intel.summary}</p>
          {intel.line && <p className="sd-note">Знайшов: {intel.line}.</p>}
          {intel.photos?.length > 0 && (
            <ul className="sd-photos" aria-label="Фото з сайту, які креативщик використовує як референси">
              {intel.photos.map((p) => (
                <li key={p.url}><button type="button" onClick={() => setPhoto(p)} aria-label={`Збільшити: ${p.label || 'фото'}`}><img src={p.url} alt={p.label || 'Фото з сайту'} loading="lazy" /></button></li>
              ))}
            </ul>
          )}
          {photo && (
            <div className="sd-photo-big" role="dialog" aria-label={photo.label || 'Фото'}>
              <img src={photo.url} alt={photo.label || ''} /><div><span>{photo.label}{photo.use === 'logo' ? ' (логотип)' : ''}</span><button type="button" className="sd-more" onClick={() => setPhoto(null)}>Закрити</button></div>
            </div>
          )}
          <button type="button" className="sd-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? 'Сховати профіль' : 'Показати профіль повністю'}</button>
          {onSaveStyle && (
            <>
              <button type="button" className="sd-more" aria-expanded={styling} onClick={() => setStyling((v) => !v)}>{styling ? 'Сховати оформлення тексту' : 'Змінити оформлення тексту на креативах'}</button>
              {styling && <StyleEditor autoStyle={intel.autoStyle} manual={intel.styleManual} samples={samples} onSave={onSaveStyle} />}
            </>
          )}
          {open && (
            <dl className="sd-rows sd-profile">
              {intel.business && <div><dt>Бізнес</dt><dd>{intel.business}</dd></div>}
              {intel.categories?.length > 0 && <div><dt>Категорії</dt><dd>{intel.categories.join(', ')}</dd></div>}
              {intel.products?.length > 0 && <div><dt>Товари</dt><dd>{intel.products.slice(0, 12).map((p) => `${p.name}${p.price ? ` (${p.price})` : ''}`).join('; ')}</dd></div>}
              {intel.priceRange && <div><dt>Ціни</dt><dd>{intel.priceRange}</dd></div>}
              {intel.tone && <div><dt>Тон</dt><dd>{intel.tone}</dd></div>}
              {intel.visualStyle && <div><dt>Оформлення</dt><dd>{intel.visualStyle}</dd></div>}
              {intel.ads?.worked?.length > 0 && <div><dt>Що працювало в рекламі</dt><dd>{intel.ads.worked.join('; ')}</dd></div>}
              {intel.ads?.avoid?.length > 0 && <div><dt>Чого уникати</dt><dd>{intel.ads.avoid.join('; ')}</dd></div>}
              {styleRows(intel.style).map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}<span className="sd-note"> · {r.source === 'manual' ? 'виставив менеджер' : 'вирішила розвідка'}</span></dd></div>)}
              {intel.gaps?.length > 0 && <div><dt>Не вдалося дізнатись</dt><dd>{intel.gaps.join(' ')}</dd></div>}
            </dl>
          )}
        </>
      )}
      <div className="sd-acts">
        <button type="button" className="ckp-btn" disabled={busy || working} onClick={onRefresh}>{busy ? <Spinner /> : <Ic n="refresh" size={15} />}{intel && has ? 'Оновити' : 'Вивчити клієнта'}</button>
        {intel?.status === 'ready' && <small className="sd-note">Профіль оновлюється сам раз на 30 днів. Кнопка робить це зараз.</small>}
      </div>
      <LiveSteps steps={steps} working={working} limit={working ? 12 : 6} title="Кроки розвідника" />
    </section>
  );
}
