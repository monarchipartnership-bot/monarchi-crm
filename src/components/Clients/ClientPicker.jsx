import { useEffect, useRef, useState } from 'react';
import { fetchClientDirectory, upsertClientDirectoryEntry } from '../../lib/api/clients';
import { CLIENT_PLATFORMS, CLIENT_TYPES } from '../../lib/reportConstants';

// Search-and-pick dropdown over the already-small client directory — filters
// client-side rather than querying per keystroke. `value` is the selected
// client's id; `onChange(client)` fires with the full row (or null on clear).
// `defaultPlatform` pre-fills the inline "create new client" form's platform
// select (e.g. with whatever Pipeline the caller currently has chosen, since
// pipeline names match CLIENT_PLATFORMS).
export default function ClientPicker({ value, onChange, placeholder = 'Пошук клієнта...', defaultPlatform }) {
  const [clients, setClients] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPlatform, setNewPlatform] = useState(defaultPlatform || CLIENT_PLATFORMS[0]);
  const [newType, setNewType] = useState(CLIENT_TYPES[0]);
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef(null);

  function reloadClients() {
    return fetchClientDirectory().then(setClients);
  }

  useEffect(() => { reloadClients(); }, []);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setCreating(false); }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const selected = clients.find((c) => c.id === value);
  const q = query.trim().toLowerCase();
  const results = q
    ? clients.filter((c) => c.name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q)).slice(0, 20)
    : clients.slice(0, 20);

  function pick(client) {
    onChange(client);
    setQuery('');
    setOpen(false);
  }

  function openCreate() {
    setNewName(query.trim());
    setNewPlatform(defaultPlatform || CLIENT_PLATFORMS[0]);
    setNewType(CLIENT_TYPES[0]);
    setCreating(true);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const client = await upsertClientDirectoryEntry({ name, platform: newPlatform, leadType: newType });
      if (client) {
        await reloadClients();
        pick(client);
      }
      setCreating(false);
    } catch (e) {
      alert('Помилка створення клієнта: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="client-picker" ref={wrapRef}>
      {selected && !open ? (
        <button type="button" className="client-picker-selected" onClick={() => setOpen(true)}>
          {selected.name}{selected.company ? ` (${selected.company})` : ''}
          <span className="client-picker-change">Змінити</span>
        </button>
      ) : (
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />
      )}
      {open && !creating && (
        <div className="client-picker-list">
          {results.length === 0 ? (
            <div className="client-picker-empty">Нічого не знайдено.</div>
          ) : results.map((c) => (
            <button type="button" key={c.id} className="client-picker-item" onClick={() => pick(c)}>
              {c.name}{c.company ? <span className="hint"> · {c.company}</span> : ''}
            </button>
          ))}
          <button type="button" className="client-picker-item client-picker-create" onClick={openCreate}>
            + Створити клієнта{query.trim() ? ` «${query.trim()}»` : ''}
          </button>
        </div>
      )}
      {open && creating && (
        <div className="client-picker-list client-picker-create-form">
          <div className="task-filter-row">
            <label>Ім'я</label>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ім'я клієнта" autoFocus />
          </div>
          <div className="task-filter-row">
            <label>Платформа</label>
            <select value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)}>
              {CLIENT_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="task-filter-row">
            <label>Тип</label>
            <select value={newType} onChange={(e) => setNewType(e.target.value)}>
              {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="client-picker-create-actions">
            <button type="button" className="btn" onClick={() => setCreating(false)}>Назад</button>
            <button type="button" className="btn btn-p" onClick={handleCreate} disabled={!newName.trim() || saving}>
              {saving ? '...' : 'Створити'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
