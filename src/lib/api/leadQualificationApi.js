import { anthropicFetch } from '../followupData';
import { buildLeadQualificationSystemPrompt, buildLeadQualificationUserMessage, parseLeadQualificationReply } from '../leadQualificationPrompt';

export async function qualifyLead({ deal, icpCriteria }) {
  const systemPrompt = buildLeadQualificationSystemPrompt();
  const userMsg = buildLeadQualificationUserMessage({ deal, icpCriteria });

  const response = await anthropicFetch('lead-qualification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  if (!response.ok) throw new Error('API error: ' + response.status);

  const data = await response.json();
  const textBlock = data.content.find((b) => b.type === 'text');
  const fullText = textBlock ? textBlock.text : '';
  return parseLeadQualificationReply(fullText);
}
