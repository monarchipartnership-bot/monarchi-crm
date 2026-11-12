import { useCallback, useEffect, useRef, useState } from 'react';
import AutoResizeTextarea from '../../Reports/AutoResizeTextarea';
import Select from '../../common/Select';
import { useConfirm } from '../../common/ConfirmDialog';
import { useAuth } from '../../../contexts/AuthContext';
import { FILE_TYPES, MAX_FILE_MB } from '../../../lib/api/creatives';
import { supabase } from '../../../lib/supabaseClient';
import { analyzeBrand, deleteAsset, fetchProjectCreative, importMetaExamples, saveInput, saveSettings, uploadAsset } from '../../../lib/api/projectCreative';
import { ASSET_GROUPS, CTA_MAX_VARIANTS, CTA_MODES, FRESH_DAYS, addCtaVariant, addLink, ctaVariants, inputState, parseLinks, removeCtaVariant, removeLink, sectionFields } from '../../../lib/agents/projectCreative';
import { agentsNeeding, filledFields, readinessByMode } from '../../../lib/agents/agentRequirements';
import { MODES, MODE_ORDER } from '../../../lib/agents/campaignModes';
import { HubTitle } from '../hubIcons';
import { STATUS_LABEL } from '../../../lib/projectConstants';
import Deliverables from '../../../pages/Tools/campaigns/Deliverables';
import MarketsEditor, { marketsLanguageLine } from './MarketsEditor';
import { updateProject } from '../../../lib/api/projects';
import { languagePatch } from '../../../lib/clientLang';
import { languageLabel } from '../../../lib/agents/languages';
import '../../../styles/projectCreative.css';

const STATE_TEXT = { wait: 'Чекає даних', ok: 'Заповнено', old: 'Застарів' };
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }) : '');

// The «AI-агенти» tab of the project card (it was «Креативи»): everything the agents need to know about this client. Readiness for each kind of campaign, what the
// manager tells about the client, the materials, the brand and the rules, and the data other departments' agents deliver (can be filled by hand meanwhile).
const TABS = [['ready', 'Готовність до операцій'], ['client', 'Про клієнта'], ['business', 'Про бізнес'], ['competitors', 'Про конкурентів']];
const PLATFORM_NAME = { meta: 'Meta', google: 'Google', tiktok: 'TikTok' };
const LANG_NAME = { en: 'Англійська', uk: 'Українська' };
const day = (d) => (d ? String(d).split('-').reverse().join('.') : '');
// what the «Огляд» of the CRM card says about the project and the client: [group, [label, value]] with the empty values left out
function crmFacts(p) {
  if (!p) return [];
  const period = [day(p.start_date), day(p.end_date)].filter(Boolean).join(' – ');
  const groups = [
    ['Основне', [['Менеджер', p.manager], ['Спеціаліст', p.specialist], ['Статус', STATUS_LABEL[p.status] || p.status], ['Період', period], ['Послуги', (p.services || []).join(', ')], ['Причина зупинки', p.stop_reason]]],
    ['Клієнт', [['Клієнт', p.client], ['Країна', p.country], ['Сайт', p.website], ['Тип бізнесу', p.business_type], ['Мова клієнта й звітів', languageLabel(p.client_language) || LANG_NAME[p.report_lang] || p.report_lang], ['Контакти', p.contacts], ['Часовий пояс', p.timezone]]],
    ['Особливості роботи з клієнтом', [['', p.notes]]],
  ];
  return groups.map(([title, rows]) => [title, rows.filter(([, v]) => String(v ?? '').trim())]).filter(([, rows]) => rows.length);
}

//   showDeliverables: one more section «Готові матеріали» (the CRM card keeps the work of the agents there)   crmLink: a link to the CRM card of the project
//   section: show only this section ('ready' | 'client' | 'business' | 'competitors' | 'materials') without the strip of tabs: the card of the project in the Hub
//   (owner, 2026-11-11: ALL the information about a project lives in that card) gives it its own navigation   embedded: the facts of the CRM «Основне» are not repeated
export default function ProjectCreativeTab({ projectId, showDeliverables = false, crmLink = false, section = null, embedded = false }) {
  const { email } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const fileInputs = useRef({}); // one hidden file input per kind of file
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [cta, setCta] = useState(''); // the wording of the button being typed
  const [brandNote, setBrandNote] = useState('');
  const [metaNote, setMetaNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const notifyMaterials = useCallback((text, isError) => setError(isError ? text : ''), []); // «Готові матеріали»: only a failure is told here, a success is seen in the list
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null); // { key, text } of the field being filled by hand
  const [accounts, setAccounts] = useState([]);
  const [tabState, setTab] = useState('ready');
  const tab = section || tabState;
  const [crm, setCrm] = useState(null); // the row of the CRM project: what its «Огляд» holds
  const [link, setLink] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [d, acc, proj] = await Promise.all([
        fetchProjectCreative(projectId),
        supabase.from('project_ad_accounts').select('platform, account_id, account_name').eq('project_id', projectId).then((r) => r.data || []).catch(() => []),
        supabase.from('projects').select('name, client, manager, specialist, status, start_date, end_date, services, stop_reason, country, website, business_type, report_lang, client_language, contacts, timezone, notes').eq('id', projectId).maybeSingle().then((r) => r.data || null).catch(() => null),
      ]);
      setAccounts(acc); setCrm(proj);
      setData(d);
      setForm({ figma_url: d.settings.figma_url, cta_mode: d.settings.cta_mode, cta_text: d.settings.cta_text, restrictions: d.settings.restrictions });
    } catch (e) {
      setData({ settings: null, assets: [] });
      setError(/does not exist|relation|schema cache/i.test(e.message || '') ? 'Розділ ще не підключено до бази: потрібно застосувати міграцію 20261042.' : (e.message || 'Не вдалося завантажити дані.'));
    }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const dirty = !!form && !!data?.settings && ['figma_url', 'restrictions'].some((k) => form[k] !== data.settings[k]);
  const set = (patch) => { setNotice(''); setForm((f) => ({ ...f, ...patch })); };

  async function addFiles(list, kind) {
    setError(''); setNotice(''); setBusy('upload:' + kind);
    try {
      for (const file of [...list]) {
        const one = await uploadAsset(projectId, file, kind, email);
        setData((d) => ({ ...d, assets: [...d.assets, one] })); // shown at once: if a later file fails, these stay on the screen
      }
    } catch (e) { setError((e.message || 'Не вдалося завантажити файл.') + ' Файли, завантажені до цього, вже в бібліотеці: повторно їх не додавайте.'); } finally { setBusy(''); if (fileInputs.current[kind]) fileInputs.current[kind].value = ''; }
  }

  async function removeAsset(a) {
    if (!(await confirm({ title: 'Прибрати матеріал?', body: `Файл «${a.name}» зникне з бібліотеки клієнта. Запити, у які він уже доданий, не зміняться.`, confirmLabel: 'Прибрати', danger: true }))) return;
    setError('');
    try { await deleteAsset(a); setData((d) => ({ ...d, assets: d.assets.filter((x) => x.id !== a.id) })); } catch (e) { setError(e.message || 'Не вдалося прибрати файл.'); }
  }

  async function saveRules() {
    setError(''); setNotice(''); setBusy('rules');
    try {
      const row = await saveSettings(projectId, { ...form, cta_mode: data.settings.cta_mode, cta_text: data.settings.cta_text }, email); // the button is saved on its own
      setData((d) => ({ ...d, settings: { ...d.settings, ...row } }));
      setNotice('Збережено.');
    } catch (e) { setError(e.message || 'Не вдалося зберегти.'); } finally { setBusy(''); }
  }

  async function saveCta(patch) {
    setError(''); setNotice(''); setBusy('cta');
    try {
      const saved = data.settings;
      const row = await saveSettings(projectId, { figma_url: saved.figma_url, restrictions: saved.restrictions, cta_mode: saved.cta_mode, cta_text: saved.cta_text, ...patch }, email);
      setData((d) => ({ ...d, settings: { ...d.settings, ...row } }));
      setForm((f) => ({ ...f, cta_mode: row.cta_mode, cta_text: row.cta_text }));
      return true;
    } catch (e) { setError(e.message || 'Не вдалося зберегти.'); return false; } finally { setBusy(''); }
  }
  async function addCta() {
    let next;
    try { next = addCtaVariant(data.settings.cta_text, cta); } catch (e) { setError(e.message); return; }
    if (await saveCta({ cta_text: next })) setCta('');
  }
  // «Підтягнути з Meta»: the best ads of the last 30 days come into the library as ready creatives
  async function pullMeta() {
    setError(''); setBrandNote(''); setBusy('meta');
    try {
      const r = await importMetaExamples(projectId);
      if (r.added?.length) setData((d) => ({ ...d, assets: [...d.assets, ...r.added] }));
      const parts = [r.added?.length ? `Додано з Meta: ${r.added.length}` : 'Нових креативів з Meta немає'];
      if (r.already) parts.push(`уже були: ${r.already}`);
      if (r.noPicture) parts.push(`без картинки (каталог або недоступне фото): ${r.noPicture}`);
      if (!r.looked) parts[0] = 'За останні 30 днів у кабінеті Meta немає оголошень із витратами';
      setMetaNote(parts.join(' · ') + '.');
    } catch (e) { setError(e.message || 'Не вдалося підтягнути креативи з Meta.'); } finally { setBusy(''); }
  }
  // «Визначити з файлів»: the model's reading opens in the editor of the field; nothing is saved until the person presses «Зберегти»
  async function detectBrand() {
    setError(''); setBrandNote(''); setBusy('brand');
    try {
      const r = await analyzeBrand(projectId);
      setEditing({ key: 'brand', text: r.text });
      setBrandNote(`Визначено за файлами (${r.images}). Перевірте, виправте й натисніть «Зберегти».${r.notes ? ` ${r.notes}` : ''}`);
    } catch (e) { setError(e.message || 'Не вдалося проаналізувати файли.'); } finally { setBusy(''); }
  }

  async function saveField(key, text) {
    setError(''); setBusy('input:' + key);
    try {
      const row = await saveInput(projectId, key, text, email);
      setData((d) => ({ ...d, settings: { ...d.settings, inputs: row.inputs } }));
      setEditing(null);
    } catch (e) { setError(e.message || 'Не вдалося зберегти.'); } finally { setBusy(''); }
  }

  // «Ринки й мови»: the countries from a list go into the field, the language of the client is a field of the project (the same one as in its «Основне»)
  async function saveMarkets({ text, language }) {
    setError(''); setBusy('input:markets');
    try {
      const row = await saveInput(projectId, 'markets', text, email);
      await updateProject(projectId, languagePatch(language));
      setData((d) => ({ ...d, settings: { ...d.settings, inputs: row.inputs } }));
      setCrm((c) => ({ ...(c || {}), client_language: language || null }));
      setEditing(null);
    } catch (e) { setError(e.message || 'Не вдалося зберегти.'); } finally { setBusy(''); }
  }

  const who = (f) => (f.agent ? `${f.agent}. Поки агент не заповнив, можна вручну.` : 'Заповнюється тут');
  const sites = parseLinks(data?.settings?.inputs?.competitor_sites?.body);
  async function addSite() {
    setError('');
    let next;
    try { next = addLink(data.settings.inputs?.competitor_sites?.body, link); } catch (e) { setError(e.message); return; }
    await saveField('competitor_sites', next);
    setLink('');
  }
  const dropSite = (url) => saveField('competitor_sites', removeLink(data.settings.inputs?.competitor_sites?.body, url));

  if (!data) return <div className="pcr-wrap"><div className="empty-hint">Завантаження…</div></div>;
  const settings = data.settings;
  const have = filledFields({ settings, assets: data.assets, accounts });
  const platforms = [...new Set(accounts.map((a) => a.platform).filter((p) => p === 'meta' || p === 'google'))];
  const ready = readinessByMode(have, platforms);

  // one row of a field: its name, who fills it, the value (or the hint), the state and the button
  const renderRows = (fields, whoOf, extra = null) => fields.map((f) => {
    const item = settings?.inputs?.[f.key];
    const st = inputState(item);
    const open = editing?.key === f.key;
    const need = agentsNeeding(f.key);
    return (
      <li key={f.key} className={'pcr-input-row is-' + st.state + (f.agent ? ' is-agent' : '')}>
        <div className="pcr-input-name">
          <b>{f.label}</b>
          {f.agent ? <span className="pcr-agent-chip">Заповнює агент</span> : null}
          <small>{whoOf(f)}</small>
          {(need.required.length > 0 || need.recommended.length > 0) && <small className="pcr-need">{need.required.length ? `Потрібне для: ${need.required.join(', ')}` : `Бажане для: ${need.recommended.slice(0, 4).join(', ')}`}</small>}
        </div>
        <div className="pcr-input-body">
          {open && f.key === 'markets' ? (
            <MarketsEditor text={item?.body || ''} language={crm?.client_language || ''} busy={busy === 'input:markets'} onSave={saveMarkets} onCancel={() => setEditing(null)} />
          ) : open ? (
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
              {f.key === 'markets' && <small className={'pcr-input-meta' + (crm?.client_language ? '' : ' pcr-lang-miss')}>{marketsLanguageLine(crm?.client_language)}</small>}
              {item && <small className="pcr-input-meta">{item.source === 'manual' ? `Введено вручну${item.by ? `, ${item.by}` : ''}` : `Агент: ${item.by || f.agent}`}{item.filled_at ? ` · ${fmtDate(item.filled_at)}` : ''}</small>}
            </>
          )}
        </div>
        <div className="pcr-input-side">
          <span className={'pcr-state is-' + st.state}>{STATE_TEXT[st.state]}{st.state === 'old' && st.days != null ? ` · ${st.days} дн.` : ''}</span>
          {!open && <button type="button" className="btn" disabled={!settings || !!busy} onClick={() => setEditing({ key: f.key, text: item?.body || '' })}>{st.state === 'wait' ? 'Заповнити вручну' : 'Редагувати'}</button>}
          {!open && extra ? extra(f) : null}
        </div>
      </li>
    );
  });

  const facts = crmFacts(crm);
  const tabs = showDeliverables ? [...TABS, ['materials', 'Готові матеріали']] : TABS;
  const missing = MODE_ORDER.filter((m) => ready[m].required.length).length;
  return (
    <div className="pcr-wrap">
      {!section && <div className="pcr-tabs" role="tablist" aria-label="Розділи інформації">
        {tabs.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={'pcr-tab' + (tab === k ? ' on' : '')} onClick={() => { setTab(k); setEditing(null); setError(''); setNotice(''); }}>{label}{k === 'ready' && missing > 0 ? <em>{missing}</em> : null}{k === 'competitors' && sites.length > 0 ? <em className="is-plain">{sites.length}</em> : null}</button>)}
      </div>}
      {error && <p className="pcr-error" role="alert">{error}</p>}

      {tab === 'ready' && (
        <>
      <section className="pcr-card" aria-label="Готовність до операцій">
        <div className="pcr-head">
          <div>
            <HubTitle icon="users">Готовність до операцій</HubTitle>
            <p className="pcr-sub">Чого агентам ще не вистачає, щоб операція кожного типу працювала як слід. Обовʼязкове без якого агент не зробить нічого корисного, бажане покращує результат.{crmLink ? ' Заповнюється все в картці проєкту, у розділі «Інформація про проєкт».' : ''}</p>
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
        </>
      )}

      {tab === 'client' && (
        <>
          {!embedded && <section className="pcr-card" aria-label="З картки проєкту в CRM">
            <div className="pcr-head">
              <div>
                <HubTitle icon="users">З картки проєкту в CRM</HubTitle>
                <p className="pcr-sub">Це береться з розділу «Огляд» картки проєкту: хто веде проєкт і хто клієнт. Змінюється там, тут лише показується агентам і вам.</p>
              </div>
              {crmLink && <a className="btn" href={`/projects/${projectId}`} target="_blank" rel="noreferrer noopener">Відкрити картку в CRM</a>}
            </div>
            {!facts.length && <div className="pcr-empty">У картці проєкту в CRM ще нічого не заповнено.</div>}
            {facts.map(([title, rows]) => (
              <div className="pcr-facts" key={title}>
                <h4>{title}</h4>
                <dl>{rows.map(([label, value]) => <div key={label || 'note'}>{label && <dt>{label}</dt>}<dd>{label === 'Сайт' ? <a href={/^https?:/i.test(value) ? value : `https://${value}`} target="_blank" rel="noreferrer noopener">{value}</a> : String(value)}</dd></div>)}</dl>
              </div>
            ))}
          </section>}

          <section className="pcr-card" aria-label="Про клієнта">
            <div className="pcr-head">
              <div>
                <HubTitle icon="users">Про клієнта</HubTitle>
                <p className="pcr-sub">Як бренд говорить, де працює і хто його покупці. Позначені поля заповнює агент; поки він цього не зробив, їх можна заповнити вручну.</p>
              </div>
            </div>
            <ul className="pcr-inputs">{renderRows(sectionFields('client'), who)}</ul>
          </section>

        </>
      )}

      {tab === 'business' && (
        <>
          <section className="pcr-card" aria-label="Сайт і кабінети">
            <div className="pcr-head">
              <div>
                <HubTitle icon="file">Сайт і рекламні кабінети</HubTitle>
                <p className="pcr-sub">Сайт клієнта й кабінети, з яких агенти читають цифри. {embedded ? 'Змінюються в розділі «Основне» цієї картки.' : 'Підключаються в картці проєкту в CRM.'}</p>
              </div>
            </div>
            <div className="pcr-facts">
              <dl>
                <div><dt>Сайт</dt><dd>{crm?.website ? <a href={/^https?:/i.test(crm.website) ? crm.website : `https://${crm.website}`} target="_blank" rel="noreferrer noopener">{crm.website}</a> : <span className="pcr-none">{embedded ? 'не вказано в розділі «Основне»' : 'не вказано в картці CRM'}</span>}</dd></div>
                {['meta', 'google'].map((pf) => {
                  const mine = accounts.filter((a) => a.platform === pf);
                  return <div key={pf}><dt>Кабінет {PLATFORM_NAME[pf]}</dt><dd>{mine.length ? mine.map((a) => `${a.account_name || 'без назви'} (${a.account_id})`).join('; ') : <span className="pcr-none">не підключено</span>}</dd></div>;
                })}
              </dl>
            </div>
          </section>

          <section className="pcr-card" aria-label="Про бізнес">
            <div className="pcr-head">
              <div>
                <HubTitle icon="note">Про бізнес</HubTitle>
                <p className="pcr-sub">Що продає клієнт, чим відрізняється, які цілі й бюджет. Нижче поля, які заповнюють агенти: дослідження бізнесу, стратегія, результати кабінету, трекінг. Старше {FRESH_DAYS} днів агент вважає дані застарілими.</p>
              </div>
            </div>
            <ul className="pcr-inputs">{renderRows(sectionFields('business'), who)}</ul>
          </section>

          <section className="pcr-card" aria-label="Бренд і матеріали клієнта">
            <div className="pcr-head">
              <div>
                <HubTitle icon="file">Бренд і матеріали клієнта</HubTitle>
                <p className="pcr-sub">Усе, з чого агенти роблять креативи для цього клієнта. Файли: PNG, JPG або WebP до {MAX_FILE_MB} МБ.</p>
              </div>
            </div>

            <h4 className="pcr-h4">Файли клієнта</h4>
            <div className="pcr-groups">
              {ASSET_GROUPS.map((g) => {
                const files = data.assets.filter((a) => (g.kind === 'other' ? !ASSET_GROUPS.some((x) => x.kind === a.kind && x.kind !== 'other') : a.kind === g.kind));
                return (
                  <div className="pcr-group" key={g.kind}>
                    <div className="pcr-group-head">
                      <div><b>{g.title}</b><small>{g.hint}</small></div>
                      <input ref={(el) => { fileInputs.current[g.kind] = el; }} type="file" accept={FILE_TYPES.join(',')} multiple hidden onChange={(e) => addFiles(e.target.files, g.kind)} />
                      <div className="pcr-group-btns">
                        <button type="button" className="btn" disabled={!settings || !!busy} onClick={() => fileInputs.current[g.kind]?.click()}>{busy === 'upload:' + g.kind ? 'Завантажуємо…' : 'Додати файли'}</button>
                        {g.kind === 'creative' && accounts.some((x) => x.platform === 'meta') && <button type="button" className="btn btn-p" disabled={!settings || !!busy} onClick={pullMeta}>{busy === 'meta' ? 'Підтягуємо…' : 'Підтягнути з Meta'}</button>}
                      </div>
                    </div>
                    {g.kind === 'creative' && accounts.some((x) => x.platform === 'meta') && <small className="pcr-hint">«Підтягнути з Meta»: до 6 найкращих оголошень за 30 днів (за ROAS і покупками) з їхніми цифрами в назві. У відео береться обкладинка.</small>}
                    {g.kind === 'creative' && metaNote && <p className="pcr-brandnote" role="status">{metaNote}</p>}
                    {files.length === 0 ? <div className="pcr-group-empty">Файлів немає</div> : (
                      <ul className="pcr-assets">
                        {files.map((a) => (
                          <li key={a.id}>
                            <img src={a.url} alt="" loading="lazy" />
                            <b title={a.name}>{a.name}</b>
                            <button type="button" className="pcr-x" aria-label={`Прибрати ${a.name}`} onClick={() => removeAsset(a)}>×</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {g.kind === 'creative' && <ul className="pcr-inputs pcr-inputs--in">{renderRows(sectionFields('brand').filter((f) => f.key === 'examples'), who)}</ul>}
                  </div>
                );
              })}
            </div>

            <h4 className="pcr-h4">Бренд: кольори, шрифти, стиль</h4>
            <ul className="pcr-inputs">{renderRows(sectionFields('brand').filter((f) => f.key === 'brand'), who, () => (
              <button type="button" className="btn btn-p" disabled={!settings || !!busy || !data.assets.length} title={data.assets.length ? undefined : 'Спершу додайте файли клієнта'} onClick={detectBrand}>{busy === 'brand' ? 'Аналізуємо файли…' : 'Визначити з файлів'}</button>
            ))}</ul>
            {brandNote && <p className="pcr-brandnote" role="status">{brandNote}</p>}
            <p className="pcr-sub">«Визначити з файлів»: агент дивиться на завантажені файли й називає кольори, вид шрифтів і стиль. Результат відкриється в полі для правки; шрифт за картинкою визначається приблизно. Один запит до моделі, кілька центів.</p>

            {form && (
              <>
                <h4 className="pcr-h4">Макет і правила</h4>
                <div className="pcr-fields pcr-fields--brand">
                  <label className="pcr-field pcr-field--wide">
                    <span>Посилання на макет бренду в Figma</span>
                    <input className="pcr-input" value={form.figma_url} onChange={(e) => set({ figma_url: e.target.value })} placeholder="https://www.figma.com/design/…" maxLength={300} />
                    <small>Стратег бере з макета кольори, шрифти й стиль.</small>
                  </label>
                  <label className="pcr-field pcr-field--wide">
                    <span>Обмеження від клієнта</span>
                    <textarea className="pcr-input pcr-textarea" rows={5} value={form.restrictions} onChange={(e) => set({ restrictions: e.target.value })} placeholder="Що не можна показувати, обіцяти чи писати в креативах: слова, теми, образи, порівняння з конкурентами…" maxLength={2000} />
                  </label>
                </div>
                <div className="pcr-actions pcr-actions--left">
                  <button type="button" className="btn btn-p" disabled={!dirty || !!busy || !settings} onClick={saveRules}>{busy === 'rules' ? 'Зберігаємо…' : 'Зберегти макет і обмеження'}</button>
                  {notice && <span className="pcr-ok">{notice}</span>}
                </div>

                <h4 className="pcr-h4">Тексти на креативах: кнопка</h4>
                <p className="pcr-sub">Кнопка — це те, що агенти малюють на картинці під текстом: «Shop now», «Купити». Додайте кілька варіантів: для кожного креативу агент бере той, що підходить за змістом. Без варіантів текст кнопки придумає копірайтер.</p>
                <div className="pcr-chips" role="group" aria-label="Чи потрібна кнопка на креативах">
                  {Object.entries(CTA_MODES).map(([k, v]) => <button key={k} type="button" className={'pcr-chip' + (data.settings.cta_mode === k ? ' on' : '')} aria-pressed={data.settings.cta_mode === k} disabled={!!busy} onClick={() => data.settings.cta_mode !== k && saveCta({ cta_mode: k })}>{v}</button>)}
                </div>
                {data.settings.cta_mode === 'none' ? <p className="pcr-sub">Кнопки не буде на жодному креативі цього клієнта.</p> : (
                  <>
                    {ctaVariants(data.settings.cta_text).length > 0 && (
                      <ul className="pcr-ctas" aria-label="Варіанти тексту кнопки">
                        {ctaVariants(data.settings.cta_text).map((v) => <li key={v}><span>{v}</span><button type="button" aria-label={`Прибрати варіант ${v}`} disabled={!!busy} onClick={() => saveCta({ cta_text: removeCtaVariant(data.settings.cta_text, v) })}>×</button></li>)}
                      </ul>
                    )}
                    {ctaVariants(data.settings.cta_text).length < CTA_MAX_VARIANTS && (
                      <form className="pcr-linkadd" onSubmit={(e) => { e.preventDefault(); addCta(); }}>
                        <input className="pcr-input" value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Текст кнопки, наприклад: Shop now" maxLength={40} aria-label="Новий варіант тексту кнопки" />
                        <button type="submit" className="btn btn-p" disabled={!cta.trim() || !!busy}>{busy === 'cta' ? 'Зберігаємо…' : 'Додати варіант'}</button>
                      </form>
                    )}
                    <small className="pcr-hint">До {CTA_MAX_VARIANTS} варіантів, кожен до 40 символів. Точний текст для окремої партії можна задати в самому запиті на креативи.</small>
                  </>
                )}
              </>
            )}

            <h4 className="pcr-h4">Побажання й додаткова інформація</h4>
            <ul className="pcr-inputs">{renderRows(sectionFields('brand').filter((f) => !['examples', 'brand'].includes(f.key)), who)}</ul>
          </section>

        </>
      )}

      {tab === 'competitors' && (
        <>
          <section className="pcr-card" aria-label="Сайти конкурентів">
            <div className="pcr-head">
              <div>
                <HubTitle icon="file">Сайти конкурентів</HubTitle>
                <p className="pcr-sub">Додайте адреси сайтів або сторінок конкурентів. Агент дослідження конкурентів читає їх сам і порівнює з клієнтом.</p>
              </div>
            </div>
            <form className="pcr-linkadd" onSubmit={(e) => { e.preventDefault(); addSite(); }}>
              <input className="pcr-input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://competitor.com" aria-label="Адреса сайту конкурента" maxLength={300} />
              <button type="submit" className="btn btn-p" disabled={!link.trim() || !settings || !!busy}>{busy === 'input:competitor_sites' ? 'Зберігаємо…' : 'Додати'}</button>
            </form>
            {!sites.length && <div className="pcr-empty">Сайтів конкурентів ще немає. Без них дослідник конкурентів не зможе працювати.</div>}
            {sites.length > 0 && (
              <ul className="pcr-links">
                {sites.map((u) => <li key={u}><a href={u} target="_blank" rel="noreferrer noopener">{u}</a><button type="button" className="pcr-x" aria-label={`Прибрати ${u}`} disabled={!!busy} onClick={() => dropSite(u)}>×</button></li>)}
              </ul>
            )}
          </section>

          <section className="pcr-card" aria-label="Про конкурентів">
            <div className="pcr-head">
              <div>
                <HubTitle icon="users">Про конкурентів</HubTitle>
                <p className="pcr-sub">Що ви знаєте самі, і дослідження, яке робить агент. Позначене поле заповнює агент; поки його немає, можна вручну.</p>
              </div>
            </div>
            <ul className="pcr-inputs">{renderRows(sectionFields('competitors'), who)}</ul>
          </section>
        </>
      )}

      {tab === 'materials' && showDeliverables && (
        <>
      <Deliverables
        light projectId={projectId} notify={notifyMaterials}
        head={<div className="pcr-head"><div><HubTitle icon="file">Готові матеріали</HubTitle><p className="pcr-sub">Усе, що агенти зробили для цього клієнта в усіх операціях: креативи, стратегії, звіти, аналізи. Схваліть, поверніть із причиною, виправте текст або завантажте.</p></div></div>}
      />
        </>
      )}
      {confirmDialog}
    </div>
  );
}
