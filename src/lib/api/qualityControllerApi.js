import { anthropicFetch } from '../followupData';
import { buildQualityControllerSystemPrompt, buildQualityControllerUserMessage, parseQualityControllerReply } from '../qualityControllerPrompt';

export async function reviewOutput({ outputToReview, originalContext }) {
  const systemPrompt = buildQualityControllerSystemPrompt();
  const userMsg = buildQualityControllerUserMessage({ outputToReview, originalContext });

  const response = await anthropicFetch('quality-controller', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  if (!response.ok) throw new Error('API error: ' + response.status);

  const data = await response.json();
  const textBlock = data.content.find((b) => b.type === 'text');
  const fullText = textBlock ? textBlock.text : '';
  return parseQualityControllerReply(fullText);
}
