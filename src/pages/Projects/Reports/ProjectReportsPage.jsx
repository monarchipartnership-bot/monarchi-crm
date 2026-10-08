import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ProjectPicker from '../../../components/Projects/ProjectPicker';
import PeriodStats from '../../../components/Projects/Reports/PeriodStats';
import PeriodReport from '../../../components/Projects/Reports/PeriodReport';
import '../../../styles/reportPage.css';
import '../../../styles/projectReportPage.css';
import '../../../styles/projectReports.css';

const TITLES = { period: 'Показники за період', weekly: 'Тижневий звіт', monthly: 'Місячний звіт' };
const DESCS = {
  period: 'Оберіть проєкт і будь-який період: цифри підтягнуться з рекламних кабінетів у таблицю, яку можна завантажити.',
  weekly: 'Оберіть проєкт, щоб сформувати тижневий звіт: цифри з кабінетів, порівняння з минулим тижнем і текст.',
  monthly: 'Оберіть проєкт, щоб сформувати місячний звіт: цифри з кабінетів, порівняння з минулим місяцем і текст.',
};

// The three project report screens as standalone pages (with a project picker).
// Inside a project they are tabs — see ProjectDetail.
export default function ProjectReportsPage({ mode }) {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState(null);

  return (
    <div className="report-page ad-report-page">
      <div className="page-actions">
        <button type="button" className="btn" onClick={() => navigate(-1)}>&#8592; Back</button>
      </div>

      <section className="rpt-hero">
        <h1>{TITLES[mode]}</h1>
        <p className="sub">{DESCS[mode]}</p>
      </section>

      <div className="picker">
        <ProjectPicker value={projectId} onChange={setProjectId} />
      </div>

      {!projectId && <div className="empty-hint">Оберіть проєкт вище, щоб продовжити.</div>}
      {projectId && mode === 'period' && <PeriodStats key={'p' + projectId} projectId={projectId} />}
      {projectId && mode === 'weekly' && <PeriodReport key={'w' + projectId} projectId={projectId} periodType="weekly" />}
      {projectId && mode === 'monthly' && <PeriodReport key={'m' + projectId} projectId={projectId} periodType="monthly" />}
    </div>
  );
}
