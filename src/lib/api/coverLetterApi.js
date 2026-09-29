import { API_ENDPOINT } from '../followupData';
import { buildCoverLetterSystemPrompt, buildCoverLetterUserMessage, parseCoverLetterReply } from '../coverLetterPrompt';

export async function generateCoverLetter({ jobPost, extraContext, language, style, cases, selectedCases }) {
  const casesBlock = (selectedCases.length ? selectedCases : cases)
    .map((c) => `- ${c.name}: ${c.description}`).join('\n');

  const systemPrompt = buildCoverLetterSystemPrompt({ language, style });
  const userMsg = buildCoverLetterUserMessage({ jobPost, casesBlock, extraContext });

  const response = await fetch(API_ENDPOINT, {
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
  return parseCoverLetterReply(fullText);
}
