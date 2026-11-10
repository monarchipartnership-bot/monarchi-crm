import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ActionIcon from '../../../components/common/ActionIcon';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useAuth } from '../../../contexts/AuthContext';
import useDialogA11y from '../../../lib/useDialogA11y';
import { supabase } from '../../../lib/supabaseClient';
import { fetchClientsForCampaigns } from '../../../lib/api/campaigns';
import { applyTemplate, copyOperation, deleteTemplate, fetchTemplates, saveTemplate } from '../../../lib/api/campaignTemplates';
import { PLATFORMS } from '../../../lib/agents/campaignTeam';
import { MODES } from '../../../lib/agents/campaignModes';
import { buildCalendar, cleanTemplate } from '../../../lib/agents/campaignTemplates';
import { WEEKDAYS } from '../../../lib/agents/campaignCycles';
import { fmtDateTime } from '../../Smm/agentUi';

const platformLabel = (p) => PLATFORMS[p]?.label || p;

function Shell({ title, onClose, busy, children, footer, wide }) {
  const box = useRef(null);
  useDialogA11y(box, () => { if (!busy) onClose(); });
  return createPortal(
    <div className="cmp-overlay ai-immersive" data-ai-safe>
      <div ref={box} className={'cmp-wizard cod' + (wide ? ' is-wide' : '')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className="cmp-wiz-head"><div><h2>{title}</h2></div><button type="button" className="cmp-x" onClick={onClose} disabled={busy} aria-label="Закрити"><ActionIcon name="close" size={20} /></button></header>
        <div className="cmp-wiz-body">{children}</div>
        <footer className="cmp-wiz-foot">{footer}</footer>
      </div>
    </div>,
    document.body,
  );
}

// the project pick shared by «Копіювати» and «З шаблону»: only projects with a cabinet
function ProjectPick({ clients, value, onChange }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => (clients || []).filter((c) => c.accounts.length && `${c.name} ${c.client || ''}`.toLowerCase().includes(q.trim().toLowerCase())), [clients, q]);
  return (
    <div className="cod-pick">
      <input className="cmp-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук проєкту" aria-label="Пошук проєкту" />
      {clients === null && <p className="cmp-muted">Завантаження…</p>}
      <ul className="cmp-clients">
        {list.map((c) => (
          <li key={c.id}><button type="button" className={'cmp-client' + (value?.id === c.id ? ' is-active' : '')} aria-pressed={value?.id === c.id} onClick={() => onChange(c)}>
            <span className="cmp-client-name">{c.name}</span><span className="cmp-client-sub">{c.client || '—'}</span>
            <span className="cmp-client-badges">{c.accounts.map((a) => <em key={a.platform + a.account_id} style={{ '--c': PLATFORMS[a.platform]?.color || '#EB9CEF' }}>{platformLabel(a.platform)}</em>)}</span>
          </button></li>
        ))}
      </ul>
    </div>
  );
}

function useClients() {
  const [clients, setClients] = useState(null);
  useEffect(() => { fetchClientsForCampaigns().then(setClients).catch(() => setClients([])); }, []);
  return clients;
}

const resultNote = (r) => [r.dropped?.length ? `Канали без кабінету пропущено: ${r.dropped.map(platformLabel).join(', ')}.` : '', r.missing?.length ? 'Частину агентів шаблону в цій операції немає.' : ''].filter(Boolean).join(' ');

// «Копіювати на інший проєкт»: a new operation for another project with the same settings of the agents, the same schedule, instructions and limits.
export function CopyOperationDialog({ campaign, onClose, onDone, notify }) {
  const { email } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const clients = useClients();
  const [project, setProject] = useState(null);
  const [name, setName] = useState('');
  const [withInstr, setWithInstr] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = (c) => { setProject(c); setName(`${c.name} · копія`); };

  async function go(launch) {
    if (launch && !(await confirm({ title: 'Створити й запустити?', body: 'Агенти нової операції одразу почнуть працювати й витрачати кошти (Claude, Higgsfield).', confirmLabel: 'Запустити' }))) return;
    setBusy(true); setError('');
    try {
      const r = await copyOperation({ campaign, project, name, email, withInstructions: withInstr, launch });
      notify?.(`Створено «${r.campaign.name}»${launch ? ' і запущено' : ' (чернетка)'}. ${resultNote(r)}`.trim());
      onDone(r.campaign);
    } catch (e) { setError(e.message || 'Не вдалося скопіювати.'); setBusy(false); }
  }
  return (
    <Shell title={`Копіювати «${campaign.name}» на інший проєкт`} onClose={onClose} busy={busy}
      footer={<><button type="button" className="cmp-btn" onClick={onClose} disabled={busy}>Скасувати</button>
        <button type="button" className="cmp-btn" disabled={!project || busy} onClick={() => go(false)}>{busy ? '…' : 'Створити чернетку'}</button>
        <button type="button" className="cmp-btn cmp-btn--primary" disabled={!project || busy} onClick={() => go(true)}>Створити й запустити</button></>}>
      {error && <p className="cmp-error" role="alert">{error}</p>}
      <p className="cmp-muted">Копіюються канали, режими й розклад агентів, їхні налаштування та ліміт витрат. Назва, бриф і цілі клієнта не копіюються: їх заповнюють для нового проєкту.</p>
      <ProjectPick clients={clients} value={project} onChange={pick} />
      {project && (
        <div className="cod-fields">
          <div className="cmp-field"><label htmlFor="cod-name">Назва нової операції</label><input id="cod-name" className="cmp-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <label className="cmp-switch"><input type="checkbox" checked={withInstr} onChange={(e) => setWithInstr(e.target.checked)} /> Скопіювати вказівки менеджера</label>
        </div>
      )}
      {confirmDialog}
    </Shell>
  );
}

// «Зберегти як шаблон»
export function SaveTemplateDialog({ campaign, onClose, notify }) {
  const { email } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [withInstr, setWithInstr] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try { await saveTemplate({ campaign, name, description, withInstructions: withInstr, email }); notify?.('Шаблон збережено: його видно в «Створити з шаблону».'); onClose(); } catch (e) { setError(e.message || 'Не вдалося зберегти.'); setBusy(false); }
  }
  return (
    <Shell title="Зберегти як шаблон" onClose={onClose} busy={busy}
      footer={<><button type="button" className="cmp-btn" onClick={onClose} disabled={busy}>Скасувати</button><button type="button" className="cmp-btn cmp-btn--primary" disabled={name.trim().length < 2 || busy} onClick={save}>{busy ? '…' : 'Зберегти шаблон'}</button></>}>
      {error && <p className="cmp-error" role="alert">{error}</p>}
      <p className="cmp-muted">Зберігається, як налаштована ця операція: режим, канали, агенти, розклад, ліміт. Дані клієнта в шаблон не потрапляють.</p>
      <div className="cmp-field"><label htmlFor="cod-tn">Назва шаблону</label><input id="cod-tn" className="cmp-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Наприклад: E-commerce Meta, щотижневий звіт" /></div>
      <div className="cmp-field"><label htmlFor="cod-td">Опис (необовʼязково)</label><textarea id="cod-td" className="cmp-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <label className="cmp-switch"><input type="checkbox" checked={withInstr} onChange={(e) => setWithInstr(e.target.checked)} /> Додати вказівки менеджера</label>
    </Shell>
  );
}

// «Створити з шаблону»: pick a template and a project, one click
export function FromTemplateDialog({ onClose, onDone, notify }) {
  const { email } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const clients = useClients();
  const [templates, setTemplates] = useState(undefined); // undefined = loading, null = no table
  const [tpl, setTpl] = useState(null);
  const [project, setProject] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { fetchTemplates().then(setTemplates).catch((e) => { setTemplates([]); setError(e.message); }); }, []);

  const info = (t) => { try { const p = cleanTemplate(t.payload); return `${MODES[p.mode]?.title || p.mode} · ${p.platforms.map(platformLabel).join(' + ') || 'без каналів'} · агентів: ${p.agents.filter((a) => a.enabled).length}`; } catch { return 'шаблон пошкоджено'; } };
  async function go(launch) {
    if (launch && !(await confirm({ title: 'Створити й запустити?', body: 'Агенти одразу почнуть працювати й витрачати кошти (Claude, Higgsfield).', confirmLabel: 'Запустити' }))) return;
    setBusy(true); setError('');
    try {
      const r = await applyTemplate({ payload: tpl.payload, project, name: name || undefined, email, launch });
      notify?.(`Створено «${r.campaign.name}»${launch ? ' і запущено' : ' (чернетка)'}. ${resultNote(r)}`.trim());
      onDone(r.campaign);
    } catch (e) { setError(e.message || 'Не вдалося створити.'); setBusy(false); }
  }
  async function remove(t) {
    if (!(await confirm({ title: `Видалити шаблон «${t.name}»?`, body: 'Створені з нього операції залишаться.', confirmLabel: 'Видалити' }))) return;
    try { await deleteTemplate(t.id); setTemplates((l) => l.filter((x) => x.id !== t.id)); if (tpl?.id === t.id) setTpl(null); } catch (e) { setError(e.message || 'Не вдалося видалити.'); }
  }
  return (
    <Shell title="Створити операцію з шаблону" onClose={onClose} busy={busy} wide
      footer={<><button type="button" className="cmp-btn" onClick={onClose} disabled={busy}>Скасувати</button>
        <button type="button" className="cmp-btn" disabled={!tpl || !project || busy} onClick={() => go(false)}>{busy ? '…' : 'Створити чернетку'}</button>
        <button type="button" className="cmp-btn cmp-btn--primary" disabled={!tpl || !project || busy} onClick={() => go(true)}>Створити й запустити</button></>}>
      {error && <p className="cmp-error" role="alert">{error}</p>}
      {templates === null && <p className="cmp-warnbox">Шаблони ще не підключені: потрібно застосувати міграцію <code>20261058_campaign_templates</code>.</p>}
      {templates === undefined && <p className="cmp-muted">Завантаження…</p>}
      {templates && !templates.length && <p className="cmp-muted">Шаблонів ще немає. Відкрийте налаштовану операцію й натисніть «Зберегти як шаблон».</p>}
      {templates && templates.length > 0 && (
        <div className="cod-cols">
          <div>
            <h3 className="ccx-sub">1. Шаблон</h3>
            <ul className="cod-tpls">{templates.map((t) => (
              <li key={t.id}><button type="button" className={'cmp-client' + (tpl?.id === t.id ? ' is-active' : '')} aria-pressed={tpl?.id === t.id} onClick={() => setTpl(t)}><span className="cmp-client-name">{t.name}</span><span className="cmp-client-sub">{t.description || info(t)}</span>{t.description && <span className="cmp-client-sub">{info(t)}</span>}</button>
                <button type="button" className="cmp-btn cmp-btn--danger cod-del" onClick={() => remove(t)} aria-label={`Видалити шаблон ${t.name}`}>×</button></li>
            ))}</ul>
          </div>
          <div>
            <h3 className="ccx-sub">2. Проєкт</h3>
            <ProjectPick clients={clients} value={project} onChange={(c) => { setProject(c); setName(''); }} />
            {project && <div className="cmp-field cod-fields"><label htmlFor="cod-n2">Назва (необовʼязково)</label><input id="cod-n2" className="cmp-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`${project.name} · …`} /></div>}
          </div>
        </div>
      )}
      {confirmDialog}
    </Shell>
  );
}

// «Календар»: every schedule of every running operation on one week, and what runs next.
export function CampaignCalendar({ campaigns = [], projects = [], onOpen }) {
  const [agents, setAgents] = useState(null);
  useEffect(() => {
    supabase.from('ag_agents').select('id, scope_id, role, name, enabled, config, schedule, sort, last_run_at, last_status').eq('team', 'campaign').not('schedule', 'is', null).then(({ data }) => setAgents(data || []));
  }, []);
  const cal = useMemo(() => buildCalendar({ agents: agents || [], campaigns, projects }), [agents, campaigns, projects]);
  if (agents === null) return <div className="ai-section-empty">Завантаження…</div>;
  return (
    <div className="cal">
      {!cal.total && <div className="ai-section-empty">Розкладу ще немає. Його задають у картці операції, блок «Керування операцією»: день і час для кожного агента.</div>}
      {cal.total > 0 && (
        <>
          <div className="cal-week" role="list" aria-label="Тиждень">
            {WEEKDAYS.map((d, i) => (
              <section key={d} className="cal-day" role="listitem" aria-label={d}>
                <h4>{d}</h4>
                {!cal.days[i].length && <span className="cmp-muted">—</span>}
                {cal.days[i].map((it, k) => (
                  <button key={k} type="button" className={'cal-item' + (it.paused ? ' is-paused' : '') + (it.mode === 'confirm' ? ' is-confirm' : '')} onClick={() => onOpen?.(it.campaignId)} title={`${it.campaign}: ${it.agent}`}>
                    <b>{it.time}</b><span>{it.agent}</span><small>{it.project || it.campaign}{it.paused ? ' · пауза' : it.mode === 'confirm' ? ' · з підтвердженням' : ''}</small>
                  </button>
                ))}
              </section>
            ))}
          </div>
          <h3 className="ccx-sub">Найближчі запуски</h3>
          <ul className="cal-next">{cal.upcoming.map((it, k) => <li key={k}><b>{fmtDateTime(it.nextAt)}</b><span>{it.agent}</span><small>{it.campaign}</small><button type="button" className="cmp-btn" onClick={() => onOpen?.(it.campaignId)}>Відкрити</button></li>)}</ul>
        </>
      )}
    </div>
  );
}
