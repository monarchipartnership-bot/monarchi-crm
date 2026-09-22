import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { DEFAULT_PROJECTS } from '../../lib/followupData';
import { loadProjectsCache, fetchProjectsFromSheet, generateOldLeadFollowup, generateFollowupStep } from '../../lib/api/followupApi';
import { logActivity } from '../../lib/api/activityLog';
import { addDealNote } from '../../lib/api/dealNotes';
import { createTask } from '../../lib/api/tasks';
import { createTaskAssignedNotification } from '../../lib/api/notifications';
import { copyToClipboard } from '../../lib/clipboard';
import '../../styles/reportPage.css';
import '../../styles/followupPage.css';

// The 5-step series schedule (see followupPrompt.js for the matching prompt logic).
// `info` is shown as a hover tooltip next to each step's tab (from the agency's
// own "Follow-up. Довідка по типах і промптах" reference doc).
const SERIES_STEPS = [
  { step: 1, hint: 'день 1', info: 'FU1, через 1 день після відповіді клієнта. Повна структура: питання про справи, нагадування суті розмови, релевантний кейс і конкретна пропозиція (наприклад 15-хвилинна розмова) із завершальним питанням.' },
  { step: 2, hint: 'день 2', info: 'FU2, через 1 день після FU1. «Ефект руху» — без повторного «як справи»: створює відчуття, що робота вже почалась, і ставить ОДНЕ конкретне уточнююче питання по суті проєкту клієнта.' },
  { step: 3, hint: 'день 4', info: 'FU3, через 2 дні після FU2. Чиста цінність — корисний інсайт чи порада, дотична до ніші чи каналу клієнта, без жодного прохання. Не закінчується питанням.' },
  { step: 4, hint: 'день 7', info: 'FU4, через 3 дні після FU3. Легка перевірка — згадує ІНШИЙ кейс/результат (не той, що в FU1) і ставить м\'яке ненав\'язливе питання про актуальність чи зручний час.' },
  { step: 5, hint: 'день 12', info: 'FU5, через 5 днів після FU4. Останній контакт — коротке (2-4 речення) шанобливе повідомлення, просте так/ні питання, без тиску, двері залишаються відкритими.' },
];

const FORMAT_LABELS = { upwork: 'Upwork chat', email: 'Email' };

// Days to wait after step N before step N+1 is due — matches SERIES_STEPS'
// own hints (день 1/2/4/7/12) exactly: 1→2 is +1 day, 2→3 is +2, 3→4 is +3,
// 4→5 is +5. Used to auto-schedule the next step as a deal task.
const STEP_GAP_DAYS = { 1: 1, 2: 2, 3: 3, 4: 5 };

function pluralCases(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'кейс';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'кейси';
  return 'кейсів';
}

export default function FollowupGenerator() {
  const navigate = useNavigate();
  const { email } = useAuth();
  // Opened from a deal's "Follow-up" button (DealDetailModal.jsx) carries the
  // deal's client name + a built extraContext (niche/qualification/source +
  // recent notes) via router state — a plain refresh loses it, same as any
  // other router-state prefill, which is fine since it's just a convenience.
  const { state: prefill } = useLocation();

  const [projects, setProjects] = useState(DEFAULT_PROJECTS);
  const [dbMeta, setDbMeta] = useState(`База: ${DEFAULT_PROJECTS.length} проєктів (вбудовано за замовчуванням)`);
  const [selected, setSelected] = useState(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const [casesModalOpen, setCasesModalOpen] = useState(false);
  const [draftSelected, setDraftSelected] = useState(new Set());

  const [clientName, setClientName] = useState(prefill?.clientName || '');
  const [language, setLanguage] = useState('English');
  const [leadType, setLeadType] = useState('old'); // 'old' — one-off follow-up; 'fresh' — 5-message series
  const [activeStep, setActiveStep] = useState(1); // which FU step is shown/generated, leadType 'fresh'
  const [format, setFormat] = useState('upwork'); // 'upwork' | 'email'
  const [chat, setChat] = useState('');
  const [extraContext, setExtraContext] = useState(prefill?.extraContext || '');

  const [status, setStatus] = useState({ text: '', error: false });
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null); // { messagePart, date, tone, flow, name, essence, caseUsed } — leadType 'old'
  const [copyLabel, setCopyLabel] = useState('Скопіювати');

  // leadType 'fresh': per-step cache, keyed by step number, so each stage can
  // be generated on its own and switching tabs keeps what was already made —
  // { message, caseUsed, generating, error, copyLabel }.
  const [stepData, setStepData] = useState({});

  // Load a previously-fetched cache of the sheet, if any (real-browser
  // equivalent of the legacy window.storage cache).
  useEffect(() => {
    const cached = loadProjectsCache();
    if (cached) {
      setProjects(cached.projects);
      setDbMeta(`База: ${cached.projects.length} проєктів (оновлено ${new Date(cached.updatedAt).toLocaleString('uk-UA')})`);
    }
  }, []);

  function openCasesModal() {
    setDraftSelected(new Set(selected));
    setCasesModalOpen(true);
  }
  function toggleDraftSelected(i) {
    setDraftSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }
  function confirmCasesSelection() {
    setSelected(draftSelected);
    setCasesModalOpen(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    setDbMeta('Оновлюю базу з Google Sheets...');
    try {
      const { projects: fresh, updatedAt } = await fetchProjectsFromSheet();
      setProjects(fresh);
      setSelected(new Set());
      setDraftSelected(new Set());
      setDbMeta(`База: ${fresh.length} проєктів (оновлено ${new Date(updatedAt).toLocaleString('uk-UA')})`);
    } catch (err) {
      setDbMeta('Не вдалося оновити базу: ' + err.message + '. Використовую попередню версію.');
    } finally {
      setRefreshing(false);
    }
  }

  function buildArgs() {
    const selectedProjects = Array.from(selected).map((i) => projects[i]);
    return {
      chat: chat.trim(),
      extraContext: extraContext.trim(),
      nameOverride: clientName.trim(),
      language,
      format,
      projects,
      selectedProjects,
    };
  }

  async function handleGenerateOld() {
    if (!chat.trim()) {
      setStatus({ text: 'Вставте діалог з клієнтом.', error: true });
      return;
    }
    setGenerating(true);
    setStatus({ text: 'Аналізую діалог...', error: false });
    setResult(null);

    try {
      const parsed = await generateOldLeadFollowup(buildArgs());
      setResult(parsed);
      setStatus({ text: 'Готово.', error: false });
      logActivity('followup', 'old_lead', { format, language, caseUsed: parsed.caseUsed }, email);
    } catch (err) {
      setStatus({ text: 'Помилка: ' + err.message, error: true });
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateStep(step) {
    if (!chat.trim()) {
      setStatus({ text: 'Вставте діалог з клієнтом.', error: true });
      return;
    }
    setStatus({ text: '', error: false });
    setStepData((prev) => ({ ...prev, [step]: { ...prev[step], generating: true, error: null } }));

    const previousMessages = SERIES_STEPS
      .filter((s) => s.step < step && stepData[s.step]?.message)
      .map((s) => ({ step: s.step, message: stepData[s.step].message }));

    try {
      const stepResult = await generateFollowupStep({ ...buildArgs(), step, previousMessages });
      setStepData((prev) => ({
        ...prev,
        [step]: { message: stepResult.message, caseUsed: stepResult.caseUsed, generating: false, error: null },
      }));
      logActivity('followup', 'fresh_step', { format, language, step, caseUsed: stepResult.caseUsed }, email);
    } catch (err) {
      setStepData((prev) => ({ ...prev, [step]: { ...prev[step], generating: false, error: err.message } }));
    }
  }

  function handlePrimaryGenerate() {
    if (leadType === 'fresh') return handleGenerateStep(activeStep);
    return handleGenerateOld();
  }

  function handleClearChat() {
    setChat('');
    setResult(null);
    setStepData({});
  }

  // Opened from a deal (prefill.dealId set) — logging the copied message as
  // a deal note is what actually closes the loop: without this, a generated
  // follow-up lived only in the clipboard and nowhere in the deal's own
  // history. Fire-and-forget (a failed note write shouldn't block the copy
  // the user is actually waiting on).
  function saveFollowupToDeal(label, text) {
    if (!prefill?.dealId) return;
    addDealNote(prefill.dealId, `${label}:\n${text}`, email).catch((e) => console.warn('addDealNote (follow-up) failed', e));
  }

  function handleCopy() {
    if (!result) return;
    copyToClipboard(result.messagePart)
      .then(() => {
        saveFollowupToDeal(`Follow-up (${FORMAT_LABELS[format]}, ${language})`, result.messagePart);
        setCopyLabel(prefill?.dealId ? 'Скопійовано і збережено в угоду' : 'Скопійовано');
        setTimeout(() => setCopyLabel('Скопіювати'), 2500);
      })
      .catch(() => window.prompt('Скопіюйте текст вручну:', result.messagePart));
  }

  // Auto-schedules the NEXT step of the 5-message series as a deal task —
  // assigned to that deal's own manager (resolved to a real email in
  // DealDetailModal.jsx, since deals.manager itself only stores a display
  // name) so the reminder/notification shows up for that one person, not
  // the whole team. department_id stays null — this is a deal-tied task,
  // same rule as every other task created from a deal's own card, never a
  // Task Manager department task.
  async function scheduleNextStepTask(step) {
    if (!prefill?.dealId || !prefill?.managerEmail) return;
    const nextStep = step + 1;
    const gapDays = STEP_GAP_DAYS[step];
    if (!gapDays || nextStep > SERIES_STEPS.length) return;
    const due = new Date();
    due.setDate(due.getDate() + gapDays);
    const scheduledAt = due.toISOString();
    const text = `Написати Follow-up ${nextStep} клієнту ${prefill.clientName || ''}`.trim();
    try {
      const row = await createTask({
        text, assigneeEmail: prefill.managerEmail, departmentId: null,
        clientId: prefill.clientId || null, dealId: prefill.dealId,
        createdByEmail: email, activityType: 'task', scheduledAt,
      });
      await createTaskAssignedNotification({
        recipientEmail: prefill.managerEmail, senderEmail: email,
        dealId: prefill.dealId, taskId: row.id, noteExcerpt: text,
        dealTitle: prefill.dealTitle || prefill.clientName || 'Угода',
        clientLabel: prefill.clientName || null,
        scheduledAt, activityType: 'task',
      });
      setStatus({ text: `Заплановано Follow-up ${nextStep} на ${due.toLocaleDateString('uk-UA')}.`, error: false });
    } catch (e) {
      console.warn('scheduleNextStepTask failed', e);
    }
  }

  function handleCopyStep(step, text) {
    const label = prefill?.dealId ? 'Скопійовано і збережено в угоду' : 'Скопійовано';
    setStepData((prev) => ({ ...prev, [step]: { ...prev[step], copyLabel: label } }));
    copyToClipboard(text)
      .then(() => {
        saveFollowupToDeal(`Follow-up ${step} (${FORMAT_LABELS[format]}, ${language})`, text);
        scheduleNextStepTask(step);
        setTimeout(() => setStepData((prev) => ({ ...prev, [step]: { ...prev[step], copyLabel: undefined } })), 2500);
      })
      .catch(() => window.prompt('Скопіюйте текст вручну:', text));
  }

  const activeStepData = stepData[activeStep] || {};
  const isGenerating = leadType === 'fresh' ? !!activeStepData.generating : generating;
  const hasResult = leadType === 'fresh' ? !!activeStepData.message : !!result;

  return (
    <div className="report-page followup-page">
      <div className="page-actions">
        <button type="button" className="btn" onClick={() => navigate(-1)}>&#8592; Back</button>
      </div>

      <section className="rpt-hero">
        <h1>Follow-up <span style={{ color: 'var(--purple)' }}>Generator</span></h1>
        <p className="sub">AI-генератор персоналізованих follow-up повідомлень для клієнтів Sales Department на основі переписки та кейсів агентства.</p>
        {prefill?.clientName && (
          <p className="sub" style={{ color: 'var(--purple)' }}>
            Підтягнуто дані угоди «{prefill.clientName}» — залишилось вставити переписку.
          </p>
        )}
      </section>

      <div className="field full">
        <label>Тип ліда</label>
        <div className="switch">
          <button type="button" className={leadType === 'old' ? 'on' : ''} onClick={() => setLeadType('old')}>Follow-up Старих лідів</button>
          <button type="button" className={leadType === 'fresh' ? 'on' : ''} onClick={() => setLeadType('fresh')}>Follow-up поточних лідів</button>
        </div>
      </div>

      {leadType === 'fresh' && (
        <div className="field full">
          <label>Крок серії</label>
          <div className="step-switch">
            {SERIES_STEPS.map(({ step, hint, info }) => (
              <div className="step-switch-item" key={step}>
                <button type="button" className={'step-btn' + (activeStep === step ? ' on' : '')} onClick={() => setActiveStep(step)}>
                  Follow-up {step} <span className="hint">{hint}</span>
                </button>
                <div className="info-wrap">
                  <button type="button" className="info-btn" aria-label={`Про Follow-up ${step}`}>?</button>
                  <div className="info-tooltip" role="tooltip">{info}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid4col">
        <div className="field">
          <label>Формат повідомлення</label>
          <div className="switch">
            <button type="button" className={format === 'upwork' ? 'on' : ''} onClick={() => setFormat('upwork')}>Upwork chat</button>
            <button type="button" className={format === 'email' ? 'on' : ''} onClick={() => setFormat('email')}>Email</button>
          </div>
        </div>
        <div className="field">
          <label>Ім&#39;я клієнта <span className="hint">необов&#39;язково</span></label>
          <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="наприклад, John" />
        </div>
        <div className="field">
          <label>Мова повідомлення</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="English">English</option>
            <option value="Ukrainian">Українська</option>
          </select>
        </div>
        <div className="field">
          <label>Кейси для follow-up</label>
          <div className="case-picker-field">
            <span>{selected.size ? `${selected.size} ${pluralCases(selected.size)} обрано` : 'AI обере сам'}</span>
            <button type="button" className="refreshBtn" onClick={openCasesModal}>Обрати</button>
          </div>
        </div>
      </div>

      <div className="field full">
        <label>Додатковий контекст / результати <span className="hint">необов&#39;язково — якщо треба додати щось, чого немає в базі кейсів</span></label>
        <textarea id="resultsInput" value={extraContext} onChange={(e) => setExtraContext(e.target.value)} placeholder="наприклад: цього тижня запустили нову кампанію на TikTok Ads для цього клієнта, вже 40 лідів" />
      </div>

      <div className="workGrid">
        <div className="field">
          <div className="projListHead">
            <label>Діалог з клієнтом <span className="hint">вставте переписку цілком</span></label>
            <button type="button" className="refreshBtn" onClick={handleClearChat}>Очистити</button>
          </div>
          <textarea id="chatInput" value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Вставте сюди історію переписки з клієнтом..." />
          <div className="chatActionsRow">
            <button type="button" className="generate-btn" onClick={handlePrimaryGenerate} disabled={isGenerating}>
              {isGenerating ? '...' : 'Згенерувати follow-up'}
            </button>
            <button type="button" className="refreshBtn" onClick={handlePrimaryGenerate} disabled={isGenerating || !hasResult}>
              Згенерувати повторно
            </button>
          </div>
          <div className={'followup-status' + (status.error ? ' err' : '')}>{status.text}</div>
        </div>

        <div className="field result-col">
          <label>Результат</label>
          {leadType === 'old' ? (
            result ? (
              <div className="result-box">
                <div className="result-text">{result.messagePart}</div>
                <div className="result-actions">
                  <button type="button" onClick={handleCopy}>{copyLabel}</button>
                </div>
                {(result.name || result.essence || result.caseUsed || result.date || result.tone || result.flow) && (
                  <div className="followup-meta">
                    {result.date && <><b>Коли відбувалась розмова:</b> {result.date}<br /></>}
                    {result.tone && <><b>Тон клієнта:</b> {result.tone}<br /></>}
                    {result.flow && <><b>Хід розмови:</b> {result.flow}<br /></>}
                    {result.name && <><b>Визначено ім&#39;я:</b> {result.name}<br /></>}
                    {result.essence && <><b>Суть розмови:</b> {result.essence}<br /></>}
                    {result.caseUsed && <><b>Використано кейс:</b> {result.caseUsed}</>}
                  </div>
                )}
              </div>
            ) : (
              <div className="result-box result-empty">Тут з&#39;явиться згенероване повідомлення.</div>
            )
          ) : activeStepData.message ? (
            <div className="result-box">
              <div className="result-text">{activeStepData.message}</div>
              <div className="result-actions">
                <button type="button" onClick={() => handleCopyStep(activeStep, activeStepData.message)}>{activeStepData.copyLabel || 'Скопіювати'}</button>
              </div>
              {activeStepData.caseUsed && (
                <div className="followup-meta"><b>Використано кейс:</b> {activeStepData.caseUsed}</div>
              )}
            </div>
          ) : (
            <div className="result-box result-empty">
              {activeStepData.error ? <span className="followup-status err">Помилка: {activeStepData.error}</span> : `Тут з'явиться Follow-up ${activeStep}.`}
            </div>
          )}
        </div>
      </div>

      {casesModalOpen && (
        <div className="caseModal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setCasesModalOpen(false); }}>
          <div className="caseModal-box">
            <div className="caseModal-head">
              <h3>Кейси для follow-up</h3>
              <button type="button" className="caseModal-close" onClick={() => setCasesModalOpen(false)} aria-label="Закрити">&times;</button>
            </div>
            <div className="caseModal-body">
              <div className="projListHead">
                <span className="hint">AI сам обере найрелевантніший під нішу клієнта — можна обрати вручну</span>
                <button type="button" className="refreshBtn" onClick={handleRefresh} disabled={refreshing}>
                  {refreshing ? '...' : 'Оновити базу з Google Sheets'}
                </button>
              </div>
              <div className="dbMeta">{dbMeta}</div>
              <div className="projectList">
                {projects.map((p, i) => (
                  <label className="projItem" key={i}>
                    <input type="checkbox" checked={draftSelected.has(i)} onChange={() => toggleDraftSelected(i)} />
                    <span className="pText"><span className="pName">{p.name}</span> — <span className="pDesc">{p.desc}</span></span>
                  </label>
                ))}
              </div>
            </div>
            <div className="caseModal-foot">
              <button type="button" className="btn btn-p" onClick={confirmCasesSelection}>Обрати</button>
              <button type="button" className="btn" onClick={() => setCasesModalOpen(false)}>Скасувати</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
