import { useMemo, useState } from 'react';
import ActionIcon from '../../components/common/ActionIcon';
import { useConfirm } from '../../components/common/ConfirmDialog';
import { deletePost } from '../../lib/api/smm';
import { addDaysYmd, fmtDayShort, fmtRange, kyivTime, kyivYmd, mondayYmd, todayKyiv, weekDays } from '../../lib/smmDates';
import { NetworkBadge, StatusChip } from './smmCommon';

// The content plan: one week at a time, a card per post, the day it goes out above it.
export default function SmmPlan({ posts, onGenerate, onNew, onEdit, notify, reload }) {
  const [monday, setMonday] = useState(() => mondayYmd(todayKyiv()));
  const [confirm, confirmDialog] = useConfirm();
  const days = useMemo(() => weekDays(monday), [monday]);
  const byDay = useMemo(() => {
    const map = Object.fromEntries(days.map((d) => [d, []]));
    posts.forEach((p) => { const d = kyivYmd(p.scheduled_for); if (d && map[d]) map[d].push(p); });
    Object.values(map).forEach((list) => list.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for)));
    return map;
  }, [posts, days]);
  const unscheduled = posts.filter((p) => !p.scheduled_for && p.status !== 'rejected');
  const weekCount = days.reduce((s, d) => s + byDay[d].length, 0);
  const today = todayKyiv();

  async function remove(p) {
    if (!(await confirm({ title: 'Видалити пост?', body: `«${p.topic || 'Без теми'}» буде видалено без можливості відновлення.`, confirmLabel: 'Видалити', danger: true }))) return;
    try { await deletePost(p.id); notify('Пост видалено.'); reload(); } catch (e) { notify(e.message || 'Не вдалося видалити.', true); }
  }

  const Card = ({ p }) => (
    <article className="smm-post" onClick={() => onEdit(p)}>
      <header>
        <NetworkBadge platform={p.platform} />
        <StatusChip status={p.status} />
      </header>
      <h4>{p.topic || 'Без теми'}</h4>
      <p className="smm-post-body">{p.body}</p>
      <footer>
        <span>{p.scheduled_for ? kyivTime(p.scheduled_for) : 'Без дати'}{p.source === 'agent' ? ' · агент' : ''}</span>
        <span className="smm-post-actions">
          <button type="button" className="smm-icon-btn" onClick={(e) => { e.stopPropagation(); onEdit(p); }} aria-label={`Редагувати: ${p.topic || 'пост'}`}><ActionIcon name="edit" size={18} /></button>
          <button type="button" className="smm-icon-btn smm-icon-btn--danger" onClick={(e) => { e.stopPropagation(); remove(p); }} aria-label={`Видалити: ${p.topic || 'пост'}`}><ActionIcon name="delete" size={18} /></button>
        </span>
      </footer>
    </article>
  );

  return (
    <>
      <div className="smm-toolbar">
        <div className="smm-weeknav">
          <button type="button" className="smm-btn smm-btn--icon" onClick={() => setMonday(addDaysYmd(monday, -7))} aria-label="Попередній тиждень"><ActionIcon name="back" size={19} /></button>
          <strong>{fmtRange(monday)}</strong>
          <button type="button" className="smm-btn smm-btn--icon smm-flip" onClick={() => setMonday(addDaysYmd(monday, 7))} aria-label="Наступний тиждень"><ActionIcon name="back" size={19} /></button>
          {monday !== mondayYmd(today) && <button type="button" className="smm-btn" onClick={() => setMonday(mondayYmd(today))}>Цей тиждень</button>}
        </div>
        <div className="smm-toolbar-actions">
          <button type="button" className="smm-btn" onClick={onNew}><ActionIcon name="create" size={18} />Додати пост</button>
          <button type="button" className="smm-btn smm-btn--primary" onClick={onGenerate}><ActionIcon name="generate" size={18} />План від стратега</button>
        </div>
      </div>
      <p className="smm-muted">Постів на тижні: {weekCount}. Час вказано за Києвом.</p>

      <div className="smm-week">
        {days.map((d) => (
          <section key={d} className={'smm-day' + (d === today ? ' is-today' : '')} aria-label={fmtDayShort(d)}>
            <h3>{fmtDayShort(d)}{d === today && <em>сьогодні</em>}</h3>
            {byDay[d].length ? byDay[d].map((p) => <Card key={p.id} p={p} />) : <p className="smm-empty">Порожньо</p>}
          </section>
        ))}
      </div>

      {unscheduled.length > 0 && (
        <section className="smm-block">
          <h3>Без дати <span className="smm-count-pill">{unscheduled.length}</span></h3>
          <div className="smm-cards">{unscheduled.map((p) => <Card key={p.id} p={p} />)}</div>
        </section>
      )}
      {confirmDialog}
    </>
  );
}
