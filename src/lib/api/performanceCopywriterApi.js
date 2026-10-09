import { anthropicFetch } from '../followupData';
import { buildPerformanceCopywriterSystemPrompt, buildPerformanceCopywriterUserMessage, parsePerformanceCopywriterReply } from '../performanceCopywriterPrompt';

export async function writeAdCopy({ platform, productDescription, audience, hypothesis }) {
  const systemPrompt = buildPerformanceCopywriterSystemPrompt(platform);
  const userMsg = buildPerformanceCopywriterUserMessage({ productDescription, audience, hypothesis });

  const response = await anthropicFetch('performance-copywriter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  if (!response.ok) throw new Error('API error: ' + response.status);

  const data = await response.json();
  const textBlock = data.content.find((b) => b.type === 'text');
  const fullText = textBlock ? textBlock.text : '';
  return parsePerformanceCopywriterReply(fullText);
}
