import { API_ENDPOINT } from '../followupData';
import { buildTaskOrchestratorSystemPrompt, buildTaskOrchestratorUserMessage, parseTaskOrchestratorReply } from '../taskOrchestratorPrompt';

export async function routeTask({ taskDescription }) {
  const systemPrompt = buildTaskOrchestratorSystemPrompt();
  const userMsg = buildTaskOrchestratorUserMessage({ taskDescription });

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  if (!response.ok) throw new Error('API error: ' + response.status);

  const data = await response.json();
  const textBlock = data.content.find((b) => b.type === 'text');
  const fullText = textBlock ? textBlock.text : '';
  return parseTaskOrchestratorReply(fullText);
}
