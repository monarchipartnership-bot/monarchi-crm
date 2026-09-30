import { API_ENDPOINT } from '../followupData';
import { buildMarketingStrategistSystemPrompt, buildMarketingStrategistUserMessage } from '../marketingStrategistPrompt';

export async function buildStrategy({ businessDescription, goals, budget, audienceNotes, existingResearch }) {
  const systemPrompt = buildMarketingStrategistSystemPrompt();
  const userMsg = buildMarketingStrategistUserMessage({ businessDescription, goals, budget, audienceNotes, existingResearch });

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  if (!response.ok) throw new Error('API error: ' + response.status);

  const data = await response.json();
  const textBlock = data.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text.trim() : '';
}
