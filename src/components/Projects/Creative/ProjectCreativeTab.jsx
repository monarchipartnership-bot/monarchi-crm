import { useCallback, useEffect, useRef, useState } from 'react';
import AutoResizeTextarea from '../../Reports/AutoResizeTextarea';
import Select from '../../common/Select';
import { useConfirm } from '../../common/ConfirmDialog';
import { useAuth } from '../../../contexts/AuthContext';
import { FILE_TYPES, MAX_FILE_MB } from '../../../lib/api/creatives';
import { deleteAsset, fetchProjectAccounts, fetchProjectCreative, saveInput, saveSettings, uploadAsset } from '../../../lib/api/projectCreative';
import { ASSET_KINDS, CTA_MODES, FRESH_DAYS, INPUT_FIELDS, PROFILE_FIELDS, inputState } from '../../../lib/agents/projectCreative';
import { agentsNeeding, filledFields, readinessByMode } from '../../../lib/agents/agentRequirements';
import { MODES, MODE_ORDER } from '../../../lib/agents/campaignModes';
import { HubTitle } from '../hubIcons';
import '../../../styles/projectCreative.css';

const KIND_OPTIONS = Object.entries(ASSET_KINDS).map(([value, label]) => ({ value, label }));
const STATE_TEXT = { wait: 'Чекає даних', ok: 'Заповнено', old: 'Застарів' };
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }) : '');

// The «AI-агенти» tab of the project card (it was «Креативи»): everything the agents need to know about this client. Readiness for each kind of campaign, what the
// manager tells about the client, the materials, the brand and the rules, and the data other departments' agents deliver (can be filled by hand meanwhile).
export default function ProjectCreativeTab({ projectId }) {
  const { email } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const fileInput = useRef(null);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [kind, setKind] = useState('product');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null); // { key, text } of the field being filled by hand
  const [accounts, setAccounts] = useState([]);

  const load = useCallback(async () => {
    setError('');
    try {
      const [d, acc] = await Promise.all([fetchProjectCreative(projectId), fetchProjectAccounts(projectId).catch(() => [])]);
      setAccounts(acc);
      setData(d);
      setForm({ figma_url: d.settings.figma_url, cta_mode: d.settings.cta_mode, cta_text: d.settings.cta_text, restrictions: d.settings.restrictions });
    } catch (e) {
      setData({ settings: null, assets: [] });
      setError(/does not exist|relation|schema cache/i.test(e.message || '') ? 'Розділ ще не підключено до бази: потрібно застосувати міграцію 20261042.' : (e.message || 'Не вдалося завантажити дані.'));
    }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const dirty = !!form && !!data?.settings && ['figma_url', 'cta_mode', 'cta_text', 'restrictions'].some((k) => form[k] !== data.settings[k]);
  const set = (patch) => { setNotice(''); setForm((f) => ({ ...f, ...patch })); };

  async function addFiles(list) {
    setError(''); setNotice(''); setBusy('upload');
    try {
      const added = [];
      for (const file of [...list]) added.push(await uploadAsset(projectId, file, kind, email));
      setData((d) => ({ ...d, assets: [...d.assets, ...added] }));
    } catch (e) { setError(e.message || 'Не вдалося завантажити файл.'); } finally { setBusy(''); if (fileInput.current) fileInput.current.value = ''; }
  }

  async function removeAsset(a) {
    if (!(await confirm({ title: 'Прибрати матеріал?', body: `Файл «${a.name}» зникне з бібліотеки клієнта. Запити, у які він уже доданий, не зміняться.`, confirmLabel: 'Прибрати', danger: true }))) return;
    setError('');
    try { await deleteAsset(a); setData((d) => ({ ...d, assets: d.assets.filter((x) => x.id !== a.id) })); } catch (e) { setError(e.message || 'Не вдалося прибрати файл.'); }
  }

  async function saveRules() {
    setError(''); setNotice(''); setBusy('rules');
    try {
      const row = await saveSettings(projectId, form, email);
      setData((d) => ({ ...d, settings: { ...d.settings, ...row } }));
      setNotice('Збережено.');
    } catch (e) { setError(e.message || 'Не вдалося зберегти.'); } finally { setBusy(''); }
  }

  async function saveField(key, text) {
    setError(''); setBusy('input:' + key);
    try {
      const row = await saveInput(projectId, key, text, email);
      setData((d) => ({ ...d, settings: { ...d.settings, inputs: row.inputs } }));
      setEditing(null);
    } catch (e) { setError(e.message || 'Не вдалося зберегти.'); } finally { setBusy(''); }
  }

  if (!data) return <div className="pcr-wrap"><div className="empty-hint">Завантаження…</div></div>;
  const settings = data.settings;
  const have = filledFields({ settings, assets: data.assets, accounts });
  const platforms = [...new Set(accounts.map((a) => a.platform).filter((p) => p === 'meta' || p === 'google'))];
  const ready = readinessByMode(have, platforms);

  // one row of a field: its name, who fills it, the value (or the hint), the state and the button
  const renderRows = (fields, whoOf) => fields.map((f) => {
    const item = settings?.inputs?.[f.key];
    const st = inputState(item);
    const open = editing?.key === f.key;
    const need = agentsNeeding(f.key);
    return (
      <li key={f.key} className={'pcr-input-row is-' + st.state}>
        <div className="pcr-input-name">
          <b>{f.label}</b>
          <small>{whoOf(f)}</small>
          {(need.required.length > 0 || need.recommended.length > 0) && <small className="pcr-need">{need.required.length ? `Потрібне для: ${need.required.join(', ')}` : `Бажане для: ${need.recommended.slice(0, 4).join(', ')}`}</small>}
        </div>
        <div className="pcr-input-body">
          {open ? (
            <>
              <AutoResizeTextarea className="pcr-input" value={editing.text} onChange={(v) => setEditing({ key: f.key, text: v })} placeholder={f.hint} maxLength={8000} autoFocus />
              <div className="pcr-row-actions">
                <button type="button" className="btn btn-p" disabled={!!busy} onClick={() => saveField(f.key, editing.text)}>{busy === 'input:' + f.key ? 'Зберігаємо…' : 'Зберегти'}</button>
                <button type="button" className="btn" disabled={!!busy} onClick={() => setEditing(null)}>Скасувати</button>
              </div>
            </>
          ) : (
            <>
              <p className={'pcr-input-text' + (st.state === 'wait' ? ' is-empty' : '')}>{st.state === 'wait' ? f.hint : item.body}</p>
              {item && <small className="pcr-input-meta">{item.source === 'manual' ? `Введено вручну${item.by ? `, ${item.by}` : ''}` : `Агент: ${item.by || f.agent}`}{item.filled_at ? ` · ${fmtDate(item.filled_at)}` : ''}</small>}
            </>
          )}
        </div>
        <div className="pcr-input-side">
          <span className={'pcr-state is-' + st.state}>{STATE_TEXT[st.state]}{st.state === 'old' && st.days != null ? ` · ${st.days} дн.` : ''}</span>
          {!open && <button type="button" className="btn" disabled={!settings || !!busy} onClick={() => setEditing({ key: f.key, text: item?.body || '' })}>{st.state === 'wait' ? 'Заповнити вручну' : 'Редагувати'}</button>}
        </div>
      </li>
    );
  });

  return (
    <div className="pcr-wrap">
      {error && <p className="pcr-error" role="alert">{error}</p>}

      <section className="pcr-card" aria-label="Готовність до кампаній">
        <div className="pcr-head">
          <div>
            <HubTitle icon="users">Готовність до кампаній</HubTitle>
            <p className="pcr-sub">Чого агентам ще не вистачає, щоб кампанія кожного типу працювала як слід. Обовʼязкове без якого агент не зробить нічого корисного, бажане покращує результат.</p>
          </div>
        </div>
        <ul className="pcr-ready">
          {MODE_ORDER.map((mode) => {
            const m = ready[mode];
            const state = m.required.length ? 'bad' : m.recommended.length ? 'warn' : 'ok';
            return (
              <li key={mode} className={'pcr-ready-row is-' + state}>
                <b>{MODES[mode].title}</b>
                <span className={'pcr-state is-' + (state === 'ok' ? 'ok' : state === 'warn' ? 'old' : 'wait')}>{state === 'ok' ? 'Усе є' : state === 'warn' ? 'Є бажане' : 'Бракує обовʼязкового'}</span>
                <span className="pcr-ready-text">
                  {m.required.length > 0 && <>Обовʼязкове: {m.required.map((x) => x.label).join(', ')}. </>}
                  {m.recommended.length > 0 && <>Бажане: {m.recommended.map((x) => x.label).join(', ')}.</>}
                  {!m.required.length && !m.recommended.length && 'Нічого додавати не потрібно.'}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="pcr-card" aria-label="Про клієнта">
        <div className="pcr-head">
          <div>
            <HubTitle icon="users">Про клієнта</HubTitle>
            <p className="pcr-sub">Це розповідаєте ви: більше ніхто цього не знає. Усі агенти беруть ці дані звідси, тому їх не треба повторювати в кожній кампанії.</p>
          </div>
        </div>
        <ul className="pcr-inputs">{renderRows(PROFILE_FIELDS, () => 'Заповнюється тут')}</ul>
      </section>

      <section className="pcr-card" aria-label="Матеріали клієнта">
        <div className="pcr-head">
          <div>
            <HubTitle icon="file">Матеріали клієнта</HubTitle>
            <p className="pcr-sub">Логотип, фото продукту, приклади стилю. Агенти креативів беруть їх звідси як референси. PNG, JPG або WebP до {MAX_FILE_MB} МБ.</p>
          </div>
          <div className="pcr-upload">
            <Select value={kind} onChange={setKind} options={KIND_OPTIONS} ariaLabel="Тип матеріалу" />
            <input ref={fileInput} type="file" accept={FILE_TYPES.join(',')} multiple hidden onChange={(e) => addFiles(e.target.files)} />
            <button type="button" className="btn btn-p" disabled={!settings || !!busy} onClick={() => fileInput.current?.click()}>{busy === 'upload' ? 'Завантажуємо…' : 'Додати файли'}</button>
          </div>
        </div>
        {data.assets.length === 0 ? (
          <div className="pcr-empty">Матеріалів ще немає. Додайте логотип і фото продукту: без них креативи будуть без референсів.</div>
        ) : (
          <ul className="pcr-assets">
            {data.assets.map((a) => (
              <li key={a.id}>
                <img src={a.url} alt="" loading="lazy" />
                <span className="pcr-asset-kind">{ASSET_KINDS[a.kind] || a.kind}</span>
                <b title={a.name}>{a.name}</b>
                <button type="button" className="pcr-x" aria-label={`Прибрати ${a.name}`} onClick={() => removeAsset(a)}>×</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pcr-card" aria-label="Бренд і правила">
        <div className="pcr-head">
          <div>
            <HubTitle icon="note">Бренд і правила</HubTitle>
            <p className="pcr-sub">Це читають усі агенти відділу креативів, коли роблять креативи для цього клієнта.</p>
          </div>
          <div className="pcr-actions">
            {notice && <span className="pcr-ok">{notice}</span>}
            <button type="button" className="btn btn-p" disabled={!dirty || !!busy || !settings} onClick={saveRules}>{busy === 'rules' ? 'Зберігаємо…' : 'Зберегти'}</button>
          </div>
        </div>
        {form && (
          <div className="pcr-fields">
            <label className="pcr-field">
              <span>Макет бренду в Figma</span>
              <input className="pcr-input" value={form.figma_url} onChange={(e) => set({ figma_url: e.target.value })} placeholder="https://www.figma.com/design/…" maxLength={300} />
              <small>Стратег вивчає цей макет (кольори, шрифти, стиль), коли Figma буде підключено.</small>
            </label>
            <div className="pcr-field">
              <span>Кнопка заклику до дії</span>
              <div className="pcr-chips" role="group" aria-label="Кнопка заклику до дії">
                {Object.entries(CTA_MODES).map(([k, v]) => <button key={k} type="button" className={'pcr-chip' + (form.cta_mode === k ? ' on' : '')} aria-pressed={form.cta_mode === k} onClick={() => set({ cta_mode: k })}>{v}</button>)}
              </div>
              {form.cta_mode === 'always' && <input className="pcr-input" value={form.cta_text} onChange={(e) => set({ cta_text: e.target.value })} placeholder="Текст кнопки, наприклад: Shop now" maxLength={40} aria-label="Текст кнопки" />}
              <small>У більшості проєктів кнопка обовʼязкова. У частини fashion-проєктів її не роблять, бо важлива естетика.</small>
            </div>
            <label className="pcr-field pcr-field--wide">
              <span>Обмеження клієнта</span>
              <AutoResizeTextarea className="pcr-input" value={form.restrictions} onChange={(v) => set({ restrictions: v })} placeholder="Що не можна показувати й обіцяти в креативах…" maxLength={2000} />
            </label>
          </div>
        )}
      </section>

      <section className="pcr-card" aria-label="Дані від інших відділів">
        <div className="pcr-head">
          <div>
            <HubTitle icon="users">Дані від інших відділів</HubTitle>
            <p className="pcr-sub">Ці поля мають заповнювати агенти інших відділів. Поки їх немає, можна заповнити вручну. Старше {FRESH_DAYS} днів агент вважає дані застарілими й каже про це.</p>
          </div>
        </div>
        <ul className="pcr-inputs">{renderRows(INPUT_FIELDS, (f) => `Заповнює: ${f.agent}`)}</ul>
      </section>
      {confirmDialog}
    </div>
  );
}
