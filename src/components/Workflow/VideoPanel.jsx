import { useMemo, useState } from 'react';
import { requestRun } from '../../lib/api/workflow';
import { AUDIO, MOTIONS, QUALITY, RESOLUTIONS, VIDEO_MONTHLY_MAX, videosThisMonth } from '../../../api/_lib/wf/skills/videoEngine.js';
import { LANGS } from '../../../api/_lib/wf/skills/variationsEngine.js';
import Select from '../common/Select';

const STATUS = { planned: 'заплановано', producing: 'генерується', ready: 'готово', failed: 'не вдалося' };

// «Відео з готових креативів» (Zeely item 5): a short vertical video from the picture of a ready creative (the picture is the first frame, so the product stays recognisable).
// At most 3 videos a project a month; the price is asked from Higgsfield before each video and must fit the money limit of the project. A video is made by the Creator within minutes:
// «Забрати готові відео» picks up the ones that were still being made. While an agent proposal waits in the section, a new request would be built on the old text, so the panel waits.
export default function VideoPanel({ projectId, email, items = [], videos = [], proposals = 0, onRequested }) {
  const cards = useMemo(() => items.filter((c) => c.status === 'ready' && /^https:\/\//i.test(c.image_url || '')), [items]);
  const used = videosThisMonth(videos, new Date());
  const left = Math.max(0, VIDEO_MONTHLY_MAX - used);
  const [picked, setPicked] = useState([]);
  const [duration, setDuration] = useState(10);
  const [resolution, setResolution] = useState('720p');
  const [quality, setQuality] = useState('fast');
  const [audio, setAudio] = useState('silent');
  const [language, setLanguage] = useState('uk');
  const [motion, setMotion] = useState('push_in');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const producing = videos.some((v) => v.status === 'producing');
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < left ? [...p, id] : p));

  async function ask(input, done) {
    setBusy(true); setErr(''); setMsg('');
    try {
      const ok = await requestRun(projectId, 'creator', 'animate_creatives', email, input);
      setMsg(ok ? done : 'Попередній запит на відео ще виконується: дочекайтесь його.');
      if (ok && onRequested) onRequested();
    } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  }
  const go = () => ask({ sources: picked, duration: Math.max(4, Math.min(10, Math.floor(Number(duration)) || 10)), resolution, quality, audio, ...(audio === 'voice' ? { language } : {}), motion }, 'Креатор візьметься за відео найближчою хвилиною. Генерація триває кілька хвилин: потім натисніть «Забрати готові відео», якщо вони ще не з’явились.');

  if (cards.length === 0 && videos.length === 0) return null;
  const sel = (id, label, value, set, options) => (
    <div className="wf-col" style={{ gap: 4 }}>
      <label htmlFor={id} className="wf-muted" style={{ fontSize: 12.5 }}>{label}</label>
      <Select ariaLabel={label} value={value} onChange={set} options={options.map(([k, v]) => ({ value: k, label: v }))} />
    </div>
  );
  return (
    <div className="wf-card" style={{ background: 'var(--wf-bg)', boxShadow: 'none', marginBottom: 12 }}>
      <h3>Відео з готових креативів</h3>
      <div className="wf-muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Цього місяця зроблено {used} з {VIDEO_MONTHLY_MAX}. Відео береться з готової картинки креатива, товар на ньому лишається впізнаваним.</div>
      {cards.length > 0 && left > 0 && (
        <>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="wf-muted" style={{ fontSize: 12.5, padding: 0, marginBottom: 6 }}>Які креативи оживити (до {left})</legend>
            <div className="wf-row">
              {cards.map((c) => (
                <label key={c.id} className="wf-row" style={{ gap: 6, cursor: 'pointer', maxWidth: 260 }}>
                  <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
                  <img src={c.image_url} alt="" width={36} height={45} style={{ objectFit: 'cover', borderRadius: 6 }} />{c.id} · {c.headline}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="wf-row" style={{ alignItems: 'flex-end', marginTop: 10 }}>
            <div className="wf-col" style={{ gap: 4 }}>
              <label htmlFor="wf-vid-dur" className="wf-muted" style={{ fontSize: 12.5 }}>Тривалість, с (4–10)</label>
              <input id="wf-vid-dur" type="number" min={4} max={10} className="wf-bd-in" style={{ width: 80 }} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            {sel('wf-vid-res', 'Роздільність', resolution, setResolution, Object.entries(RESOLUTIONS))}
            {sel('wf-vid-q', 'Якість', quality, setQuality, Object.entries(QUALITY))}
            {sel('wf-vid-motion', 'Рух камери', motion, setMotion, Object.entries(MOTIONS).map(([k, v]) => [k, v[0]]))}
            {sel('wf-vid-audio', 'Звук', audio, setAudio, Object.entries(AUDIO))}
            {audio === 'voice' && sel('wf-vid-lang', 'Мова озвучки', language, setLanguage, Object.entries(LANGS))}
          </div>
        </>
      )}
      <div className="wf-row" style={{ marginTop: 12 }}>
        <button type="button" className="wf-btn p" disabled={busy || proposals > 0 || picked.length === 0 || left === 0} onClick={go}>Створити відео</button>
        {producing && <button type="button" className="wf-btn" disabled={busy || proposals > 0} onClick={() => ask({ follow: true }, 'Креатор перевірить, що вже готове, найближчою хвилиною.')}>Забрати готові відео</button>}
      </div>
      <div className="wf-muted" style={{ fontSize: 12.5, marginTop: 8 }}>
        {proposals > 0 ? 'Спершу прийміть або відхиліть пропозицію агента нижче: нові відео будуються на поточному тексті розділу.'
          : left === 0 ? 'Місячний ліміт відео вичерпано. «Швидко» дешевше й годиться для тестів, «стандарт» якісніший. Ціну кожного відео система питає в Higgsfield наперед і не перевищує ліміт витрат проєкту.'
            : 'Ціну кожного відео система питає в Higgsfield наперед і не перевищує ліміт витрат проєкту. Озвучка бере готовий текст креатива; текст, що звучить як відгук покупця, система відхиляє.'}
      </div>
      {videos.length > 0 && (
        <div className="wf-ads" style={{ marginTop: 12 }}>
          {videos.map((v) => (
            <div key={v.id} className="wf-card" style={{ boxShadow: '0 0 0 1px var(--wf-border)' }}>
              <div className="wf-muted" style={{ fontSize: 12.5, marginBottom: 6 }}>{v.id} з креатива {v.of} · {v.duration} с · {v.resolution} · {STATUS[v.status] || v.status}</div>
              {v.video_url ? <video src={v.video_url} controls preload="metadata" playsInline style={{ width: '100%', maxHeight: 360, borderRadius: 10, background: '#000' }} /> : <div className="wf-muted">{v.status === 'producing' ? 'Генерується…' : 'Файлу немає.'}</div>}
              {v.note && <div className="wf-muted" style={{ fontSize: 12.5, marginTop: 6 }}>{v.note}</div>}
            </div>
          ))}
        </div>
      )}
      {msg && <div className="wf-muted" style={{ marginTop: 8 }} role="status">{msg}</div>}
      {err && <div className="wf-err" style={{ marginTop: 8 }} role="alert">{err}</div>}
    </div>
  );
}
