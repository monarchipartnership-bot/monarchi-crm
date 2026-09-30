import { API_ENDPOINT } from '../followupData';
import { fetchClientBriefingData } from './accountManagerData';
import { buildAccountManagerSystemPrompt, buildAccountManagerUserMessage, parseAccountManagerReply } from '../accountManagerPrompt';

export async function buildClientBriefing(clientId) {
  const { client, deals, tasks, conversations } = await fetchClientBriefingData(clientId);

  const systemPrompt = buildAccountManagerSystemPrompt();
  const userMsg = buildAccountManagerUserMessage({ client, deals, tasks, conversations });

  const response = await fetch(API_ENDPOINT, {
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
  return { ...parseAccountManagerReply(fullText), client, deals, tasks, conversations };
}
