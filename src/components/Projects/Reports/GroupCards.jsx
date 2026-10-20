import { useState } from 'react';
import { groupCampaignKeys } from '../../../lib/campaignGroups';
import { platformInfo } from '../../../lib/adAccounts';

// The small boxes of the project's campaign groups. A box pressed turns purple-framed and shows its buttons under it; the group that is
// in the report carries «У звіті». Used on the page (choose / edit / delete) and in the groups window (edit / delete).
export function countOf(group, known) {
  if (known?.length) return groupCampaignKeys(group, known).length;
  return (group.campaigns || []).length || null;
}

const platformsOf = (group) => [...new Set((group.campaigns || []).map((k) => k.split('|')[0]))];

export function GroupCard({ title, count, platforms = [], active, focus, onPress, hint }) {
  return (
    <button type="button" className={'cg-card' + (active ? ' is-active' : '') + (focus ? ' is-focus' : '')} onClick={onPress} aria-pressed={!!focus}>
      <span className="cg-card-head"><b>{title}</b>{active && <em>У звіті</em>}</span>
      <span className="cg-card-meta">{hint || (count == null ? 'за словами' : `${count} ${count === 1 ? 'кампанія' : count > 1 && count < 5 ? 'кампанії' : 'кампаній'}`)}</span>
      {platforms.length > 0 && <span className="cg-card-plats">{platforms.map((p) => <i key={p}>{platformInfo(p).label}</i>)}</span>}
    </button>
  );
}

// The row of boxes with the buttons under the pressed one. `pick` adds «Вибрати»; the virtual «Усі кампанії» box (when `allCard`) has only that.
export default function GroupRow({ groups, known, activeId, onPick, onEdit, onDelete, onCreate, allCard = false, busy }) {
  const [focus, setFocus] = useState(null); // group id | 'all'
  const [confirming, setConfirming] = useState(false);
  const press = (id) => { setFocus((f) => (f === id ? null : id)); setConfirming(false); };
  return (
    <div className="cg-row" role="list">
      {allCard && (
        <div className="cg-col" role="listitem">
          <GroupCard title="Усі кампанії" hint="без групи" active={activeId == null} focus={focus === 'all'} onPress={() => press('all')} />
          {focus === 'all' && onPick && <div className="cg-actions"><button type="button" className="btn pw-btn--ok" disabled={activeId == null} onClick={() => onPick(null)}>{activeId == null ? 'Вибрано' : 'Вибрати'}</button></div>}
        </div>
      )}
      {groups.map((g) => (
        <div className="cg-col" key={g.id} role="listitem">
          <GroupCard title={g.name} count={countOf(g, known)} platforms={platformsOf(g)} active={activeId === g.id} focus={focus === g.id} onPress={() => press(g.id)} />
          {focus === g.id && !confirming && (
            <div className="cg-actions">
              {onPick && <button type="button" className="btn pw-btn--ok" disabled={activeId === g.id || busy} onClick={() => onPick(g.id)}>{activeId === g.id ? 'Вибрано' : 'Вибрати'}</button>}
              <button type="button" className="btn" disabled={busy} onClick={() => onEdit(g.id)}>Редагувати</button>
              <button type="button" className="btn cg-danger" disabled={busy} onClick={() => setConfirming(true)}>Видалити</button>
            </div>
          )}
          {focus === g.id && confirming && (
            <div className="cg-actions cg-confirm">
              <span>Видалити «{g.name}»?</span>
              <button type="button" className="btn pw-btn--bad" disabled={busy} onClick={async () => { await onDelete(g.id); setConfirming(false); setFocus(null); }}>Так, видалити</button>
              <button type="button" className="btn pw-btn--bad" onClick={() => setConfirming(false)}>Скасувати</button>
            </div>
          )}
        </div>
      ))}
      <div className="cg-col">
        <button type="button" className="cg-card cg-add" onClick={onCreate}><span aria-hidden="true">+</span>Створити групу</button>
      </div>
    </div>
  );
}
