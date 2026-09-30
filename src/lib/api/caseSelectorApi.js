import { API_ENDPOINT } from '../followupData';
import { buildCaseSelectorSystemPrompt, buildCaseSelectorUserMessage, parseCaseSelectorReply } from '../caseSelectorPrompt';

export async function selectCase({ leadDescription, cases }) {
  const casesBlock = cases.map((c) => `- ${c.name}: ${c.description}`).join('\n');
  const systemPrompt = buildCaseSelectorSystemPrompt();
  const userMsg = buildCaseSelectorUserMessage({ leadDescription, casesBlock });

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  if (!response.ok) throw new Error('API error: ' + response.status);

  const data = await response.json();
  const textBlock = data.content.find((b) => b.type === 'text');
  const fullText = textBlock ? textBlock.text : '';
  return parseCaseSelectorReply(fullText);
}
