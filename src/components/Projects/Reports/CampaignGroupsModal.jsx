import { useEffect, useMemo, useRef, useState } from 'react';
import useDialogA11y from '../../../lib/useDialogA11y';
import { createCampaignGroup, deleteCampaignGroup, updateCampaignGroup } from '../../../lib/api/projectReportStore';
import { fetchProjectCampaigns } from '../../../lib/periodReport';
import { campaignKey, filterCampaigns, groupCampaignKeys, mergeCampaigns } from '../../../lib/campaignGroups';
import { platformInfo } from '../../../lib/adAccounts';
import GroupRow from './GroupCards';
import '../../../styles/projectReports.css';

const fromKey = (k) => { const i = k.indexOf('|'); return { platform: k.slice(0, i), name: k.slice(i + 1) }; };

// «Групи кампаній»: the groups of the project as small boxes (or «Пусто»), «Створити групу» opens the form: a name of your own and any number of
// the campaigns of ONE platform (`platform` = the tab it is opened from: its groups, its campaigns). `startEdit` = a group id or 'new' to
// open straight in the form (from the buttons of the page).
export default function CampaignGroupsModal({ projectId, platform, groups, accounts, kind, knownCampaigns, startEdit = null, onClose, onChanged }) {
  const box = useRef(null);
  useDialogA11y(box, onClose);
  const [view, setView] = useState(startEdit ? 'form' : 'list');
  const [editId, setEditId] = useState(startEdit && startEdit !== 'new' ? startEdit : null);
  const editing = groups.find((g) => g.id === editId) || null;
  const [name, setName] = useState('');
  const [picked, setPicked] = useState(new Set());
  const [query, setQuery] = useState('');
  const [fetched, setFetched] = useState(null); // null = loading, [] = loaded
  const [loadErrors, setLoadErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const initialised = useRef(false);

  // The project's campaigns: what is on screen + a fresh look at the last 90 days, so the form never depends on a report being open.
  useEffect(() => {
    if (view !== 'form' || fetched) return undefined;
    let cancelled = false;
    fetchProjectCampaigns(accounts, kind).then((r) => { if (!cancelled) { setFetched(r.campaigns); setLoadErrors(r.errors); } }).catch((e) => { if (!cancelled) { setFetched([]); setLoadErrors({ '': e.message }); } });
    return () => { cancelled = true; };
  }, [view, fetched, accounts, kind]);

  // campaigns already in the group but quiet for 90 days still show (and stay) in the list
  const all = useMemo(() => {
    const own = (editing?.campaigns || []).map(fromKey).filter((c) => c.platform === platform);
    return mergeCampaigns(knownCampaigns || [], fetched || [], own);
  }, [knownCampaigns, fetched, editing, platform]);

  useEffect(() => {
    if (view !== 'form' || fetched === null || initialised.current) return;
    initialised.current = true;
    setName(editing ? editing.name : '');
    setPicked(new Set(editing ? [...groupCampaignKeys(editing, all), ...(editing.campaigns || [])].filter((k) => k.startsWith(platform + '|')) : []));
  }, [view, fetched, editing, all]);

  const shown = useMemo(() => filterCampaigns(all, query), [all, query]);
  const toggle = (k) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const allShownPicked = shown.length > 0 && shown.every((c) => picked.has(campaignKey(c.platform, c.name)));

  const openForm = (id) => { initialised.current = false; setEditId(id); setName(''); setPicked(new Set()); setQuery(''); setError(''); setView('form'); };
  async function changed() { await onChanged(); }

  async function save() {
    if (!name.trim()) { setError('Вкажіть назву групи.'); return; }
    if (!picked.size) { setError('Оберіть хоча б одну кампанію.'); return; }
    setSaving(true); setError('');
    try {
      const body = { name, platform, campaigns: [...picked].filter((k) => k.startsWith(platform + '|')) };
      if (editing) await updateCampaignGroup(editing.id, body); else await createCampaignGroup(projectId, body);
      await changed();
      if (startEdit) onClose(); else { setView('list'); setEditId(null); }
    } catch (e) { setError(e.message || 'Не вдалося зберегти групу.'); } finally { setSaving(false); }
  }
  async function remove(id) { try { await deleteCampaignGroup(id); await changed(); } catch (e) { setError(e.message || 'Не вдалося видалити.'); } }

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} tabIndex={-1} className="modal-box prep-modal" role="dialog" aria-modal="true" aria-labelledby="cg-title">
        <div className="modal-head">
          <h3 id="cg-title">{view === 'list' ? `Групи кампаній · ${platformInfo(platform).label}` : editing ? 'Редагувати групу' : `Нова група · ${platformInfo(platform).label}`}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрити">&times;</button>
        </div>
        <div className="modal-body">
          {view === 'list' && (
            <>
              {groups.length === 0 && <div className="cg-empty">Пусто. Додайте першу групу: оберіть кампанії {platformInfo(platform).label}, які мають йти в звіт разом.</div>}
              <GroupRow groups={groups} known={knownCampaigns} activeId={undefined} onEdit={openForm} onDelete={remove} onCreate={() => openForm(null)} />
              <div className="pacc-hint">Група це кампанії, які ви обрали самі. Обравши групу на сторінці звіту, ви побачите цифри саме по цих кампаніях.</div>
            </>
          )}
          {view === 'form' && (
            <div className="cg-form">
              <div className="pk-field"><label htmlFor="cg-name">Назва групи</label><input id="cg-name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Наприклад: Каталог, Кінкі Бенг, Сезонні" /></div>
              <div className="cg-pick">
                <div className="cg-pick-bar">
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пошук кампанії" aria-label="Пошук кампанії" />
                  <button type="button" className="btn" disabled={!shown.length} onClick={() => setPicked((s) => { const n = new Set(s); shown.forEach((c) => { const k = campaignKey(c.platform, c.name); if (allShownPicked) n.delete(k); else n.add(k); }); return n; })}>{allShownPicked ? 'Зняти всі' : 'Обрати всі'}{query ? ' знайдені' : ''}</button>
                  <span className="cg-pick-count">Обрано: <b>{picked.size}</b></span>
                </div>
                {fetched === null && <div className="pacc-hint">Завантажуємо кампанії {platformInfo(platform).label} за останні 90 днів…</div>}
                {Object.entries(loadErrors).map(([p, m]) => <div className="pacc-err" key={p}>{p ? platformInfo(p).label + ': ' : ''}{m}</div>)}
                {fetched !== null && all.length === 0 && <div className="pacc-hint">Кампаній не знайдено: у кабінеті {platformInfo(platform).label} немає активності за 90 днів.</div>}
                <div className="cg-list">
                  {shown.map((c) => {
                    const k = campaignKey(c.platform, c.name);
                    return (
                      <label key={k} className={'cg-item' + (picked.has(k) ? ' on' : '')}>
                        <input type="checkbox" checked={picked.has(k)} onChange={() => toggle(k)} />
                        <span className="cg-item-name">{c.name}</span>
                        <span className="cg-item-meta">{platformInfo(c.platform).label}{c.spend ? ` · ${Math.round(c.spend).toLocaleString('uk-UA')}` : ''}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {editing && (editing.keywords || []).length > 0 && <div className="pacc-hint">Ця група була задана словами ({editing.keywords.join(', ')}). Позначені кампанії це те, що вона охоплює зараз: після збереження група стане постійним списком.</div>}
            </div>
          )}
          {error && <div className="form-err">{error}</div>}
        </div>
        <div className="modal-foot">
          {view === 'list' && <button type="button" className="btn" onClick={onClose}>Закрити</button>}
          {view === 'form' && (
            <>
              <button type="button" className="btn pw-btn--bad" onClick={() => (startEdit ? onClose() : (setView('list'), setEditId(null), setError('')))}>Скасувати</button>
              <button type="button" className="btn pw-btn--ok" disabled={saving || !name.trim() || !picked.size} onClick={save}>{saving ? 'Зберігаємо…' : 'Зберегти групу'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
