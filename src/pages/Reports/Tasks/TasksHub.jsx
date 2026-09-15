import HubCard from '../../../components/Reports/HubCard';
import { SECTION_ICONS } from '../../../lib/reportIcons';
import { FIELD_ICONS } from '../../../lib/taskFieldIcons';
import '../../../styles/reportPage.css';
import '../../../styles/hubPage.css';

export default function TasksHub() {
  return (
    <div className="report-page">
      <section className="rpt-hero">
        <div className="rpt-hero-heading">
          <span className="rpt-hero-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Задачі'] }} />
          <h1>Task Manager</h1>
        </div>
        <p className="sub">Оберіть рівень планування задач лідогенератора.</p>
      </section>

      <div className="hub-grid">
        <HubCard
          icon={FIELD_ICONS.day}
          title="Daily Tasks"
          desc="Задачі на конкретний день — виконання, перенесення, скасування."
          to="/reports/tasks/daily"
        />
        <HubCard
          icon={FIELD_ICONS.repeat}
          title="Weekly Tasks"
          desc="Тижневе планування — розподіл по днях, підзадачі, пріоритет."
          to="/reports/tasks/weekly"
        />
        <HubCard
          icon={SECTION_ICONS['Місяці']}
          title="Monthly Tasks"
          desc="Зведення всіх задач лідогенератора за місяць."
          to="/reports/tasks/monthly"
        />
      </div>
    </div>
  );
}
