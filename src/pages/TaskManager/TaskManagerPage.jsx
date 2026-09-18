import { useEffect, useMemo, useState } from 'react';
import { fetchDepartments } from '../../lib/api/departments';
import { fetchTaskStages } from '../../lib/api/taskStages';
import { fetchTaskCategories } from '../../lib/api/taskCategories';
import { fetchTasksForDepartment } from '../../lib/api/tasks';
import DepartmentTabs from './DepartmentTabs';
import TaskStatsRow from './TaskStatsRow';
import TaskToolbar from './TaskToolbar';
import TaskListView from './TaskListView';
import TaskKanbanView from './TaskKanbanView';
import TaskCalendarView from './TaskCalendarView';
import TaskFormModal from './TaskFormModal';
import TaskStageManagerModal from './TaskStageManagerModal';
import '../../styles/reportPage.css';
import '../../styles/automationTasksPage.css';
import '../../styles/automationDashboard.css';
import '../../styles/dealsBoard.css';
import '../../styles/taskManagerPage.css';

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

// Task Manager — единый внутренний задачник по всей платформе. Container:
// resolves the active department (null = "Всі задачі"), fetches that
// scope's tasks + stages + categories, and hands them down to whichever
// view (список/канбан/календар) is currently selected. Kanban only ever
// renders for one concrete department, since each owns its own stage set.
export default function TaskManagerPage() {
  const [departments, setDepartments] = useState([]);
  const [activeDepartmentId, setActiveDepartmentId] = useState(null);
  const [stages, setStages] = useState([]);
  const [categoriesByDept, setCategoriesByDept] = useState({});
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [sortBy, setSortBy] = useState('updated');
  const [search, setSearch] = useState('');
  const [formModal, setFormModal] = useState(null); // null closed, 'new', or a task row (edit)
  const [formDefaultStageId, setFormDefaultStageId] = useState(null);
  const [stageManagerOpen, setStageManagerOpen] = useState(false);

  function reloadDepartments() {
    return fetchDepartments().then(setDepartments);
  }

  useEffect(() => { reloadDepartments(); }, []);

  function reload() {
    const deptScope = activeDepartmentId ? [activeDepartmentId] : departments.map((d) => d.id);
    setLoading(true);
    Promise.all([
      fetchTasksForDepartment(activeDepartmentId),
      Promise.all(deptScope.map((id) => fetchTaskStages(id))),
      Promise.all(deptScope.map((id) => fetchTaskCategories(id).then((cats) => [id, cats]))),
    ]).then(([t, stageLists, catPairs]) => {
      setTasks(t);
      setStages(stageLists.flat());
      setCategoriesByDept(Object.fromEntries(catPairs));
    }).finally(() => setLoading(false));
  }

  useEffect(() => {
    // "Всі задачі" needs the department list first to know which
    // departments' stages/categories to pull — skip until it's arrived.
    if (activeDepartmentId === null && departments.length === 0) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDepartmentId, departments]);

  // Kanban only makes sense for one concrete department (each has its own
  // stage set) — bounce back to the list if "Всі задачі" gets selected
  // while it was open.
  useEffect(() => {
    if (activeDepartmentId === null && view === 'kanban') setView('list');
  }, [activeDepartmentId, view]);

  const stagesById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages]);
  const departmentsById = useMemo(() => Object.fromEntries(departments.map((d) => [d.id, d])), [departments]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q ? tasks.filter((t) => t.text?.toLowerCase().includes(q)) : tasks;
    list = [...list].sort((a, b) => {
      if (sortBy === 'date') return (a.task_date || '9999-99-99').localeCompare(b.task_date || '9999-99-99');
      if (sortBy === 'priority') return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
      if (sortBy === 'created') return new Date(b.created_at) - new Date(a.created_at);
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    });
    return list;
  }, [tasks, search, sortBy]);

  function openAddTask(stageId) {
    setFormDefaultStageId(stageId || null);
    setFormModal('new');
  }

  return (
    <div className="report-page">
      <DepartmentTabs departments={departments} activeDepartmentId={activeDepartmentId} onSelect={setActiveDepartmentId} onChanged={reloadDepartments} />

      <TaskStatsRow tasks={tasks} stagesById={stagesById} />

      <TaskToolbar
        view={view} onViewChange={setView} kanbanDisabled={activeDepartmentId === null}
        sortBy={sortBy} onSortChange={setSortBy} search={search} onSearchChange={setSearch}
        onAddTask={() => openAddTask(null)}
      />

      {loading ? (
        <div className="empty-hint">Завантаження...</div>
      ) : view === 'kanban' && activeDepartmentId !== null ? (
        <TaskKanbanView
          tasks={filteredTasks} stages={stages} categories={categoriesByDept[activeDepartmentId] || []}
          reload={reload}
          onAddTask={openAddTask}
          onManageStages={() => setStageManagerOpen(true)}
          onViewTask={(t) => setFormModal(t)}
        />
      ) : view === 'calendar' ? (
        <TaskCalendarView tasks={filteredTasks} stagesById={stagesById} onEditTask={(t) => setFormModal(t)} />
      ) : (
        <TaskListView
          tasks={filteredTasks} stagesById={stagesById} departmentsById={departmentsById}
          categoriesByDept={categoriesByDept} showDepartment={activeDepartmentId === null}
          onEdit={(t) => setFormModal(t)} reload={reload}
        />
      )}

      {formModal && (
        <TaskFormModal
          initial={formModal === 'new' ? null : formModal}
          departments={departments}
          defaultDepartmentId={activeDepartmentId || departments[0]?.id}
          defaultStageId={formDefaultStageId}
          onClose={() => setFormModal(null)}
          onSaved={reload}
        />
      )}

      {stageManagerOpen && activeDepartmentId !== null && (
        <TaskStageManagerModal
          departmentId={activeDepartmentId}
          departmentName={departmentsById[activeDepartmentId]?.name}
          stages={stages}
          onClose={() => setStageManagerOpen(false)}
          onChanged={async () => reload()}
        />
      )}
    </div>
  );
}
