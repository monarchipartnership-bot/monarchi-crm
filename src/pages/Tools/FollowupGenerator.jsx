import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { generateOldLeadFollowup, generateFollowupStep } from '../../lib/api/followupApi';
import { STYLE_OPTIONS, DEFAULT_STYLE_ID } from '../../lib/followupPrompt';
import { fetchFollowupCases, createFollowupCase, updateFollowupCase, deleteFollowupCase } from '../../lib/api/followupCases';
import { logActivity } from '../../lib/api/activityLog';
import { addDealNote } from '../../lib/api/dealNotes';
import { createTask } from '../../lib/api/tasks';
import { createTaskAssignedNotification } from '../../lib/api/notifications';
import { copyToClipboard } from '../../lib/clipboard';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import { flagClass } from '../../lib/countries';
import Select from '../../components/common/Select';
import '../../styles/reportPage.css';
import '../../styles/followupPage.css';

// Same chevrons as DailyReportHero.jsx's own scroll-arrow row — reused verbatim
// so the "arrows + wheel" scroll pattern looks identical wherever it appears.
const CHEVRON_LEFT = '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>';
const CHEVRON_RIGHT = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';

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

const LANGUAGE_OPTIONS = [
  { value: 'English', label: 'English', iconClassName: flagClass('GB') },
  { value: 'Ukrainian', label: 'Українська', iconClassName: flagClass('UA') },
];

// Days to wait after step N before step N+1 is due — matches SERIES_STEPS'
// own hints (день 1/2/4/7/12) exactly: 1→2 is +1 day, 2→3 is +2, 3→4 is +3,
// 4→5 is +5. Used to auto-schedule the next step as a deal task.
const STEP_GAP_DAYS = { 1: 1, 2: 2, 3: 3, 4: 5 };

function pluralCases(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'кейс';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'кейси';
  return 'кейсів';
}

function formatCreatedAt(date) {
  if (!date) return '';
  return date.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function FollowupGenerator() {
  const { email } = useAuth();
  // Opened from a deal's "Follow-up" button (DealDetailModal.jsx) carries the
  // deal's client name + a built extraContext (niche/qualification/source +
  // recent notes) via router state — a plain refresh loses it, same as any
  // other router-state prefill, which is fine since it's just a convenience.
  const { state: prefill } = useLocation();

  // { id, name, desc } — own Supabase-backed case-study database, replacing
  // the old Google Sheets + MCP-connector read. Selection sets hold real
  // case ids now (not array indices), so adding/editing/deleting a case
  // never silently shifts what's selected.
  const [projects, setProjects] = useState([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());

  const [casesModalOpen, setCasesModalOpen] = useState(false);
  const [draftSelected, setDraftSelected] = useState(new Set());
  const [newCaseName, setNewCaseName] = useState('');
  const [newCaseDesc, setNewCaseDesc] = useState('');
  const [savingCase, setSavingCase] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const [clientName, setClientName] = useState(prefill?.clientName || '');
  const [language, setLanguage] = useState('English');
  const [leadType, setLeadType] = useState('old'); // 'old' — one-off follow-up; 'fresh' — 5-message series
  const [activeStep, setActiveStep] = useState(1); // which FU step is shown/generated, leadType 'fresh'
  const [format, setFormat] = useState('upwork'); // 'upwork' | 'email'
  const [style, setStyle] = useState(DEFAULT_STYLE_ID); // STYLE_OPTIONS id — leadType 'old' only, see buildArgs()
  const [chat, setChat] = useState('');
  const [extraContext, setExtraContext] = useState(prefill?.extraContext || '');

  // Style-pill row (block 3) scrolls sideways via the two arrow buttons or
  // the mouse wheel — same pattern as DailyReportHero.jsx's day strip.
  const styleScrollRef = useRef(null);
  useEffect(() => {
    const el = styleScrollRef.current;
    if (!el) return;
    function onWheel(e) {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [leadType]);
  function scrollStyleRow(dir) {
    styleScrollRef.current?.scrollBy({ left: dir * 220, behavior: 'smooth' });
  }

  const [status, setStatus] = useState({ text: '', error: false });
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null); // { messagePart, date, tone, flow, name, essence, caseUsed } — leadType 'old'
  const [copyLabel, setCopyLabel] = useState('Скопіювати');

  // Inline edit of the generated message, before copying — one textarea
  // in place of the result text, saved back into `result`/`stepData` so a
  // later copy or "save to deal" uses the edited version, not the original.
  const [isEditingResult, setIsEditingResult] = useState(false);
  const [editedText, setEditedText] = useState('');
  useEffect(() => { setIsEditingResult(false); }, [leadType, activeStep]);

  // leadType 'fresh': per-step cache, keyed by step number, so each stage can
  // be generated on its own and switching tabs keeps what was already made —
  // { message, caseUsed, generating, error, copyLabel }.
  const [stepData, setStepData] = useState({});

function reloadCases() {
    setCasesLoading(true);
    return fetchFollowupCases()
      .then((rows) => setProjects(rows.map((r) => ({ id: r.id, name: r.name, desc: r.description }))))
      .finally(() => setCasesLoading(false));
  }

  useEffect(() => { reloadCases(); }, []);

  function openCasesModal() {
    setDraftSelected(new Set(selected));
    setEditingCaseId(null);
    setCasesModalOpen(true);
  }
  function toggleDraftSelected(id) {
    setDraftSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function confirmCasesSelection() {
    setSelected(draftSelected);
    setCasesModalOpen(false);
  }

  async function handleAddCase() {
    const name = newCaseName.trim();
    const desc = newCaseDesc.trim();
    if (!name || !desc) return;
    setSavingCase(true);
    try {
      await createFollowupCase({ name, description: desc });
      await reloadCases();
      setNewCaseName('');
      setNewCaseDesc('');
    } catch (e) {
      alert('Помилка додавання кейсу: ' + (e.message || e));
    } finally {
      setSavingCase(false);
    }
  }

  function handleStartEditCase(p) {
    setEditingCaseId(p.id);
    setEditName(p.name);
    setEditDesc(p.desc);
  }

  async function handleSaveEditCase() {
    const name = editName.trim();
    const desc = editDesc.trim();
    if (!name || !desc) return;
    try {
      await updateFollowupCase(editingCaseId, { name, description: desc });
      await reloadCases();
      setEditingCaseId(null);
    } catch (e) {
      alert('Помилка збереження кейсу: ' + (e.message || e));
    }
  }

  async function handleDeleteCase(id) {
    if (!confirm('Видалити цей кейс?')) return;
    try {
      await deleteFollowupCase(id);
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
      setDraftSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
      await reloadCases();
    } catch (e) {
      alert('Помилка видалення кейсу: ' + (e.message || e));
    }
  }

  function buildArgs() {
    const selectedProjects = Array.from(selected).map((id) => projects.find((p) => p.id === id)).filter(Boolean);
    return {
      chat: chat.trim(),
      extraContext: extraContext.trim(),
      nameOverride: clientName.trim(),
      language,
      format,
      style,
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
    setIsEditingResult(false);
    const startedAt = Date.now();

    try {
      const parsed = await generateOldLeadFollowup(buildArgs());
      setResult({ ...parsed, elapsedSec: Math.round((Date.now() - startedAt) / 1000), createdAt: new Date() });
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
    setIsEditingResult(false);
    const startedAt = Date.now();

    const previousMessages = SERIES_STEPS
      .filter((s) => s.step < step && stepData[s.step]?.message)
      .map((s) => ({ step: s.step, message: stepData[s.step].message }));

    try {
      const stepResult = await generateFollowupStep({ ...buildArgs(), step, previousMessages });
      setStepData((prev) => ({
        ...prev,
        [step]: {
          message: stepResult.message, caseUsed: stepResult.caseUsed, generating: false, error: null,
          elapsedSec: Math.round((Date.now() - startedAt) / 1000), createdAt: new Date(),
        },
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

  function handleStartEditResult() {
    const current = leadType === 'old' ? result?.messagePart : activeStepData.message;
    setEditedText(current || '');
    setIsEditingResult(true);
  }
  function handleCancelEditResult() {
    setIsEditingResult(false);
  }
  function handleSaveEditResult() {
    if (leadType === 'old') {
      setResult((prev) => (prev ? { ...prev, messagePart: editedText } : prev));
    } else {
      setStepData((prev) => ({ ...prev, [activeStep]: { ...prev[activeStep], message: editedText } }));
    }
    setIsEditingResult(false);
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
  const activeResult = leadType === 'old' ? result : activeStepData;

  // "Деталі генерації" card rows — same real fields the old plain-text
  // .followup-meta block showed (minus Тип/Формат/Мова, already visible in
  // the control row above and redundant here), each with an icon. Built once
  // here so both leadType branches below reuse it.
  const metaRows = hasResult ? [
    ...(leadType === 'fresh' ? [{ icon: 'repeat', label: 'Крок', value: `Follow-up ${activeStep}` }] : []),
    ...(leadType === 'old' && result?.date ? [{ icon: 'clock', label: 'Коли відбувалась розмова', value: result.date }] : []),
    ...(leadType === 'old' && result?.tone ? [{ icon: 'meeting', label: 'Тон клієнта', value: result.tone }] : []),
    ...(leadType === 'old' && result?.flow ? [{ icon: 'history', label: 'Хід розмови', value: result.flow }] : []),
    ...(leadType === 'old' && result?.name ? [{ icon: 'user', label: 'Визначено ім\'я', value: result.name }] : []),
    ...(leadType === 'old' && result?.essence ? [{ icon: 'document', label: 'Суть розмови', value: result.essence }] : []),
    ...(activeResult?.caseUsed ? [{ icon: 'briefcase', label: 'Кейс', value: activeResult.caseUsed }] : []),
    ...(activeResult?.createdAt ? [{ icon: 'day', label: 'Створено', value: formatCreatedAt(activeResult.createdAt) }] : []),
  ] : [];

  return (
    <div className="report-page followup-page">
      {prefill?.clientName && (
        <section className="rpt-hero">
          <p className="sub" style={{ color: 'var(--purple)' }}>
            Підтягнуто дані угоди «{prefill.clientName}» — залишилось вставити переписку.
          </p>
        </section>
      )}

      <div className="fu-control-row">
        <div className="fu-control-box">
          <div className="fu-control-head">
            <span className="fu-control-icon" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.meeting }} />
            <span className="fu-control-label">Тип Follow-up</span>
          </div>
          <div className="switch">
            <button type="button" className={leadType === 'old' ? 'on' : ''} onClick={() => setLeadType('old')}>Одинарний</button>
            <button type="button" className={leadType === 'fresh' ? 'on' : ''} onClick={() => setLeadType('fresh')}>5-ти кроковий</button>
          </div>
        </div>

        <div className="fu-control-box">
          <div className="fu-control-head">
            <span className="fu-control-icon" style={{ background: 'linear-gradient(135deg, #60A5FA, #2563EB)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.chatLink }} />
            <span className="fu-control-label">Формат повідомлення</span>
          </div>
          <div className="switch">
            <button type="button" className={format === 'upwork' ? 'on' : ''} onClick={() => setFormat('upwork')}>Upwork chat</button>
            <button type="button" className={format === 'email' ? 'on' : ''} onClick={() => setFormat('email')}>Email</button>
          </div>
        </div>

        <div className="fu-control-box">
          <div className="fu-control-head">
            <span className="fu-control-icon" style={{ background: 'linear-gradient(135deg, #F472B6, #DB2777)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.user }} />
            <span className="fu-control-label">Ім&#39;я клієнта</span>
          </div>
          <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="наприклад, John" />
        </div>

        <div className="fu-control-box">
          <div className="fu-control-head">
            <span className="fu-control-icon" style={{ background: 'linear-gradient(135deg, #2DD4BF, #0D9488)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.website }} />
            <span className="fu-control-label">Мова повідомлення</span>
          </div>
          <Select bare value={language} onChange={setLanguage} options={LANGUAGE_OPTIONS} />
        </div>

        <div className="fu-control-box">
          <div className="fu-control-head">
            <span className="fu-control-icon" style={{ background: 'linear-gradient(135deg, #94A3B8, #475569)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.briefcase }} />
            <span className="fu-control-label">Кейси для follow-up</span>
          </div>
          <div className="case-picker-field">
            <span>{selected.size ? `${selected.size} ${pluralCases(selected.size)} обрано` : 'AI обере сам'}</span>
            <button type="button" className="refreshBtn" onClick={openCasesModal}>Обрати</button>
          </div>
        </div>
      </div>

      {leadType === 'fresh' && (
        <div className="fu-step-card">
          <div className="fu-control-head">
            <span className="fu-control-icon" style={{ background: 'linear-gradient(135deg, #FBBF24, #D97706)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.repeat }} />
            <span className="fu-control-label">Крок серії</span>
          </div>
          <div className="step-switch">
            {SERIES_STEPS.map(({ step, hint, info }) => (
              <div className="step-switch-item" key={step}>
                <button type="button" className={'step-btn' + (activeStep === step ? ' on' : '')} onClick={() => setActiveStep(step)}>
                  <span className="step-btn-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.chatLink }} />
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

      <div className="fu-work-block">
        <div className="fu-work-head">
          <span className="fu-work-num">1</span>
          <div className="fu-work-head-text">
            <span className="fu-work-title">Додатковий контекст / результати</span>
            <span className="fu-work-hint">Необов&#39;язково — якщо треба додати щось, чого немає в базі кейсів</span>
          </div>
        </div>
        <div className="fu-textarea-wrap">
          <textarea id="resultsInput" maxLength={1000} value={extraContext} onChange={(e) => setExtraContext(e.target.value)} placeholder="наприклад: цього тижня запустили нову кампанію на TikTok Ads для цього клієнта, вже 40 лідів" />
          <span className="fu-char-count">{extraContext.length}/1000</span>
        </div>
      </div>

      <div className="workGrid">
        <div className="field">
          <div className="fu-work-block">
            <div className="fu-work-head">
              <span className="fu-work-num">2</span>
              <div className="fu-work-head-text">
                <span className="fu-work-title">Діалог з клієнтом</span>
                <span className="fu-work-hint">Вставте переписку цілком або ключові фрагменти</span>
              </div>
              <button type="button" className="btn" onClick={handleClearChat}>Очистити</button>
            </div>
            <div className="fu-textarea-wrap">
              <textarea id="chatInput" value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Вставте сюди історію переписки з клієнтом..." />
              {chat.length > 0 && <span className="fu-char-count">{chat.length} символів</span>}
            </div>
          </div>

          {leadType === 'old' && (
            <div className="fu-work-block fu-style-block">
              <div className="fu-work-head">
                <span className="fu-work-num">3</span>
                <div className="fu-work-head-text">
                  <span className="fu-work-title">Тон повідомлення</span>
                  <span className="fu-work-hint">Обери стиль написання follow-up</span>
                </div>
              </div>
              <div className="fu-style-row-wrap">
                <button type="button" className="fu-style-scroll-btn" onClick={() => scrollStyleRow(-1)} aria-label="Прокрутити ліворуч">
                  <span dangerouslySetInnerHTML={{ __html: CHEVRON_LEFT }} />
                </button>
                <div className="fu-style-row" ref={styleScrollRef}>
                {STYLE_OPTIONS.map((s) => (
                  <button
                    type="button" key={s.id}
                    className={'fu-style-pill' + (style === s.id ? ' on' : '')}
                    onClick={() => setStyle(s.id)}
                  >
                    <span className="fu-style-pill-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS[s.icon] }} />
                    {s.label}
                  </button>
                ))}
                </div>
                <button type="button" className="fu-style-scroll-btn" onClick={() => scrollStyleRow(1)} aria-label="Прокрутити праворуч">
                  <span dangerouslySetInnerHTML={{ __html: CHEVRON_RIGHT }} />
                </button>
              </div>
            </div>
          )}

          <div className="chatActionsRow">
            <button type="button" className="btn btn-p" onClick={handlePrimaryGenerate} disabled={isGenerating}>
              {isGenerating ? '...' : 'Згенерувати follow-up'}
            </button>
            <button type="button" className="btn" onClick={handlePrimaryGenerate} disabled={isGenerating || !hasResult}>
              Згенерувати повторно
            </button>
          </div>
          <div className={'followup-status' + (status.error ? ' err' : '')}>{status.text}</div>
        </div>

        <div className="field result-col">
          <div className="fu-work-block fu-result-block">
          <div className="fu-result-head">
            <span className="fu-result-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.megaphone }} />
            <span className="fu-result-title">Результат</span>
            {hasResult && activeResult?.elapsedSec != null && (
              <span className="fu-gen-badge">
                <span className="fu-gen-badge-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.check }} />
                Згенеровано за {activeResult.elapsedSec} с
              </span>
            )}
          </div>
          {leadType === 'old' ? (
            result ? (
              <div className="result-box">
                <div className="result-box-head">
                  <span className="result-box-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS[format === 'email' ? 'email' : 'chatLink'] }} />
                  <div className="result-box-actions">
                    {isEditingResult ? (
                      <>
                        <button type="button" className="btn" onClick={handleCancelEditResult}>Скасувати</button>
                        <button type="button" className="btn btn-p" onClick={handleSaveEditResult}>Зберегти</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn" onClick={handleStartEditResult}>
                          <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.edit }} />
                          Редагувати
                        </button>
                        <button type="button" className="btn" onClick={handleCopy}>
                          <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.copy }} />
                          {copyLabel}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {isEditingResult ? (
                  <textarea className="fu-result-edit" value={editedText} onChange={(e) => setEditedText(e.target.value)} />
                ) : (
                  <div className="result-text">{result.messagePart}</div>
                )}
                {metaRows.length > 0 && (
                  <div className="fu-meta-card">
                    {metaRows.map((row) => (
                      <div className="fu-meta-row" key={row.label}>
                        <div className="fu-meta-label-col">
                          <span className="fu-meta-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS[row.icon] }} />
                          <span className="fu-meta-label">{row.label}</span>
                        </div>
                        <span className="fu-meta-value">{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="result-box result-empty">Тут з&#39;явиться згенероване повідомлення.</div>
            )
          ) : activeStepData.message ? (
            <div className="result-box">
              <div className="result-box-head">
                <span className="result-box-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS[format === 'email' ? 'email' : 'chatLink'] }} />
                <div className="result-box-actions">
                  {isEditingResult ? (
                    <>
                      <button type="button" className="btn" onClick={handleCancelEditResult}>Скасувати</button>
                      <button type="button" className="btn btn-p" onClick={handleSaveEditResult}>Зберегти</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn" onClick={handleStartEditResult}>
                        <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.edit }} />
                        Редагувати
                      </button>
                      <button type="button" className="btn" onClick={() => handleCopyStep(activeStep, activeStepData.message)}>
                        <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.copy }} />
                        {activeStepData.copyLabel || 'Скопіювати'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {isEditingResult ? (
                <textarea className="fu-result-edit" value={editedText} onChange={(e) => setEditedText(e.target.value)} />
              ) : (
                <div className="result-text">{activeStepData.message}</div>
              )}
              {metaRows.length > 0 && (
                <div className="fu-meta-card">
                  {metaRows.map((row) => (
                    <div className="fu-meta-row" key={row.label}>
                      <div className="fu-meta-label-col">
                        <span className="fu-meta-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS[row.icon] }} />
                        <span className="fu-meta-label">{row.label}</span>
                      </div>
                      <span className="fu-meta-value">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="result-box result-empty">
              {activeStepData.error ? <span className="followup-status err">Помилка: {activeStepData.error}</span> : `Тут з'явиться Follow-up ${activeStep}.`}
            </div>
          )}
          </div>
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
              </div>
              <div className="dbMeta">{casesLoading ? 'Завантаження...' : `База: ${projects.length} ${pluralCases(projects.length)}`}</div>

              <div className="caseAddRow">
                <input type="text" value={newCaseName} onChange={(e) => setNewCaseName(e.target.value)} placeholder="Назва кейсу" />
                <input type="text" value={newCaseDesc} onChange={(e) => setNewCaseDesc(e.target.value)} placeholder="Опис результатів" />
                <button type="button" className="btn btn-p" onClick={handleAddCase} disabled={!newCaseName.trim() || !newCaseDesc.trim() || savingCase}>
                  {savingCase ? '...' : '+ Додати'}
                </button>
              </div>

              <div className="projectList">
                {projects.map((p) => (
                  editingCaseId === p.id ? (
                    <div className="projItem projItem-editing" key={p.id}>
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Назва кейсу" />
                      <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Опис результатів" />
                      <span className="projItemActions">
                        <button type="button" onClick={handleSaveEditCase}>Зберегти</button>
                        <button type="button" onClick={() => setEditingCaseId(null)}>Скасувати</button>
                      </span>
                    </div>
                  ) : (
                    <div className="projItem" key={p.id}>
                      <label className="pCheckLabel">
                        <input type="checkbox" checked={draftSelected.has(p.id)} onChange={() => toggleDraftSelected(p.id)} />
                        <span className="pText"><span className="pName">{p.name}</span> — <span className="pDesc">{p.desc}</span></span>
                      </label>
                      <span className="projItemActions">
                        <button type="button" onClick={() => handleStartEditCase(p)}>Редагувати</button>
                        <button type="button" className="danger" onClick={() => handleDeleteCase(p.id)}>Видалити</button>
                      </span>
                    </div>
                  )
                ))}
                {!casesLoading && projects.length === 0 && <div className="dbMeta" style={{ padding: 12 }}>Ще немає жодного кейсу — додайте перший вище.</div>}
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
