import { useState } from 'react';
import ActionIcon from '../../components/common/ActionIcon';
import Select from '../../components/common/Select';
import DatePicker from '../../components/common/DatePicker';
import { useAuth } from '../../contexts/AuthContext';
import { NETWORKS, NETWORK_KEYS, saveCompetitor, savePost } from '../../lib/api/smm';
import { kyivTime, kyivYmd, nextMondayYmd, toIso, todayKyiv } from '../../lib/smmDates';
import { Dialog } from './smmCommon';

const errText = (e) => (e && e.message) || 'Не вдалося виконати дію.';

// ---------- one post: write by hand or edit what the agent wrote ----------
export function PostDialog({ post, onClose, onSaved }) {
  const { email } = useAuth();
  const [f, setF] = useState(() => ({
    platform: post?.platform || 'instagram', format: post?.format || NETWORKS[post?.platform || 'instagram'].formats && Object.keys(NETWORKS[post?.platform || 'instagram'].formats)[0],
    topic: post?.topic || '', body: post?.body || '', hashtags: post?.hashtags || '', visual_brief: post?.visual_brief || '', fact_check: post?.fact_check || '',
    date: post?.scheduled_for ? kyivYmd(post.scheduled_for) : '', time: post?.scheduled_for ? kyivTime(post.scheduled_for) : '12:00',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const formats = Object.entries(NETWORKS[f.platform].formats);

  function changePlatform(p) {
    setF((s) => ({ ...s, platform: p, format: Object.keys(NETWORKS[p].formats).includes(s.format) ? s.format : Object.keys(NETWORKS[p].formats)[0] }));
  }
  async function submit(e) {
    e.preventDefault();
    if (!f.body.trim()) { setError('Напишіть текст поста.'); return; }
    setBusy(true); setError('');
    try {
      const row = { id: post?.id, platform: f.platform, format: f.format, topic: f.topic.trim(), body: f.body.trim(), hashtags: f.hashtags.trim(), visual_brief: f.visual_brief.trim(), fact_check: f.fact_check.trim(), scheduled_for: f.date ? toIso(f.date, f.time) : null };
      // Editing an approved or published post puts it back on review: what was approved is no longer what is written.
      if (post && ['approved', 'published'].includes(post.status) && (post.body !== row.body || post.hashtags !== row.hashtags)) row.status = 'needs_review';
      await savePost(row, email);
      onSaved(post ? 'Пост збережено.' : 'Пост додано в чернетки.');
    } catch (err) { setError(errText(err)); setBusy(false); }
  }

  return (
    <Dialog
      title={post ? 'Редагувати пост' : 'Новий пост'} onClose={onClose} wide
      foot={(
        <>
          <button type="button" className="smm-btn" onClick={onClose}>Скасувати</button>
          <button type="submit" form="smm-post-form" className="smm-btn smm-btn--primary" disabled={busy}><ActionIcon name="save" size={18} />{busy ? 'Зберігаємо…' : 'Зберегти'}</button>
        </>
      )}
    >
      <form id="smm-post-form" className="smm-form" onSubmit={submit}>
        <div className="smm-field"><label>Мережа</label><Select value={f.platform} onChange={changePlatform} options={NETWORK_KEYS.map((k) => ({ value: k, label: NETWORKS[k].label }))} ariaLabel="Мережа" /></div>
        <div className="smm-field"><label>Формат</label><Select value={f.format} onChange={set('format')} options={formats.map(([v, l]) => ({ value: v, label: l }))} ariaLabel="Формат" /></div>
        <div className="smm-field smm-field--wide"><label htmlFor="smm-topic">Тема</label><input id="smm-topic" type="text" value={f.topic} onChange={(e) => set('topic')(e.target.value)} maxLength={120} /></div>
        <div className="smm-field smm-field--wide"><label htmlFor="smm-body">Текст поста</label><textarea id="smm-body" rows={9} value={f.body} onChange={(e) => set('body')(e.target.value)} maxLength={4000} /></div>
        <div className="smm-field smm-field--wide"><label htmlFor="smm-tags">Хештеги</label><input id="smm-tags" type="text" value={f.hashtags} onChange={(e) => set('hashtags')(e.target.value)} maxLength={300} /></div>
        <div className="smm-field smm-field--wide"><label htmlFor="smm-visual">Візуал / сценарій</label><textarea id="smm-visual" rows={3} value={f.visual_brief} onChange={(e) => set('visual_brief')(e.target.value)} maxLength={1500} placeholder="Що знімаємо чи малюємо" /></div>
        <div className="smm-field smm-field--wide"><label htmlFor="smm-fact">Що перевірити перед публікацією</label><input id="smm-fact" type="text" value={f.fact_check} onChange={(e) => set('fact_check')(e.target.value)} maxLength={500} /></div>
        <div className="smm-field"><label>Дата публікації (Київ)</label><DatePicker value={f.date} onChange={set('date')} placeholder="Без дати" /></div>
        <div className="smm-field"><label htmlFor="smm-time">Час</label><input id="smm-time" type="time" value={f.time} onChange={(e) => set('time')(e.target.value)} disabled={!f.date} /></div>
        {error && <p className="smm-error smm-field--wide" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}

// ---------- a single line of text: the reason for a rejection, the link of a published post ----------
export function TextPromptDialog({ title, label, placeholder, required, confirmLabel, onClose, onSubmit }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    if (required && !v.trim()) { setError('Це поле обовʼязкове.'); return; }
    setBusy(true); setError('');
    try { await onSubmit(v.trim()); } catch (err) { setError(errText(err)); setBusy(false); }
  }
  return (
    <Dialog
      title={title} onClose={onClose}
      foot={(
        <>
          <button type="button" className="smm-btn" onClick={onClose}>Скасувати</button>
          <button type="submit" form="smm-prompt-form" className="smm-btn smm-btn--primary" disabled={busy}>{confirmLabel}</button>
        </>
      )}
    >
      <form id="smm-prompt-form" className="smm-form" onSubmit={submit}>
        <div className="smm-field smm-field--wide"><label htmlFor="smm-prompt">{label}</label><textarea id="smm-prompt" rows={3} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} autoFocus /></div>
        {error && <p className="smm-error smm-field--wide" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}

// ---------- a competitor ----------
export function CompetitorDialog({ competitor, onClose, onSaved }) {
  const { email } = useAuth();
  const [f, setF] = useState({ name: competitor?.name || '', website: competitor?.website || '', socials: competitor?.socials || '', notes: competitor?.notes || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) { setError('Вкажіть назву.'); return; }
    setBusy(true); setError('');
    try { await saveCompetitor({ id: competitor?.id, ...f }, email); onSaved(); } catch (err) { setError(errText(err)); setBusy(false); }
  }
  return (
    <Dialog
      title={competitor ? 'Редагувати конкурента' : 'Новий конкурент'} onClose={onClose}
      foot={(
        <>
          <button type="button" className="smm-btn" onClick={onClose}>Скасувати</button>
          <button type="submit" form="smm-comp-form" className="smm-btn smm-btn--primary" disabled={busy}><ActionIcon name="save" size={18} />Зберегти</button>
        </>
      )}
    >
      <form id="smm-comp-form" className="smm-form" onSubmit={submit}>
        <div className="smm-field smm-field--wide"><label htmlFor="smm-c-name">Назва</label><input id="smm-c-name" type="text" value={f.name} onChange={set('name')} maxLength={120} /></div>
        <div className="smm-field smm-field--wide"><label htmlFor="smm-c-site">Сайт</label><input id="smm-c-site" type="text" value={f.website} onChange={set('website')} maxLength={300} placeholder="https://" /></div>
        <div className="smm-field smm-field--wide"><label htmlFor="smm-c-soc">Соцмережі (посилання)</label><textarea id="smm-c-soc" rows={3} value={f.socials} onChange={set('socials')} maxLength={1000} placeholder="По одному посиланню на рядок" /></div>
        <div className="smm-field smm-field--wide"><label htmlFor="smm-c-notes">Нотатки</label><textarea id="smm-c-notes" rows={3} value={f.notes} onChange={set('notes')} maxLength={1000} placeholder="Чим вони відрізняються, що в них добре і що погано" /></div>
        {error && <p className="smm-error smm-field--wide" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}
