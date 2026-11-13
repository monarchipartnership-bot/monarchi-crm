import { useCallback, useEffect, useRef, useState } from 'react';
import useSpeechInput, { SPEECH_LANGS } from '../../../lib/useSpeechInput';
import { fillCycleForm } from '../../../lib/api/creatives';
import { MIN_FILL_CHARS, applyFill } from '../../../lib/agents/cycleFormFill';
import { MAX_CONCEPTS, MAX_GIVEN_TEXTS, REQUEST_RATIOS, TEXT_MODES, parseGivenTexts } from '../../../lib/agents/creativeTeam';
import { languageLabel } from '../../../lib/agents/languages';
import Select from '../../common/Select';

// The brief of a creative task in the windows of the card of a project (the launch of the team, a one-off task): the description typed or dictated, the button that reads it
// with the card and fills the other fields, the directions, the formats, the texts and the language of the client (read only: it is set in the card). What the person set by
// hand is not overwritten by the analysis; the description is kept as a draft in this browser until `clearTaskDraft(draftKey)`.
//   value: { goal, count, ratios, texts, language }   onChange(patch)   projectId   draftKey   children: more fields of the window (they come last in the same grid)
export const clearTaskDraft = (draftKey) => { try { localStorage.removeItem(draftKey); } catch { /* no storage */ } };

const PASTE_HINT = 'Вставте всі тексти разом, по три рядки на кожен: заголовок, підзаголовок, плашка.\nТексти розділіть номерами «1)» або порожнім рядком.';

// allowGiven: the manager may give the texts himself (a one-off task only): each becomes its own creative, word for word (step 3.8)
export default function TaskBrief({ value, onChange, projectId, draftKey, children, allowGiven = false }) {
  const [paste, setPaste] = useState('');
  const onPaste = (txt) => { setPaste(txt); onChange({ given_texts: parseGivenTexts(txt).slice(0, MAX_GIVEN_TEXTS) }); };
  const [voiceLang, setVoiceLang] = useState('uk');
  const [an, setAn] = useState({ busy: false, error: '', rows: null, questions: [] });
  const touched = useRef(new Set());
  const now = useRef(value);
  now.current = value;
  const speech = useSpeechInput({ lang: voiceLang, onText: (txt) => { if (txt) { const g = now.current.goal; onChange({ goal: `${g}${g && !/\s$/.test(g) ? ' ' : ''}${txt}`.slice(0, 3000) }); } } });
  const byHand = (patch) => { Object.keys(patch).forEach((k) => touched.current.add(k)); onChange(patch); }; // a field the person changed is not overwritten by the analysis

  useEffect(() => { if (value.goal === '') { try { const d = localStorage.getItem(draftKey); if (d) onChange({ goal: d }); } catch { /* no storage */ } } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { if (value.goal) localStorage.setItem(draftKey, value.goal); else localStorage.removeItem(draftKey); } catch { /* no storage */ } }, [value.goal, draftKey]);

  const analyse = useCallback(async () => {
    setAn({ busy: true, error: '', rows: null, questions: [] });
    try {
      const fill = await fillCycleForm({ projectId, text: now.current.goal });
      const fields = { ...fill.fields };
      if (fields.texts === 'given') delete fields.texts; // no ready texts here: the copywriter writes them
      const r = applyFill({ current: now.current, fill: { ...fill, fields, agent_settings: {} }, touched: touched.current });
      const patch = {};
      ['count', 'ratios', 'texts'].forEach((k) => { if (r.patch[k] != null) patch[k] = k === 'count' ? String(r.patch[k]) : r.patch[k]; });
      onChange(patch);
      const q = fill.quotes || {};
      const rows = [];
      if (r.patch.count != null) rows.push({ label: 'Напрямів за запуск', value: String(r.patch.count), quote: q.count, warn: fill.clamped ? `Ви назвали ${fill.clamped}, але за один запуск максимум ${MAX_CONCEPTS}: поставлено ${MAX_CONCEPTS}. Більше ідей замовляйте окремим разовим завданням.` : '' });
      if (r.patch.ratios) rows.push({ label: 'Формати', value: r.patch.ratios.map((k) => REQUEST_RATIOS.find((x) => x.key === k)?.label || k).join(', '), quote: q.ratios });
      if (r.patch.texts != null) rows.push({ label: 'Тексти на креативах', value: TEXT_MODES[r.patch.texts] || r.patch.texts });
      setAn({ busy: false, error: '', rows, questions: fill.questions?.length ? fill.questions : fill.notes ? [fill.notes] : [] });
    } catch (e) { setAn({ busy: false, error: e?.message || 'Не вдалося проаналізувати опис.', rows: null, questions: [] }); }
  }, [projectId, onChange]);

  return (
    <div className="tm-task">
      <div className="tm-fl tm-w2"><label htmlFor="tm-goal">Що потрібно від креативів</label>
        <textarea id="tm-goal" className="tm-area" rows={4} maxLength={3000} value={value.goal} onChange={(e) => onChange({ goal: e.target.value })} placeholder="Напишіть або надиктуйте своїми словами: для чого креативи, що важливо, скільки ідей" />
        {speech.listening && <p className="vo-live" role="status">Слухаю… {speech.interim}</p>}
        {speech.error && <p className="vo-err" role="alert">{speech.error}</p>}
        <div className="vo-bar">
          <span className="vo-count">{value.goal.length} / 3000{value.goal ? ' · чернетка збережена в цьому браузері' : ''}</span>
          {speech.supported
            ? (<>
              <Select className="tm-ssel vo-lang" value={voiceLang} onChange={setVoiceLang} disabled={speech.listening} options={SPEECH_LANGS.map((l) => ({ value: l.key, label: l.label }))} ariaLabel="Мова, якою ви говорите" />
              <button type="button" className={'btn vo-mic' + (speech.listening ? ' on' : '')} onClick={speech.toggle} aria-pressed={speech.listening} aria-label={speech.listening ? 'Зупинити запис' : 'Надиктувати голосом'} title={speech.listening ? 'Зупинити запис' : 'Надиктувати голосом'}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>{speech.listening ? 'Зупинити' : 'Голос'}
              </button>
            </>)
            : <span className="vo-count" title="Цей браузер не вміє розпізнавати мову. Відкрийте CRM у Chrome, Edge або Safari.">голос: потрібен Chrome, Edge або Safari</span>}
          <button type="button" className="btn btn-p" disabled={an.busy || value.goal.trim().length < MIN_FILL_CHARS} onClick={analyse} title={value.goal.trim().length < MIN_FILL_CHARS ? 'Спершу опишіть завдання хоча б одним-двома реченнями' : 'Агент розбере опис разом із карткою проєкту й заповнить напрями, формати й тексти'}>{an.busy ? 'Аналізуємо…' : 'Заповнити поля з опису'}</button>
        </div>
        {an.error && <p className="vo-err" role="alert">{an.error}</p>}
        {an.rows && (
          <div className="vo-res" role="status">
            <p className="vo-res-h">Що визначено з опису</p>
            {an.rows.length
              ? <ul className="vo-rows">{an.rows.map((r) => <li key={r.label} className={r.warn ? 'is-warn' : ''}><b>{r.label}</b><span>{r.value}</span>{r.quote && <small>з опису: «{r.quote}»</small>}{r.warn && <em>{r.warn}</em>}</li>)}</ul>
              : <p className="vo-none">З опису нічого додаткового не визначено: поля нижче лишились як були.</p>}
            {an.questions.length > 0 && (<><p className="vo-res-h">Варто уточнити</p><ul className="vo-q">{an.questions.map((x, i) => <li key={i}>{x}</li>)}</ul></>)}
            <p className="vo-foot">Значення вже підставлено в поля нижче, їх можна змінити.</p>
          </div>
        )}
      </div>
      <label className="tm-fl"><span>Напрямів (ідей) за запуск</span>
        <Select className="tm-ssel tm-text" value={String(value.count)} onChange={(v) => byHand({ count: v })} options={Array.from({ length: MAX_CONCEPTS }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} ariaLabel="Напрямів за запуск" /></label>
      <fieldset className="tm-fl tm-fs"><legend>Формати</legend>
        {REQUEST_RATIOS.map((r) => <label key={r.key} className="tm-chk"><input type="checkbox" checked={value.ratios.includes(r.key)} onChange={(e) => byHand({ ratios: e.target.checked ? [...value.ratios, r.key] : value.ratios.filter((x) => x !== r.key) })} />{r.label}</label>)}
      </fieldset>
      <label className="tm-fl"><span>Тексти на креативах</span>
        <Select className="tm-ssel tm-text" value={value.texts} onChange={(v) => byHand({ texts: v })} options={['yes', 'no', ...(allowGiven ? ['given'] : [])].map((k) => ({ value: k, label: k === 'given' ? 'Мої готові тексти' : TEXT_MODES[k] }))} ariaLabel="Тексти на креативах" /></label>
      {allowGiven && value.texts === 'given' && (
        <div className="tm-fl tm-w2"><label htmlFor="tm-given">Мої тексти</label>
          <textarea id="tm-given" className="tm-area" rows={6} value={paste} onChange={(e) => onPaste(e.target.value)} placeholder={PASTE_HINT} aria-label="Усі тексти разом" />
          <small className="tm-hint">{(value.given_texts || []).length ? `Розпізнано: ${value.given_texts.length}. Кожен текст стане окремим креативом і буде використаний дослівно (до ${MAX_GIVEN_TEXTS}).` : `Тексти використаємо дослівно, до ${MAX_GIVEN_TEXTS}; кожен стане окремим креативом.`}</small>
        </div>
      )}
      <div className="tm-fl"><span>Мова текстів для клієнта</span><b className="tm-lang">{languageLabel(value.language)}</b><small className="tm-hint">Мова клієнта з картки проєкту. Для команди результати завжди українською.</small></div>
      {children}
    </div>
  );
}
