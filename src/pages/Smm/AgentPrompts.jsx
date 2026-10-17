import { useEffect, useState } from 'react';
import ActionIcon from '../../components/common/ActionIcon';
import { useConfirm } from '../../components/common/ConfirmDialog';
import { useAuth } from '../../contexts/AuthContext';
import { createPrompt, deletePrompt, fetchPromptVersions, savePrompt, setDefaultPrompt } from '../../lib/api/agents';
import { campaignLockedText, lockedText, ROLES_WITH_LOCKED_PROMPT } from '../../lib/agents/locked';
import { fmtDateTime } from './agentUi';

// The prompt library of one agent: several named prompts (for a client, a process, a style), one of them the main one.
// Every save of a changed text is a new version; any version can be restored. The locked rules are shown read-only.
export default function AgentPrompts({ agent, prompts, reload, notify }) {
  const { email } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const [selectedId, setSelectedId] = useState(null);
  const selected = prompts.find((p) => p.id === selectedId) || prompts.find((p) => p.is_default) || prompts[0] || null;
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [note, setNote] = useState('');
  const [versions, setVersions] = useState([]);
  const [viewVersion, setViewVersion] = useState(null);
  const [showLocked, setShowLocked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (selected) { setName(selected.name); setBody(selected.body); setNote(''); setViewVersion(null); } }, [selected?.id, selected?.current_version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selected) fetchPromptVersions(selected.id).then(setVersions).catch(() => setVersions([])); else setVersions([]); }, [selected?.id, selected?.current_version]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = selected && (name !== selected.name || body !== selected.body);
  const locked = agent.team === 'campaign' ? campaignLockedText() : ROLES_WITH_LOCKED_PROMPT.includes(agent.role) ? lockedText(agent.role) : '';

  async function run(fn, okText) {
    setBusy(true);
    try { await fn(); await reload(); if (okText) notify(okText); } catch (e) { notify(e.message || 'Не вдалося виконати.', true); } finally { setBusy(false); }
  }
  const save = () => run(() => savePrompt(selected, { name, body, note }, email), body !== selected.body ? `Збережено як версія ${selected.current_version + 1}.` : 'Назву збережено.');
  const makeDefault = () => run(() => setDefaultPrompt(agent.id, selected.id), 'Цей промт тепер основний.');
  const duplicate = () => run(async () => { const p = await createPrompt(agent.id, { name: `${name} (копія)`, body, note: 'Копія для іншого клієнта чи процесу' }, email); setSelectedId(p.id); }, 'Копію створено: перейменуйте її та відредагуйте.');
  const restore = (v) => run(async () => { setBody(v.body); await savePrompt(selected, { name, body: v.body, note: `Відновлено версію ${v.version}` }, email); }, `Версію ${v.version} відновлено як нову.`);
  async function remove() {
    if (prompts.length < 2) { notify('Єдиний промт агента видалити не можна.', true); return; }
    if (!(await confirm({ title: `Видалити промт «${selected.name}»?`, body: 'Усі його версії буде видалено. Завдання, що вже виконані, збережуть свою історію.', confirmLabel: 'Видалити', danger: true }))) return;
    await run(async () => { await deletePrompt(selected.id); if (selected.is_default) { const other = prompts.find((p) => p.id !== selected.id); if (other) await setDefaultPrompt(agent.id, other.id); } setSelectedId(null); }, 'Промт видалено.');
  }
  async function create() {
    await run(async () => { const p = await createPrompt(agent.id, { name: 'Новий промт', body: selected?.body || '', note: 'Створено вручну' }, email); setSelectedId(p.id); }, 'Новий промт створено.');
  }

  if (!selected) return <p className="smm-muted">У агента ще немає промту. <button type="button" className="smm-btn" onClick={create}>Створити</button></p>;
  return (
    <div className="smm-prompts">
      <aside className="smm-plist" aria-label="Промти агента">
        <ul>
          {prompts.map((p) => (
            <li key={p.id}>
              <button type="button" className={'smm-pitem' + (p.id === selected.id ? ' is-active' : '')} onClick={() => setSelectedId(p.id)}>
                <span className="smm-pitem-name">{p.name}</span>
                <span className="smm-pitem-meta">{p.is_default ? 'основний · ' : ''}версія {p.current_version}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="smm-btn" onClick={create} disabled={busy}><ActionIcon name="create" size={18} />Новий промт</button>
      </aside>

      <section className="smm-peditor">
        <div className="smm-field"><label htmlFor="ag-pname">Назва (наприклад, клієнт чи процес)</label><input id="ag-pname" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></div>
        <div className="smm-field">
          <label htmlFor="ag-pbody">Інструкція агенту <span className="smm-muted">(редагована частина)</span></label>
          <textarea id="ag-pbody" className="smm-pbody" rows={16} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="smm-field"><label htmlFor="ag-pnote">Що змінили (для історії версій)</label><input id="ag-pnote" type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Необовʼязково" /></div>
        <div className="smm-form-foot">
          <button type="button" className="smm-btn smm-btn--primary" onClick={save} disabled={busy || !dirty}><ActionIcon name="save" size={18} />{busy ? 'Зберігаємо…' : 'Зберегти'}</button>
          {!selected.is_default && <button type="button" className="smm-btn" onClick={makeDefault} disabled={busy}>Зробити основним</button>}
          <button type="button" className="smm-btn" onClick={duplicate} disabled={busy}><ActionIcon name="copy" size={18} />Дублювати</button>
          <button type="button" className="smm-btn smm-btn--danger" onClick={remove} disabled={busy}>Видалити</button>
          {dirty && <span className="smm-muted">Є незбережені зміни</span>}
        </div>

        {locked ? (
          <details className="smm-locked" open={showLocked} onToggle={(e) => setShowLocked(e.currentTarget.open)}>
            <summary>Закриті правила, що додаються до кожного запиту (не редагуються)</summary>
            <pre>{locked}</pre>
            <p className="smm-hint">Це правила безпеки бренду й формат відповіді, на який спираються наступні агенти. Бренд-профіль і дані завдання додаються автоматично.</p>
          </details>
        ) : (
          <p className="smm-hint">Цей текст додається перед вбудованою інструкцією агента як додаткові вказівки; правила безпеки й формат відповіді закриті.</p>
        )}

        <section className="smm-block">
          <h3>Версії промту</h3>
          <ul className="smm-versions">
            {versions.map((v) => (
              <li key={v.id} className={v.version === selected.current_version ? 'is-current' : ''}>
                <span className="smm-ver-no">v{v.version}</span>
                <span className="smm-ver-meta">{fmtDateTime(v.created_at)}{v.created_by ? ` · ${v.created_by}` : ''}{v.note ? ` · ${v.note}` : ''}</span>
                <button type="button" className="smm-link-btn" onClick={() => setViewVersion(viewVersion?.id === v.id ? null : v)}>{viewVersion?.id === v.id ? 'Сховати' : 'Показати'}</button>
                {v.version !== selected.current_version && <button type="button" className="smm-link-btn" onClick={() => restore(v)} disabled={busy}>Відновити</button>}
                {viewVersion?.id === v.id && <pre className="smm-ver-body">{v.body}</pre>}
              </li>
            ))}
          </ul>
        </section>
      </section>
      {confirmDialog}
    </div>
  );
}
