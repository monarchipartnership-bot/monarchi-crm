import { LOOKS } from '../../../lib/creatives/realism';
import { MAX_VIDEOS, MEDIA_MODES } from '../../../lib/agents/creativeTeam';
import Select from '../../common/Select';
import '../../../styles/taskExtras.css';

// Everything a task is set up with BEFORE it starts (step 3.8, owner 2026-11-13: «почему я не могу при создании задания сразу выбрать…»): what it makes (pictures, videos or both and how many),
// the look of the words on the pictures, the style and realism, the limit of money. The same settings can still be changed later in the card of the task. The fields live in the same
// value object as the brief (value / onChange); `texts` and the own texts are in TaskBrief. extras for the money: the price of a picture and of a video are the prices measured on the live account.
export const PICTURE_USD = 0.22; // a studio picture (Higgsfield GPT Image, measured 13.11)
export const videoUsd = (seconds) => Math.round(Number(seconds || 5) * 0.0714 * 1.15 * 100) / 100; // Kling 3.0 Std, $0.0714 a second with a margin
export const AGENTS_USD = 0.25; // the agents of the chain (a few cents each), a rough average

const MEDIA_HINT = { photo: 'Лише картинки: найдешевше.', both: 'Картинки, а з перших готових ще й відео (стільки, скільки вкажете).', video: 'Лише відео: перші кадри теж створюються й коштують, вони лежать у результатах поруч з відео.' };
const ZONES = [['auto', 'за картинкою'], ['top', 'зверху'], ['center', 'по центру'], ['bottom', 'знизу'], ['left', 'зліва'], ['right', 'справа']];
const PLATES = [['auto', 'за картинкою'], ['on', 'є'], ['off', 'немає']];
const INKS = [['auto', 'за картинкою'], ['light', 'світлий'], ['dark', 'темний']];
const opts = (list) => list.map(([value, label]) => ({ value, label }));

// how many pictures the task makes: ideas (or given texts) × formats
export const picturesOf = (v) => (v.texts === 'given' && v.given_texts?.length ? v.given_texts.length : Number(v.count) || 1) * Math.max(1, v.ratios?.length || 1);

export default function TaskExtras({ value, onChange, teamLimit = null, regular = false }) {
  const pictures = picturesOf(value);
  const media = value.media || 'photo';
  const videos = media === 'photo' ? 0 : Math.min(Number(value.video_count) || 1, pictures, MAX_VIDEOS);
  const seconds = Number(value.video_seconds) || 5;
  const text = value.style?.text || {};
  const setText = (patch) => onChange({ style: { ...(value.style || {}), text: { ...text, ...patch } } });
  const pic = Math.round(pictures * PICTURE_USD * 100) / 100;
  const vid = Math.round(videos * videoUsd(seconds) * 100) / 100;
  const total = Math.round((pic + vid + AGENTS_USD) * 100) / 100;
  const limit = Number(String(value.limit || '').replace(',', '.')) || teamLimit || null;
  const over = limit && pic + vid > limit + 1e-9;
  return (
    <>
      <fieldset className="tm-fl tm-w2 tx-sec"><legend>Що створюємо</legend>
        <div className="tm-stance" role="radiogroup" aria-label="Що створюємо">
          {Object.entries(MEDIA_MODES).map(([k, label]) => (
            <label key={k} className={'tm-opt' + (media === k ? ' on' : '')}><input type="radio" name="tx-media" checked={media === k} onChange={() => onChange({ media: k })} /><span><b>{label}</b><small>{MEDIA_HINT[k]}</small></span></label>
          ))}
        </div>
        {media !== 'photo' && (
          <div className="tx-row">
            <label className="tm-fl"><span>Скільки відео</span>
              <Select className="tm-ssel tm-text" value={String(videos)} onChange={(v) => onChange({ video_count: v })} options={Array.from({ length: Math.min(pictures, MAX_VIDEOS) }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} ariaLabel="Скільки відео" /></label>
            <label className="tm-fl"><span>Тривалість</span>
              <Select className="tm-ssel tm-text" value={String(seconds)} onChange={(v) => onChange({ video_seconds: Number(v) })} options={[{ value: '5', label: '5 секунд' }, { value: '8', label: '8 секунд' }]} ariaLabel="Тривалість відео" /></label>
            <label className="tm-fl"><span>Звук</span>
              <Select className="tm-ssel tm-text" value={value.video_sound ? 'on' : 'off'} onChange={(v) => onChange({ video_sound: v === 'on' })} options={[{ value: 'off', label: 'без звуку' }, { value: 'on', label: 'зі звуком' }]} ariaLabel="Звук у відео" /></label>
            <label className="tm-fl tm-w2"><span>Що має рухатись у відео (необовʼязково)</span>
              <input className="tm-sel tm-text" type="text" maxLength={400} value={value.video_motion || ''} onChange={(e) => onChange({ video_motion: e.target.value })} placeholder="Наприклад: повільний наїзд камери. Якщо порожньо: спокійний наїзд без нових предметів." /></label>
          </div>
        )}
        <p className="tx-sum" role="status">
          Буде картинок: <b>{pictures}</b> ({value.texts === 'given' && value.given_texts?.length ? `${value.given_texts.length} ${value.given_texts.length === 1 ? 'текст' : 'тексти'}` : `${Number(value.count) || 1} ${Number(value.count) === 1 ? 'ідея' : 'ідеї'}`} × {value.ratios?.length || 1} {(value.ratios?.length || 1) === 1 ? 'формат' : 'формати'}){videos > 0 ? <> · відео: <b>{videos}</b> по {seconds} с</> : null}.
          {' '}Ціна ≈ <b>${total.toFixed(2)}</b> (картинки ≈ ${pic.toFixed(2)}{videos > 0 ? `, відео ≈ $${vid.toFixed(2)}` : ''}, агенти ≈ ${AGENTS_USD.toFixed(2)}){regular ? ' за кожен запуск' : ''}.
        </p>
        {over && <p className="vo-err" role="alert">Це більше за ліміт задачі (${limit}): частина картинок чи відео не буде створена. Збільште ліміт нижче.</p>}
      </fieldset>

      <details className="tm-fl tm-w2 tx-sec tx-more">
        <summary>Оформлення тексту на картинці й стиль <small>необовʼязково: за замовчуванням їх визначає розвідка за сайтом клієнта</small></summary>
        <div className="tx-row">
          <label className="tm-fl"><span>Де текст</span>
            <Select className="tm-ssel tm-text" value={text.zone || 'auto'} onChange={(v) => setText({ zone: v })} options={opts(ZONES)} ariaLabel="Де розташований текст" /></label>
          <label className="tm-fl"><span>Підкладка під текстом</span>
            <Select className="tm-ssel tm-text" value={text.plate || 'auto'} onChange={(v) => setText({ plate: v })} options={opts(PLATES)} ariaLabel="Підкладка під текстом" /></label>
          <label className="tm-fl"><span>Колір тексту</span>
            <Select className="tm-ssel tm-text" value={text.ink || 'auto'} onChange={(v) => setText({ ink: v })} options={opts(INKS)} ariaLabel="Колір тексту" /></label>
          <label className="tm-fl"><span>Реалізм картинок</span>
            <Select className="tm-ssel tm-text" value={value.look || 'std'} onChange={(v) => onChange({ look: v })} options={LOOKS.map((l) => ({ value: l.key, label: l.label }))} ariaLabel="Реалізм картинок" /></label>
          <label className="tm-fl tm-w2"><span>Тон картинок (необовʼязково)</span>
            <input className="tm-sel tm-text" type="text" maxLength={300} value={value.style?.image?.tone || ''} onChange={(e) => onChange({ style: { ...(value.style || {}), image: { ...(value.style?.image || {}), tone: e.target.value } } })} placeholder="Наприклад: теплі нейтральні тони, м’яке світло" /></label>
          <label className="tm-fl tm-w2"><span>Тон текстів (необовʼязково)</span>
            <input className="tm-sel tm-text" type="text" maxLength={300} value={value.style?.copy?.tone || ''} onChange={(e) => onChange({ style: { ...(value.style || {}), copy: { ...(value.style?.copy || {}), tone: e.target.value } } })} placeholder="Наприклад: спокійно, без вигуків" /></label>
        </div>
        <p className="tm-hint">Живий перегляд на картинці проєкту (подкладка, розмір, відступи) є в «Налаштуваннях» задачі після створення.</p>
      </details>

      <label className="tm-fl tx-limit"><span>Ліміт цієї задачі, $ <small>для картинок і відео; порожньо: {teamLimit ? `ліміт команди $${teamLimit}` : 'стандартний ліміт'}</small></span>
        <input className="tm-sel tm-text" type="text" inputMode="decimal" value={value.limit || ''} onChange={(e) => onChange({ limit: e.target.value })} placeholder={teamLimit ? String(teamLimit) : 'наприклад 2'} aria-label="Ліміт цієї задачі, $" /></label>
    </>
  );
}

// the values of this form become the brief of the task
export const extrasInitial = () => ({ media: 'photo', video_count: '1', video_seconds: 5, video_sound: false, video_motion: '', given_texts: [], style: {}, look: 'studio', limit: '' });
export function briefFromForm(v) {
  const brief = { goal: v.goal, count: Number(v.count), ratios: v.ratios, texts: v.texts, language: v.language, media: v.media, video_count: Number(v.video_count) || 1, video_seconds: v.video_seconds, video_sound: !!v.video_sound, video_motion: v.video_motion, given_texts: v.given_texts, style: v.style, look: v.look };
  const limit = String(v.limit || '').replace(',', '.').trim();
  if (limit && Number(limit) > 0) brief.agent_settings = { creative_maker: { max_usd: limit } };
  return brief;
}
