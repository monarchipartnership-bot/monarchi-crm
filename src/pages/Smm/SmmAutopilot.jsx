import { useEffect, useMemo, useState } from 'react';
import ActionIcon from '../../components/common/ActionIcon';
import Select from '../../components/common/Select';
import { useAuth } from '../../contexts/AuthContext';
import { nextScheduled } from '../../lib/agentSchedule';
import { fetchAllProfiles, profileLabel } from '../../lib/api/profile';
import { AUTOPILOT_DEFAULTS, NETWORKS, NETWORK_KEYS, saveSettings } from '../../lib/api/smm';
import { fmtWhen } from '../../lib/smmDates';

const WEEKDAYS = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота', 'Неділя'];
const MAX_TOTAL = 12;

function recipientChoices(people, chosen) {
  const known = new Map(people.map((p) => [String(p.email).toLowerCase(), { email: String(p.email).toLowerCase(), label: profileLabel(p) }]));
  (chosen || []).forEach((e) => { if (!known.has(e)) known.set(e, { email: e, label: e }); });
  return [...known.values()].sort((a, b) => a.label.localeCompare(b.label, 'uk'));
}

// The weekly autopilot: at the chosen weekday and time the content team refreshes the competitor analyses, writes the posts
// for the next week into the approval queue and tells the chosen people. It never publishes anything.
export default function SmmAutopilot({ settings, notify, reload }) {
  const { email } = useAuth();
  const base = useMemo(() => ({ ...AUTOPILOT_DEFAULTS, ...(settings || {}), counts: { ...AUTOPILOT_DEFAULTS.counts, ...(settings?.counts || {}) } }), [settings]);
  const [f, setF] = useState(base);
  const [people, setPeople] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setF(base); }, [base]);
  useEffect(() => { fetchAllProfiles().then((p) => setPeople(p || [])); }, []);

  const total = NETWORK_KEYS.reduce((s, k) => s + (Number(f.counts[k]) || 0), 0);
  const dirty = JSON.stringify([f.enabled, f.weekday, f.time, f.language, f.counts, f.refresh_competitors, [...(f.notify_emails || [])].sort()])
    !== JSON.stringify([base.enabled, base.weekday, base.time, base.language, base.counts, base.refresh_competitors, [...(base.notify_emails || [])].sort()]);
  const next = f.enabled ? nextScheduled('weekly', { weeklyDay: f.weekday, weeklyTime: f.time }) : null;

  const setCount = (k, v) => setF((s) => ({ ...s, counts: { ...s.counts, [k]: Math.max(0, Math.min(7, Number(v) || 0)) } }));
  const toggleEmail = (e) => setF((s) => ({ ...s, notify_emails: s.notify_emails.includes(e) ? s.notify_emails.filter((x) => x !== e) : [...s.notify_emails, e] }));

  async function save(e) {
    e.preventDefault();
    if (total < 1) { notify('Вкажіть хоча б один пост.', true); return; }
    if (total > MAX_TOTAL) { notify(`За один запуск — не більше ${MAX_TOTAL} постів.`, true); return; }
    if (f.enabled && !f.notify_emails.length) { notify('Оберіть, кому надсилати сповіщення, або вимкніть автозапуск.', true); return; }
    setSaving(true);
    try {
      const patch = { enabled: f.enabled, weekday: Number(f.weekday), time: f.time || '12:00', language: f.language, counts: f.counts, refresh_competitors: f.refresh_competitors, notify_emails: f.notify_emails };
      // Switching it on starts the clock: a moment that was already in the past is not made up for.
      if (f.enabled && !base.enabled) { patch.enabled_since = new Date().toISOString(); patch.attempts = 0; }
      await saveSettings(patch, email);
      notify(f.enabled ? 'Автозапуск увімкнено.' : 'Налаштування збережено.');
      reload();
    } catch (err) { notify(err.message || 'Не вдалося зберегти.', true); } finally { setSaving(false); }
  }

  if (!settings) return null;
  return (
    <section className="smm-block">
      <h3>Автозапуск щотижня</h3>
      <p className="smm-muted">У вибраний день і час агенти оновлять аналіз конкурентів, складуть пости на наступний тиждень і покладуть їх у чергу схвалення, а вибраним людям прийде сповіщення. Нічого не публікується само.</p>
      <form className="smm-auto" onSubmit={save}>
        <label className="smm-switch">
          <input type="checkbox" checked={f.enabled} onChange={(e) => setF((s) => ({ ...s, enabled: e.target.checked }))} />
          <span>{f.enabled ? 'Увімкнено' : 'Вимкнено'}</span>
        </label>
        <div className="smm-form">
          <div className="smm-field"><label>День тижня (Київ)</label><Select value={String(f.weekday)} onChange={(v) => setF((s) => ({ ...s, weekday: Number(v) }))} options={WEEKDAYS.map((l, i) => ({ value: String(i + 1), label: l }))} ariaLabel="День тижня" /></div>
          <div className="smm-field"><label htmlFor="smm-auto-time">Час</label><input id="smm-auto-time" type="time" value={f.time} onChange={(e) => setF((s) => ({ ...s, time: e.target.value }))} /></div>
          <div className="smm-field"><label>Мова постів</label><Select value={f.language} onChange={(v) => setF((s) => ({ ...s, language: v }))} options={[{ value: 'en', label: 'English' }, { value: 'uk', label: 'Українська' }]} ariaLabel="Мова" /></div>
          <fieldset className="smm-field smm-field--wide smm-counts">
            <legend>Постів на тиждень (разом {total} із {MAX_TOTAL})</legend>
            {NETWORK_KEYS.map((k) => (
              <label key={k} className="smm-count"><span>{NETWORKS[k].label}</span><input type="number" min="0" max="7" value={f.counts[k]} onChange={(e) => setCount(k, e.target.value)} aria-label={`Постів для ${NETWORKS[k].label}`} /></label>
            ))}
          </fieldset>
          <label className="smm-check smm-field--wide"><input type="checkbox" checked={f.refresh_competitors} onChange={(e) => setF((s) => ({ ...s, refresh_competitors: e.target.checked }))} /> Оновлювати аналіз конкурентів, якщо він старший за тиждень</label>
          <fieldset className="smm-field smm-field--wide">
            <legend>Кому надсилати сповіщення</legend>
            <div className="smm-people">
              {recipientChoices(people, f.notify_emails).map((p) => (
                <label key={p.email} className="smm-check"><input type="checkbox" checked={f.notify_emails.includes(p.email)} onChange={() => toggleEmail(p.email)} /> {p.label}</label>
              ))}
            </div>
            {f.enabled && !f.notify_emails.length && <span className="smm-hint">Нікого не обрано: увімкнути автозапуск не вийде.</span>}
          </fieldset>
        </div>
        <div className="smm-form-foot">
          <button type="submit" className="smm-btn smm-btn--primary" disabled={saving || !dirty}><ActionIcon name="save" size={18} />{saving ? 'Зберігаємо…' : 'Зберегти'}</button>
          {dirty && <span className="smm-muted">Є незбережені зміни</span>}
          {!dirty && next && <span className="smm-muted">Наступний запуск: {fmtWhen(next.at.toISOString())} (Київ), пости будуть на тиждень, що починається після цього дня.</span>}
        </div>
        {settings.last_run_at && (
          <p className={'smm-last' + (settings.last_status === 'problem' ? ' smm-bad' : '')}>
            Останній запуск: {fmtWhen(settings.last_run_at)}, {settings.last_status === 'ok' ? 'успішно' : 'помилка'}. {settings.last_message}
          </p>
        )}
      </form>
    </section>
  );
}
