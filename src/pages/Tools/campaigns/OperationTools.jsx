import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ActionIcon from '../../../components/common/ActionIcon';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { useAuth } from '../../../contexts/AuthContext';
import useDialogA11y from '../../../lib/useDialogA11y';
import { fetchClientsForCampaigns } from '../../../lib/api/campaigns';
import { copyOperation, saveTemplate } from '../../../lib/api/campaignTemplates';
import { PLATFORMS } from '../../../lib/agents/campaignTeam';

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
