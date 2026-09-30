import { API_ENDPOINT } from '../followupData';
import { buildGoogleOptimizationSystemPrompt, buildGoogleOptimizationUserMessage, parseGoogleOptimizationReply } from '../googleOptimizationPrompt';

export async function buildOptimizationPlan({ diagnosis, accountContext }) {
  const systemPrompt = buildGoogleOptimizationSystemPrompt();
  const userMsg = buildGoogleOptimizationUserMessage({ diagnosis, accountContext });

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  if (!response.ok) throw new Error('API error: ' + response.status);

  const data = await response.json();
  const textBlock = data.content.find((b) => b.type === 'text');
  const fullText = textBlock ? textBlock.text : '';
  return parseGoogleOptimizationReply(fullText);
}
