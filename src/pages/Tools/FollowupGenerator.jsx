import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { generateOldLeadFollowup, generateFollowupStep } from '../../lib/api/followupApi';
import { STYLE_OPTIONS, DEFAULT_STYLE_ID } from '../../lib/followupPrompt';
import { fetchFollowupCases, createFollowupCase, updateFollowupCase, deleteFollowupCase } from '../../lib/api/followupCases';
import { fetchFollowupSteps, saveFollowupStep } from '../../lib/api/followupSteps';
import { logActivity } from '../../lib/api/activityLog';
import { addDealNote } from '../../lib/api/dealNotes';
import { createTask } from '../../lib/api/tasks';
import { createTaskAssignedNotification } from '../../lib/api/notifications';
import { copyToClipboard } from '../../lib/clipboard';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import { flagClass } from '../../lib/countries';
import Select from '../../components/common/Select';
import ActionIcon from '../../components/common/ActionIcon';
import { PAGE_ICONS } from '../../lib/pageIcons';
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

  // Steps generated on earlier days (a different browser tab entirely, once
  // the manager comes back to write FU2..FU5) live in deal_followup_steps,
  // not React state — pull them in on mount so "don't repeat the same
  // case/opening" actually has history to check against. Only possible when
  // opened from a deal (prefill.dealId set); without one there's nowhere to
  // persist to, same limitation saveFollowupToDeal already has below.
  useEffect(() => {
    if (!prefill?.dealId) return;
    fetchFollowupSteps(prefill.dealId).then((saved) => {
      if (Object.keys(saved).length) setStepData((prev) => ({ ...saved, ...prev }));
    });
  }, [prefill?.dealId]);

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
      .map((s) => ({ step: s.step, message: stepData[s.step].message, caseUsed: stepData[s.step].caseUsed }));

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
      saveFollowupStep(prefill?.dealId, step, stepResult.message, stepResult.caseUsed);
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
      saveFollowupStep(prefill?.dealId, activeStep, editedText, activeStepData.caseUsed);
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


  // Keyboard navigation for the 5-step tab row: arrows/Home/End move both the
  // selection and the focus, same as a native tablist.
  function handleStepKeyDown(e) {
    if (e.target.getAttribute('role') !== 'tab') return;
    const idx = SERIES_STEPS.findIndex((s) => s.step === activeStep);
    let next = null;
    if (e.key === 'ArrowRight') next = SERIES_STEPS[(idx + 1) % SERIES_STEPS.length].step;
    else if (e.key === 'ArrowLeft') next = SERIES_STEPS[(idx - 1 + SERIES_STEPS.length) % SERIES_STEPS.length].step;
    else if (e.key === 'Home') next = SERIES_STEPS[0].step;
    else if (e.key === 'End') next = SERIES_STEPS[SERIES_STEPS.length - 1].step;
    if (next == null) return;
    e.preventDefault();
    setActiveStep(next);
    document.getElementById(`fu-step-tab-${next}`)?.focus();
  }

  // One result card for both leadType branches (single / 5-step) — same
  // content and actions as before, only the copy handler/label and the
  // message source differ.
  function renderResultBox({ text, onCopy, copyText }) {
    return (
      <div className="fu-result-box">
        <div className="fu-result-box-head">
          <span className="fu-format-pill">{FORMAT_LABELS[format]}</span>
          <div className="fu-result-actions">
            {isEditingResult ? (
              <>
                <button type="button" className="fu-btn fu-btn--ghost" onClick={handleCancelEditResult}>Скасувати</button>
                <button type="button" className="fu-btn fu-btn--solid" onClick={handleSaveEditResult}>Зберегти</button>
              </>
            ) : (
              <>
                <button type="button" className="fu-btn fu-btn--ghost" onClick={handleStartEditResult}>
                  <ActionIcon name="edit" size={16} />
                  Редагувати
                </button>
                <button type="button" className="fu-btn fu-btn--ghost" onClick={onCopy}>
                  <ActionIcon name="copy" size={16} />
                  {copyText}
                </button>
              </>
            )}
          </div>
        </div>
        {isEditingResult ? (
          <textarea className="fu-result-edit" aria-label="Редагування повідомлення" value={editedText} onChange={(e) => setEditedText(e.target.value)} />
        ) : (
          <div className="fu-result-text">{text}</div>
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
    );
  }

  const stepError = leadType === 'fresh' ? activeStepData.error : null;
  const emptyTitle = leadType === 'fresh' ? `Тут з'явиться Follow-up ${activeStep}.` : 'Тут з’явиться згенероване повідомлення.';
  const statusId = 'fu-status';

  return (
    <div className="report-page followup-page">
      {prefill?.clientName && (
        <p className="fu-prefill" role="status">
          Підтягнуто дані угоди «{prefill.clientName}» — залишилось вставити переписку.
        </p>
      )}

      <div className="fu-shell">
        <div className="fu-layout">
          <div className="fu-col">
            <section className="fu-panel" aria-labelledby="fu-settings-title">
              <h2 className="fu-panel-title" id="fu-settings-title">Налаштування</h2>

              <div className="fu-settings-grid">
                <div className="fu-field">
                  <span className="fu-label" id="fu-type-label">Тип follow-up</span>
                  <div className="fu-seg" role="group" aria-labelledby="fu-type-label">
                    <button type="button" aria-pressed={leadType === 'old'} className={leadType === 'old' ? 'on' : ''} onClick={() => setLeadType('old')}>Одинарний</button>
                    <button type="button" aria-pressed={leadType === 'fresh'} className={leadType === 'fresh' ? 'on' : ''} onClick={() => setLeadType('fresh')}>5-ти кроковий</button>
                  </div>
                </div>

                <div className="fu-field">
                  <span className="fu-label" id="fu-format-label">Формат</span>
                  <div className="fu-seg" role="group" aria-labelledby="fu-format-label">
                    <button type="button" aria-pressed={format === 'upwork'} className={format === 'upwork' ? 'on' : ''} onClick={() => setFormat('upwork')}>Upwork chat</button>
                    <button type="button" aria-pressed={format === 'email'} className={format === 'email' ? 'on' : ''} onClick={() => setFormat('email')}>Email</button>
                  </div>
                </div>

                <div className="fu-field">
                  <label className="fu-label" htmlFor="fu-client-name">Ім&#39;я клієнта</label>
                  <input id="fu-client-name" className="fu-input" type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Наприклад, John" />
                </div>

                <div className="fu-field">
                  <span className="fu-label" id="fu-lang-label">Мова</span>
                  <Select bare className="fu-select" ariaLabel="Мова повідомлення" value={language} onChange={setLanguage} options={LANGUAGE_OPTIONS} />
                </div>

                <div className="fu-field fu-field--wide">
                  <span className="fu-label" id="fu-cases-label">Кейси</span>
                  <div className="fu-case-row">
                    <div className="fu-case-field" role="status" aria-labelledby="fu-cases-label">
                      {selected.size ? `${selected.size} ${pluralCases(selected.size)} обрано` : 'AI обере сам'}
                    </div>
                    <button type="button" className="fu-btn fu-btn--soft" onClick={openCasesModal}>Обрати</button>
                  </div>
                </div>

                {leadType === 'fresh' && (
                  <div className="fu-field fu-field--wide">
                    <span className="fu-label" id="fu-steps-label">Крок серії</span>
                    <div className="fu-steps" role="tablist" aria-labelledby="fu-steps-label" onKeyDown={handleStepKeyDown}>
                      {SERIES_STEPS.map(({ step, hint, info }) => (
                        <div className="fu-step" key={step}>
                          <button
                            type="button" role="tab" id={`fu-step-tab-${step}`}
                            aria-selected={activeStep === step} tabIndex={activeStep === step ? 0 : -1}
                            className={'fu-step-tab' + (activeStep === step ? ' on' : '')}
                            onClick={() => setActiveStep(step)}
                          >
                            Follow-up {step} <span className="fu-step-hint">{hint}</span>
                          </button>
                          <div className="info-wrap">
                            <button type="button" className="info-btn" aria-label={`Про Follow-up ${step}`} aria-describedby={`fu-step-info-${step}`}>?</button>
                            <div className="info-tooltip" role="tooltip" id={`fu-step-info-${step}`}>{info}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="fu-panel" aria-label="Повідомлення клієнта">
              <div className="fu-block">
                <div className="fu-block-head">
                  <label className="fu-block-title" htmlFor="chatInput">Діалог з клієнтом</label>
                  <button type="button" className="fu-link-btn" onClick={handleClearChat}>
                    <ActionIcon name="clear" size={16} />
                    Очистити
                  </button>
                </div>
                <div className="fu-textarea-wrap">
                  <textarea
                    id="chatInput" className="fu-textarea fu-textarea--dialog" value={chat} onChange={(e) => setChat(e.target.value)}
                    placeholder="Вставте переписку цілком або ключові фрагменти"
                    aria-invalid={status.error && !chat.trim() ? true : undefined}
                    aria-describedby={status.error ? statusId : undefined}
                  />
                  {chat.length > 0 && <span className="fu-char-count">{chat.length} символів</span>}
                </div>
              </div>

              <div className="fu-block">
                <div className="fu-block-head">
                  <label className="fu-block-title" htmlFor="resultsInput">
                    Додатковий контекст / результати <span className="fu-optional">(необов&#39;язково)</span>
                  </label>
                </div>
                <div className="fu-textarea-wrap">
                  <textarea
                    id="resultsInput" className="fu-textarea fu-textarea--context" maxLength={1000} value={extraContext} onChange={(e) => setExtraContext(e.target.value)}
                    placeholder="Наприклад, ваші послуги, попередні домовленості, очікуваний результат..."
                  />
                  <span className="fu-char-count">{extraContext.length}/1000</span>
                </div>
              </div>

              {leadType === 'old' && (
                <div className="fu-block">
                  <div className="fu-block-head">
                    <span className="fu-block-title" id="fu-tone-label">Тон повідомлення</span>
                  </div>
                  <div className="fu-chips" role="group" aria-labelledby="fu-tone-label">
                    {STYLE_OPTIONS.map((s) => (
                      <button
                        type="button" key={s.id}
                        className={'fu-chip' + (style === s.id ? ' on' : '')}
                        aria-pressed={style === s.id}
                        onClick={() => setStyle(s.id)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="fu-actions">
                <button type="button" className="fu-btn fu-btn--primary" onClick={handlePrimaryGenerate} disabled={isGenerating}>
                  <ActionIcon name="generate" size={20} />
                  {isGenerating ? '...' : 'Згенерувати follow-up'}
                </button>
                <button type="button" className="fu-btn fu-btn--secondary" onClick={handlePrimaryGenerate} disabled={isGenerating || !hasResult}>
                  <ActionIcon name="regenerate" size={20} />
                  Згенерувати повторно
                </button>
              </div>
              <div id={statusId} className={'followup-status' + (status.error ? ' err' : '')} role={status.error ? 'alert' : 'status'}>{status.text}</div>
            </section>
          </div>

          <section
            className="fu-panel fu-result-panel"
            aria-busy={isGenerating}
            {...(leadType === 'fresh'
              ? { role: 'tabpanel', 'aria-labelledby': `fu-step-tab-${activeStep}` }
              : { 'aria-labelledby': 'fu-result-title' })}
          >
            <div className="fu-result-head">
              <h2 className="fu-panel-title" id="fu-result-title">Результат</h2>
              {hasResult && activeResult?.elapsedSec != null && (
                <span className="fu-gen-badge">
                  <span className="fu-gen-badge-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.check }} />
                  Згенеровано за {activeResult.elapsedSec} с
                </span>
              )}
            </div>

            {hasResult ? (
              renderResultBox(
                leadType === 'old'
                  ? { text: result.messagePart, onCopy: handleCopy, copyText: copyLabel }
                  : { text: activeStepData.message, onCopy: () => handleCopyStep(activeStep, activeStepData.message), copyText: activeStepData.copyLabel || 'Скопіювати' },
              )
            ) : (
              <div className="fu-empty">
                {isGenerating ? (
                  <>
                    <span className="fu-spinner" aria-hidden="true" />
                    <p className="fu-empty-title">Генеруємо повідомлення…</p>
                  </>
                ) : (
                  <>
                    <img className="fu-empty-icon" src={PAGE_ICONS['page.followup'].srcLarge} alt="" width="64" height="64" draggable="false" />
                    {stepError ? (
                      <p className="fu-empty-error" role="alert">Помилка: {stepError}</p>
                    ) : (
                      <>
                        <p className="fu-empty-title">{emptyTitle}</p>
                        <p className="fu-empty-hint">Додайте діалог і натисніть «Згенерувати follow-up».</p>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {casesModalOpen && (
        <div className="caseModal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setCasesModalOpen(false); }}>
          <div className="caseModal-box">
            <div className="caseModal-head">
              <h3>Кейси для follow-up</h3>
              <button type="button" className="caseModal-close" onClick={() => setCasesModalOpen(false)} aria-label="Закрити">
                <ActionIcon name="close" size={20} />
              </button>
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
                  {savingCase ? '...' : (<><ActionIcon name="create" size={16} /> Додати</>)}
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
              <button type="button" className="btn btn-p" onClick={confirmCasesSelection}>
                <ActionIcon name="select" size={16} />
                {' '}Обрати
              </button>
              <button type="button" className="btn" onClick={() => setCasesModalOpen(false)}>Скасувати</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
