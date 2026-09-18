import Select from '../../components/common/Select';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';

const SEARCH_ICON = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>';
const LIST_ICON = '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>';
const KANBAN_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="6" height="16" rx="1.5"/><rect x="10.5" y="4" width="6" height="10" rx="1.5"/><rect x="18" y="4" width="3" height="7" rx="1.5"/></svg>';
const CALENDAR_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>';

const SORT_OPTIONS = [
  { value: 'updated', label: 'За оновленням' },
  { value: 'date', label: 'За дедлайном' },
  { value: 'priority', label: 'За пріоритетом' },
  { value: 'created', label: 'За створенням' },
];

const VIEWS = [
  { key: 'list', label: 'Список', icon: LIST_ICON },
  { key: 'kanban', label: 'Канбан', icon: KANBAN_ICON },
  { key: 'calendar', label: 'Календар', icon: CALENDAR_ICON },
];

// Task Manager's toolbar row — view switch (список/канбан/календар) + sort
// + search + "+ Додати задачу", same building blocks as DealsListTab's own
// toolbar (.mc-client-search/Select, automationTasksPage.css). Kanban is
// disabled on "Всі задачі" (departmentId === null) since departments don't
// share one stage set — same rule the plan settled on for Deals-style boards.
export default function TaskToolbar({ view, onViewChange, kanbanDisabled, sortBy, onSortChange, search, onSearchChange, onAddTask }) {
  return (
    <div className="tm-toolbar">
      <div className="tm-view-switch">
        {VIEWS.map((v) => (
          <button
            type="button" key={v.key}
            className={'tm-view-btn' + (view === v.key ? ' active' : '')}
            disabled={v.key === 'kanban' && kanbanDisabled}
            title={v.key === 'kanban' && kanbanDisabled ? 'Оберіть відділ, щоб побачити канбан' : undefined}
            onClick={() => onViewChange(v.key)}
          >
            <span dangerouslySetInnerHTML={{ __html: v.icon }} /> {v.label}
          </button>
        ))}
      </div>
      <div className="mc-client-search">
        <span dangerouslySetInnerHTML={{ __html: SEARCH_ICON }} />
        <input type="text" value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Пошук задач..." />
      </div>
      <Select className="dash-period-select" value={sortBy} onChange={onSortChange} options={SORT_OPTIONS} />
      <span className="sp" />
      <button type="button" className="btn btn-p" onClick={onAddTask}>
        <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.plus }} /> Додати задачу
      </button>
    </div>
  );
}
