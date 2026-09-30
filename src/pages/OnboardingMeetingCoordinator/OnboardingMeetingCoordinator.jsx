import { useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import { coordinateOnboardingMeeting } from '../../lib/api/onboardingMeetingCoordinatorApi';
import { copyToClipboard } from '../../lib/clipboard';
import '../../styles/onboardingMeetingCoordinatorPage.css';

const AGENT_KEY = 'client-onboarding-meeting-coordinator';

// Nineteenth real agent, item 16 in the locked build queue (docs/
// ai-agents-roadmap.md §4.9). V1 scope decided after checking the real
// codebase: TeamCalendar.jsx only tracks team leave (leave_requests
// table), not client meetings, and MeetingsSoonCard.jsx already has its
// own comment confirming no "meeting" entity exists yet in the system.
// Persistent meeting logging would need a new DB table/migration/RLS —
// a real schema decision, not something to quietly add inside one
// agent's build — so V1 covers only the advisory half (onboarding
// checklist + meeting-prep brief), both from pasted context, same
// paste-mode shape as the research agents. Same "one long document" UI
// as those, not parsed into strict fields.
export default function OnboardingMeetingCoordinator({ onClose }) {
  const [onboardingContext, setOnboardingContext] = useState('');
  const [meetingContext, setMeetingContext] = useState('');

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', error: false });
  const [result, setResult] = useState(null);
  const [copyLabel, setCopyLabel] = useState('Скопіювати документ');

  async function handleBuild() {
    if (!onboardingContext.trim() && !meetingContext.trim()) {
      setStatus({ text: 'Заповни хоча б одне поле — онбординг або зустріч.', error: true });
      return;
    }
    setLoading(true);
    setStatus({ text: '', error: false });
    setResult(null);
    try {
      const built = await coordinateOnboardingMeeting({ onboardingContext, meetingContext });
      setResult(built);
      setCopyLabel('Скопіювати документ');
    } catch (e) {
      console.error(e);
      setStatus({ text: 'Помилка побудови. Спробуй ще раз.', error: true });
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await copyToClipboard(result);
      setCopyLabel('Скопійовано ✓');
      setTimeout(() => setCopyLabel('Скопіювати документ'), 1800);
    } catch {
      setStatus({ text: 'Не вдалось скопіювати.', error: true });
    }
  }

  return (
    <AgentWorkspaceShell agentKey={AGENT_KEY} onClose={onClose}>
      <div className="omc-body">
        <div className="omc-field omc-field-grow">
          <label className="omc-label">Контекст онбордингу клієнта (необов&apos;язково)</label>
          <textarea
            className="omc-textarea omc-textarea-main" value={onboardingContext} onChange={(e) => setOnboardingContext(e.target.value)}
            placeholder="Хто клієнт, що вже зроблено з онбордингу, чого ще бракує…"
          />
        </div>

        <div className="omc-field omc-field-grow">
          <label className="omc-label">Контекст найближчої зустрічі (необов&apos;язково)</label>
          <textarea
            className="omc-textarea omc-textarea-main" value={meetingContext} onChange={(e) => setMeetingContext(e.target.value)}
            placeholder="Мета зустрічі, учасники, що обговорювалось раніше…"
          />
        </div>

        <div className="omc-actions">
          <button type="button" className="omc-run-btn" onClick={handleBuild} disabled={loading}>
            {loading ? 'Готую…' : 'Підготувати документ'}
          </button>
          {status.text && <span className={'omc-status' + (status.error ? ' error' : '')}>{status.text}</span>}
        </div>

        {result && (
          <div className="omc-result">
            <div className="omc-result-head">
              <span className="omc-result-title">Онбординг і підготовка до зустрічі</span>
              <button type="button" className="omc-copy-btn" onClick={handleCopy}>{copyLabel}</button>
            </div>
            <div className="omc-result-text">{result}</div>
          </div>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
