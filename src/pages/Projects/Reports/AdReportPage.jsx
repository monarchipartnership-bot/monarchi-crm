import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ProjectPicker from '../../../components/Projects/ProjectPicker';
import AdReportForm from '../../../components/Projects/AdReportForm';
import '../../../styles/reportPage.css';
import '../../../styles/projectReportPage.css';

const TITLES = { daily: 'Daily Report', weekly: 'Weekly Report', monthly: 'Monthly Report' };
const DESCS = {
  daily: 'Оберіть проєкт, щоб внести або переглянути щоденний звіт по рекламі.',
  weekly: 'Оберіть проєкт, щоб внести або переглянути тижневий звіт по рекламі.',
  monthly: 'Оберіть проєкт, щоб внести або переглянути місячний звіт по рекламі.',
};

export default function AdReportPage({ periodType }) {
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState(null);

  return (
    <div className="report-page ad-report-page">
      <div className="page-actions">
        <button type="button" className="btn" onClick={() => navigate(-1)}>&#8592; Back</button>
      </div>

      <section className="rpt-hero">
        <h1>{TITLES[periodType]}</h1>
        <p className="sub">{DESCS[periodType]}</p>
      </section>

      <div className="picker">
        <ProjectPicker value={projectId} onChange={setProjectId} />
      </div>

      {projectId ? (
        <AdReportForm key={projectId} projectId={projectId} periodType={periodType} />
      ) : (
        <div className="empty-hint">Оберіть проєкт вище, щоб побачити звіт.</div>
      )}
    </div>
  );
}
