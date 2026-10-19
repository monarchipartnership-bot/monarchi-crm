import { useEffect, useMemo, useState } from 'react';
import ActionIcon from '../../components/common/ActionIcon';
import Select from '../../components/common/Select';
import { useAuth } from '../../contexts/AuthContext';
import { saveAgent } from '../../lib/api/agents';
import { fetchAllProfiles, profileLabel } from '../../lib/api/profile';
import { NETWORKS, NETWORK_KEYS } from '../../lib/api/smm';
import { CAMPAIGN_TEAM } from '../../lib/agents/campaignTeam';
import { roleMeta } from './agentUi';

export const LANGUAGE_OPTIONS = [{ value: 'en', label: 'English' }, { value: 'uk', label: 'Українська' }];
const WEEKDAYS = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота', 'Неділя'];
const MAX_TOTAL = 12;

function recipientChoices(people, chosen) {
  const known = new Map(people.map((p) => [String(p.email).toLowerCase(), { email: String(p.email).toLowerCase(), label: profileLabel(p) }]));
  (chosen || []).forEach((e) => { if (!known.has(e)) known.set(e, { email: e, label: e }); });
  return [...known.values()].sort((a, b) => a.label.localeCompare(b.label, 'uk'));
}

// The settings of ONE agent: when it starts by itself (Kyiv time) and the settings of its role. Saved into ag_agents.config / schedule.
export default function AgentSettings({ agent, notify, reload }) {
  const { email } = useAuth();
  const meta = roleMeta(agent.role);
  const hasSchedule = meta.schedule !== null && meta.schedule !== undefined;
  const base = useMemo(() => ({ schedule: agent.schedule || null, config: agent.config || {} }), [agent]);
  const [f, setF] = useState(base);
  const [people, setPeople] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setF(base); }, [base]);
  useEffect(() => { if (agent.role === 'strategist') fetchAllProfiles().then((p) => setPeople(p || [])); }, [agent.role]);

  const dirty = JSON.stringify(f) !== JSON.stringify(base);
  const setCfg = (k, v) => setF((s) => ({ ...s, config: { ...s.config, [k]: v } }));
  const counts = { linkedin: 0, instagram: 0, threads: 0, facebook: 0, tiktok: 0, ...(f.config.counts || {}) };
  const total = NETWORK_KEYS.reduce((s, k) => s + (Number(counts[k]) || 0), 0);

  async function save(e) {
    e.preventDefault();
    if (agent.role === 'strategist' && (total < 1 || total > MAX_TOTAL)) { notify(total < 1 ? 'Вкажіть хоча б один пост.' : `За один запуск — не більше ${MAX_TOTAL} постів.`, true); return; }
    setSaving(true);
    try { await saveAgent(agent.id, { schedule: f.schedule, config: f.config }, email); await reload(); notify('Налаштування збережено.'); } catch (err) { notify(err.message || 'Не вдалося зберегти.', true); } finally { setSaving(false); }
  }

  const sch = f.schedule;
  const isCampaign = agent.team === CAMPAIGN_TEAM;
  return (
    <form className="smm-auto" onSubmit={save}>
      {hasSchedule && (
        <>
          <label className="smm-switch"><input type="checkbox" checked={!!sch} onChange={(e) => setF((s) => ({ ...s, schedule: e.target.checked ? (meta.schedule || { weekday: 1, time: '09:00' }) : null }))} /><span>{sch ? 'Запускається за розкладом' : 'Без розкладу: лише вручну'}</span></label>
          {sch && (
            <div className="smm-form">
              <div className="smm-field"><label>День тижня (Київ)</label><Select value={String(sch.weekday)} onChange={(v) => setF((s) => ({ ...s, schedule: { ...s.schedule, weekday: Number(v) } }))} options={WEEKDAYS.map((l, i) => ({ value: String(i + 1), label: l }))} ariaLabel="День тижня" /></div>
              <div className="smm-field"><label htmlFor="ag-time">Час</label><input id="ag-time" type="time" value={sch.time} onChange={(e) => setF((s) => ({ ...s, schedule: { ...s.schedule, time: e.target.value } }))} /></div>
            </div>
          )}
          <p className="smm-hint">Агент стартує за розкладом, лише коли він увімкнений і ввімкнені ті, від кого він залежить. Якщо запуск не вдався, повтор через годину, до трьох спроб.</p>
        </>
      )}

      {isCampaign && (
        <div className="smm-form">
          {(meta.fields || []).map((fld) => (
            <div key={fld.key} className="smm-field smm-field--wide">
              <label htmlFor={'ag-f-' + fld.key}>{fld.label}</label>
              {fld.type === 'text'
                ? <input id={'ag-f-' + fld.key} type="text" value={f.config[fld.key] || ''} onChange={(e) => setCfg(fld.key, e.target.value)} maxLength={300} />
                : <textarea id={'ag-f-' + fld.key} rows={fld.rows || 3} value={f.config[fld.key] || ''} onChange={(e) => setCfg(fld.key, e.target.value)} maxLength={12000} />}
              {fld.hint && <span className="smm-hint">{fld.hint}</span>}
            </div>
          ))}
          <div className="smm-field smm-field--wide">
            <label htmlFor="ag-extra">Додаткова інструкція для цього клієнта</label>
            <textarea id="ag-extra" rows={4} value={f.config.extra || ''} onChange={(e) => setCfg('extra', e.target.value)} maxLength={2000} placeholder="Наприклад: не порівнювати з конкурентами за ціною; писати коротко; завжди називати кампанії за іменем." />
            <span className="smm-hint">Додається до промту цього агента лише для цієї кампанії. Основний промт редагується у вкладці «Промти».</span>
          </div>
        </div>
      )}

      {agent.role === 'strategist' && (
        <div className="smm-form">
          <fieldset className="smm-field smm-field--wide smm-counts">
            <legend>Постів на тиждень (разом {total} із {MAX_TOTAL})</legend>
            {NETWORK_KEYS.map((k) => (
              <label key={k} className="smm-count"><span>{NETWORKS[k].label}</span><input type="number" min="0" max="7" value={counts[k]} onChange={(e) => setCfg('counts', { ...counts, [k]: Math.max(0, Math.min(7, Number(e.target.value) || 0)) })} aria-label={`Постів для ${NETWORKS[k].label}`} /></label>
            ))}
          </fieldset>
          <div className="smm-field"><label>Мова постів</label><Select value={f.config.language || 'en'} onChange={(v) => setCfg('language', v)} options={LANGUAGE_OPTIONS} ariaLabel="Мова" /></div>
          <label className="smm-check smm-field--wide"><input type="checkbox" checked={f.config.requirePlanApproval !== false} onChange={(e) => setCfg('requirePlanApproval', e.target.checked)} /> Чекати на моє «ок» на плані тижня, перш ніж ставити завдання копірайтеру й візуал-агенту</label>
          <div className="smm-field smm-field--wide"><label htmlFor="ag-focus">Постійний фокус (необовʼязково)</label><textarea id="ag-focus" rows={3} value={f.config.focus || ''} onChange={(e) => setCfg('focus', e.target.value)} maxLength={600} placeholder="Наприклад: звітність для клієнтів або новий напрямок послуг" /></div>
          <fieldset className="smm-field smm-field--wide">
            <legend>Кому надсилати сповіщення, що план чекає</legend>
            <div className="smm-people">
              {recipientChoices(people, f.config.notifyEmails).map((p) => (
                <label key={p.email} className="smm-check"><input type="checkbox" checked={(f.config.notifyEmails || []).includes(p.email)} onChange={() => setCfg('notifyEmails', (f.config.notifyEmails || []).includes(p.email) ? f.config.notifyEmails.filter((x) => x !== p.email) : [...(f.config.notifyEmails || []), p.email])} /> {p.label}</label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {agent.role === 'site_analyst' && (
        <div className="smm-form">
          <div className="smm-field"><label htmlFor="ag-ga4">Ідентифікатор ресурсу GA4</label><input id="ag-ga4" type="text" inputMode="numeric" value={f.config.ga4PropertyId || ''} onChange={(e) => setCfg('ga4PropertyId', e.target.value.replace(/\D/g, ''))} placeholder="503944052" /></div>
          <div className="smm-field"><label htmlFor="ag-gsc">Ресурс Search Console</label><input id="ag-gsc" type="text" value={f.config.gscSiteUrl || ''} onChange={(e) => setCfg('gscSiteUrl', e.target.value.trim())} placeholder="sc-domain:monarchi.agency" /></div>
          <p className="smm-hint smm-field--wide">Агент читає обидва сервіси лише на читання, нічого не змінює. Доступ задається на сервері (Vercel): або ключем сервісного акаунта <code>GOOGLE_SERVICE_ACCOUNT_JSON</code>, або трьома змінними <code>GOOGLE_OAUTH_CLIENT_ID</code>, <code>GOOGLE_OAUTH_CLIENT_SECRET</code>, <code>GOOGLE_OAUTH_REFRESH_TOKEN</code> (токен людини, яка бачить GA4 і Search Console). Ідентифікатор GA4 це число з «Адміністратор → Відомості про ресурс».</p>
        </div>
      )}

      {agent.role === 'competitors' && (
        <div className="smm-form">
          <div className="smm-field"><label htmlFor="ag-days">Оновлювати аналіз, якщо він старший за (днів)</label><input id="ag-days" type="text" inputMode="numeric" value={f.config.refreshDays ?? 6} onChange={(e) => setCfg('refreshDays', Math.max(1, Math.min(60, Number(e.target.value.replace(/\D/g, '')) || 1)))} /></div>
        </div>
      )}

      {agent.role === 'visual' && (
        <div className="smm-form">
          <label className="smm-check smm-field--wide"><input type="checkbox" checked={f.config.generate !== false} onChange={(e) => setCfg('generate', e.target.checked)} /> Після промту одразу запускати генерацію в Higgsfield (коли підключено ключі). Вимкнено: агент лише пише промти.</label>
          <div className="smm-field smm-field--wide"><label htmlFor="ag-style">Візуальний стиль бренду</label><textarea id="ag-style" rows={5} value={f.config.styleNotes || ''} onChange={(e) => setCfg('styleNotes', e.target.value)} maxLength={1500} placeholder="Кольори (наприклад, глибокий фіолетовий і білий), настрій, що любимо (чисті поверхні, м'яке світло), чого уникаємо" /></div>
          <p className="smm-hint smm-field--wide">Цей текст підставляється в кожен візуальний бриф разом із промтом. Універсальний шаблон Higgsfield редагується у вкладці «Промти».</p>
        </div>
      )}

      {agent.role === 'qc' && (
        <div className="smm-form">
          <div className="smm-field"><label htmlFor="ag-rounds">Скільки разів повертати на доопрацювання</label><input id="ag-rounds" type="text" inputMode="numeric" value={f.config.maxRounds ?? 2} onChange={(e) => setCfg('maxRounds', Math.max(0, Math.min(3, Number(e.target.value.replace(/\D/g, '')) || 0)))} /></div>
          <p className="smm-hint smm-field--wide">Після цього пост іде до вас із позначкою, що лишилося. Нуль: контролер лише коментує, нічого не повертає.</p>
        </div>
      )}

      {!isCampaign && !hasSchedule && !['strategist', 'competitors', 'visual', 'qc', 'site_analyst'].includes(agent.role) && <p className="smm-muted">Окремих налаштувань у цього агента поки немає: він працює за завданнями від інших агентів.{meta.readyNote ? ' ' + meta.readyNote : ''}</p>}

      <div className="smm-form-foot">
        <button type="submit" className="smm-btn smm-btn--primary" disabled={saving || !dirty}><ActionIcon name="save" size={18} />{saving ? 'Зберігаємо…' : 'Зберегти'}</button>
        {dirty && <span className="smm-muted">Є незбережені зміни</span>}
      </div>
    </form>
  );
}
