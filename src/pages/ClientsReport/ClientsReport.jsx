import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { initClientsReport } from './clientsReportEngine';
import { fetchProjects } from '../../lib/api/projects';
import { fetchProjectWeeklyReport, fetchProjectMonthlyReport } from '../../lib/api/projectReports';
import { deriveRatios } from '../../lib/adCsvImport';
import { computeWeeksForMonth, defaultWeekIndexFor, yearOptions, isoDate, fmtDate, MONTH_NAMES } from '../../lib/dateHelpers';
import '../../styles/clientsReportPage.css';

function money(v) { return '$' + (Number(v) || 0).toFixed(2); }
function num(v) { return String(Math.round(Number(v) || 0)); }
function metricRow(label, value) { return { label, value, delta: '', campaigns: [] }; }

function buildMetricsFromReportData(data) {
  const r = deriveRatios(data);
  return [
    metricRow('Spend', money(data.spend)),
    metricRow('Impressions', num(data.impressions)),
    metricRow('Reach', num(data.reach)),
    metricRow('Clicks', num(data.clicks)),
    metricRow('Purchases', num(data.purchases)),
    metricRow('Revenue', money(data.revenue)),
    metricRow('CTR', r.ctr === null ? '—' : r.ctr.toFixed(2) + '%'),
    metricRow('CPC', r.cpc === null ? '—' : money(r.cpc)),
    metricRow('CPM', r.cpm === null ? '—' : money(r.cpm)),
    metricRow('ROAS', r.roas === null ? '—' : r.roas.toFixed(2) + 'x'),
    metricRow('ROMI', r.romi === null ? '—' : r.romi.toFixed(1) + '%'),
  ];
}

function buildSectionsFromReportData(data) {
  const toLines = (arr) => (arr || []).map((it) => it.text).filter((t) => t && t.trim());
  return {
    whatWasDone: toLines(data.whatWasDone),
    mostEffective: toLines(data.mostEffective),
    conclusion: toLines(data.conclusion),
    plansNext: toLines(data.plansNext),
    whatWorked: toLines(data.whatWorked),
    whatDidntWork: toLines(data.whatDidntWork),
  };
}

// Slide-deck builder for client reports (report type + CSV/SEO text input, 9 color
// themes, 5 visual templates, ~9 slide types, drag-and-drop slide list, inline
// contenteditable slide editing, PDF export). The DOM below matches the element ids
// clientsReportEngine.js expects exactly; the engine (ported from clients_report.html)
// does all the parsing, slide building, state, and event wiring once mounted.
//
// The "Проєкт / Період" block at the top additionally lets a PM pull an
// already-saved project ad-report (built in the Project Managers Department's
// Daily/Weekly/Monthly Report pages) straight into the deck, instead of
// exporting+uploading a CSV — see handlePullReport / engineApi.current.
function initialPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return { year, month, weekIndex: defaultWeekIndexFor(computeWeeksForMonth(year, month)) };
}

export default function ClientsReport() {
  const navigate = useNavigate();
  const engineApi = useRef({});

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [periodType, setPeriodType] = useState('weekly');
  const [period, setPeriod] = useState(initialPeriod);
  const [platform, setPlatform] = useState('meta');
  const [pulling, setPulling] = useState(false);

  useEffect(() => {
    return initClientsReport(engineApi.current);
  }, []);

  useEffect(() => {
    fetchProjects().then(setProjects).catch((e) => console.warn('fetchProjects failed', e));
  }, []);

  // Weeks are always weeks *of the picked month* (computeWeeksForMonth),
  // matching the WeekPicker convention used everywhere else in the app —
  // switching the month changes which weeks are even selectable.
  const weeks = periodType === 'weekly' ? computeWeeksForMonth(period.year, period.month) : null;
  const currentWeek = weeks ? (weeks.find((w) => w.index === period.weekIndex) || weeks[0]) : null;

  function handleYear(y) {
    const dim = computeWeeksForMonth(y, period.month).length;
    setPeriod((p) => ({ ...p, year: y, weekIndex: Math.min(p.weekIndex, dim) }));
  }
  function handleMonth(m) {
    const dim = computeWeeksForMonth(period.year, m).length;
    setPeriod((p) => ({ ...p, month: m, weekIndex: Math.min(p.weekIndex, dim) }));
  }
  function handleWeekIndex(wi) {
    setPeriod((p) => ({ ...p, weekIndex: wi }));
  }

  async function handlePullReport() {
    if (!projectId) return;
    setPulling(true);
    try {
      let row, periodLabel;
      if (periodType === 'weekly') {
        if (!currentWeek) return;
        const startIso = isoDate(currentWeek.start.getFullYear(), currentWeek.start.getMonth() + 1, currentWeek.start.getDate());
        periodLabel = `${fmtDate(currentWeek.start.getFullYear(), currentWeek.start.getMonth() + 1, currentWeek.start.getDate())} – ${fmtDate(currentWeek.end.getFullYear(), currentWeek.end.getMonth() + 1, currentWeek.end.getDate())}`;
        row = await fetchProjectWeeklyReport(projectId, startIso, platform);
      } else {
        const monthStartIso = isoDate(period.year, period.month, 1);
        periodLabel = `${MONTH_NAMES[period.month - 1]} ${period.year}`;
        row = await fetchProjectMonthlyReport(projectId, monthStartIso, platform);
      }
      if (!row) {
        alert('Звіт за цей період і платформу ще не збережено для цього проєкту.');
        return;
      }
      const project = projects.find((p) => String(p.id) === String(projectId));
      const applied = engineApi.current.loadFromProjectReport?.({
        clientName: project?.name || '',
        periodText: periodLabel,
        metrics: buildMetricsFromReportData(row.data || {}),
        sections: buildSectionsFromReportData(row.data || {}),
      });
      if (applied === false) return; // user declined the overwrite confirm
    } catch (e) {
      console.warn('pull project report failed', e);
      alert('Не вдалося завантажити звіт.');
    } finally {
      setPulling(false);
    }
  }

  return (
    <div className="clients-report-page">
      <div id="crApp">
        <aside id="sidebar">
          <div className="brand">
            <span className="mark" id="brandMark" />
            <div>
              <div className="name">Mon&#39;Archi</div>
              <div className="sub">Report Builder</div>
            </div>
          </div>
          <div className="sb-scroll">
            <div className="sb-section">
              <label className="sb-label">Проєкт</label>
              <select className="sb-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">— оберіть проєкт —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="sb-section">
              <label className="sb-label">Тип періоду</label>
              <select className="sb-select" value={periodType} onChange={(e) => setPeriodType(e.target.value)}>
                <option value="weekly">Тижневий</option>
                <option value="monthly">Місячний</option>
              </select>
            </div>
            <div className="sb-section">
              <label className="sb-label">Рік</label>
              <select className="sb-select" value={period.year} onChange={(e) => handleYear(+e.target.value)}>
                {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="sb-section">
              <label className="sb-label">Місяць</label>
              <select className="sb-select" value={period.month} onChange={(e) => handleMonth(+e.target.value)}>
                {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
              </select>
            </div>
            {periodType === 'weekly' && weeks && (
              <div className="sb-section">
                <label className="sb-label">Тиждень</label>
                <select className="sb-select" value={period.weekIndex} onChange={(e) => handleWeekIndex(+e.target.value)}>
                  {weeks.map((w) => (
                    <option key={w.index} value={w.index}>
                      Тиждень {w.index} ({fmtDate(w.start.getFullYear(), w.start.getMonth() + 1, w.start.getDate())}–{fmtDate(w.end.getFullYear(), w.end.getMonth() + 1, w.end.getDate())})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="sb-section">
              <label className="sb-label">Платформа</label>
              <select className="sb-select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="meta">Meta</option>
                <option value="google">Google</option>
                <option value="other">Інше</option>
              </select>
            </div>
            <div className="sb-section">
              <button type="button" className="sb-btn sb-btn-primary" onClick={handlePullReport} disabled={!projectId || pulling}>
                {pulling ? '...' : '↓ Підтягнути дані зі звіту'}
              </button>
              <div className="sb-hint">Заповнить усі розділи презентації даними зі збереженого звіту проєкту — метрики, висновки, плани тощо. Після заповнення все можна відредагувати вручну.</div>
            </div>

            <div className="sb-section">
              <label className="sb-label">Тип звіту</label>
              <select className="sb-select" id="selectType">
                <option value="google_ecom">Google Ads — E-commerce</option>
                <option value="google_leadgen">Google Ads — Leadgen</option>
                <option value="meta_ecom">Meta Ads — E-commerce</option>
                <option value="meta_leadgen">Meta Ads — Leadgen</option>
                <option value="seo">SEO</option>
                <option value="custom">Інший / Custom</option>
              </select>
            </div>
            <div className="sb-section">
              <label className="sb-label">Клієнт / проєкт</label>
              <input className="sb-input" id="inputClient" placeholder="Назва клієнта" autoComplete="off" />
              <label className="sb-label">Період звіту</label>
              <input className="sb-input" id="inputPeriod" placeholder="напр. 01.06.2026 – 07.06.2026" autoComplete="off" />
            </div>
            <div id="csvSections">
              <div className="sb-section">
                <label className="sb-label">Дані з Google Sheets</label>
                <button type="button" className="sb-btn sb-btn-primary" id="btnUpload">&#8593; Завантажити CSV</button>
                <input type="file" id="csvFile" accept=".csv" hidden />
                <div className="sb-hint">Оберіть тип звіту вище, потім завантажте CSV, експортований із відповідного шаблону Google Sheets (Файл → Завантажити → CSV). Слайди зберуться автоматично, включно з будь-якими нестандартними полями.</div>
              </div>
              <div className="sb-section">
                <label className="sb-label">CSV за попередній місяць (опційно)</label>
                <button type="button" className="sb-btn sb-btn-ghost" id="btnUploadPrev">&#8593; Завантажити CSV порівняння</button>
                <input type="file" id="csvFilePrev" accept=".csv" hidden />
                <div className="sb-hint" id="prevCsvStatus">Потрібен лише для колонки &quot;Previous period&quot; у таблиці Dynamics — завантажте CSV з вкладки попереднього місяця тієї ж таблиці. Без нього колонка залишиться порожньою для ручного заповнення.</div>
              </div>
            </div>
            <div className="sb-section" id="seoSection" style={{ display: 'none' }}>
              <label className="sb-label">Текст SEO-звіту</label>
              <textarea className="sb-input" id="seoTextArea" placeholder="Вставте сюди текст із Google Docs (скопіюйте потрібний період — весь вставлений текст увійде у звіт)" />
              <div className="sb-btn-row">
                <button type="button" className="sb-btn sb-btn-ghost" id="btnUploadSeoTxt">&#8593; Завантажити файл</button>
                <button type="button" className="sb-btn sb-btn-primary" id="btnBuildSeo">Побудувати звіт</button>
              </div>
              <input type="file" id="seoTxtFile" accept=".txt,.html,.htm" hidden />
              <div className="sb-hint">Вставте текст прямо в поле (Ctrl+V) і натисніть «Побудувати звіт» — кожен рядок стане окремим пунктом на одному слайді.<br />Або завантажте .html, експортований із Google Docs (Файл → Завантажити → Веб-сторінка) — тоді звіт розіб&#39;ється на слайди за заголовками документа (кожен заголовок верхнього рівня = окремий слайд, вкладені підзаголовки стануть жирними пунктами всередині нього).</div>
            </div>
            <div className="sb-section">
              <label className="sb-label">Шаблон презентації</label>
              <div className="template-grid" id="templateGrid" />
            </div>
            <div className="sb-section">
              <label className="sb-label">Кольорова тема</label>
              <div className="theme-row" id="themeRow" />
            </div>
            <div className="sb-section">
              <label className="sb-label">Слайди</label>
              <div className="add-wrap">
                <button type="button" className="sb-btn sb-btn-ghost" id="btnAdd">+ Додати слайд</button>
                <div className="dropdown" id="addDropdown" />
              </div>
              <ul className="slide-list" id="slideList" />
            </div>
          </div>
          <div id="sidebarFooter">
            <button type="button" className="sb-btn sb-btn-primary" id="btnExport" style={{ padding: '13px 12px', fontSize: '14px' }}>&#11123; Завантажити PDF</button>
          </div>
        </aside>
        <div id="sidebarOverlay" />

        <main id="workspace">
          <div id="toolbar">
            <button type="button" className="btn" onClick={() => navigate(-1)}>&#8592; Back</button>
            <button type="button" id="btnSidebarToggle" className="mobile-toggle" aria-label="Меню">&#9776;</button>
            <div className="crumb crumb-slide" id="crumb">—</div>
            <div className="sp" />
            <div className="crumb crumb-dims"><span>960 × 540 · 16:9</span></div>
          </div>
          <div id="stageWrap">
            <div id="stage" />
          </div>
        </main>
      </div>
    </div>
  );
}
