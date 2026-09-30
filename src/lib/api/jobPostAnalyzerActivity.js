import { createConversation, appendMessages } from './aiConversations';
import { analyzeJobPost } from './jobPostAnalyzerApi';

const AGENT_KEY = 'job-post-analyzer';

// Phase 3 (§4.5) — the first genuinely automatic, event-triggered agent
// run (as opposed to deal-health-check's time-scheduled one, or the
// human-clicked job-post-analyzer→cover-letter-agent handoff). Fired by
// AddDealModal.jsx right after a new deal is created, if the manager
// pasted job-post/inbound text into that deal's optional field — no
// human opens the AI Agents section or clicks anything to run this.
//
// This is also the one case where job-post-analyzer's own output CAN be
// logged into the activity feed: unlike its manual/standalone use (no
// client_id yet — see aiAgentsData.js's buildNotes on this agent), a
// brand-new deal already has a real client_id by the time this fires.
export async function runJobPostAnalysisForDeal({ clientId, jobPost, extraContext }) {
  const result = await analyzeJobPost({ jobPost, extraContext });

  const title = result.niche ? `Sales brief: ${result.niche}` : 'Sales brief нового ліда';
  const conversation = await createConversation(clientId, AGENT_KEY, title, {
    kind: 'audit', createdBy: 'Автоматично (нова угода)', needsReview: true,
  });

  const content = [
    `Ніша: ${result.niche || '—'}`,
    `Суть задачі: ${result.essence || '—'}`,
    `Потрібні послуги: ${result.services || '—'}`,
    `Бюджет/терміни: ${result.budget || '—'}`,
    `Червоні прапорці: ${result.flags || '—'}`,
    `Пріоритет: ${result.priority || '—'}`,
    '',
    result.summary,
  ].join('\n');
  await appendMessages(conversation.id, [{ role: 'assistant', content }]);

  return { conversation, result };
}
