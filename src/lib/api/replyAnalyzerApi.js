import { anthropicFetch } from '../followupData';
import { buildReplyAnalyzerSystemPrompt, buildReplyAnalyzerUserMessage, parseReplyAnalyzerReply } from '../replyAnalyzerPrompt';

export async function analyzeReply({ clientReply, ourPreviousMessage }) {
  const systemPrompt = buildReplyAnalyzerSystemPrompt();
  const userMsg = buildReplyAnalyzerUserMessage({ clientReply, ourPreviousMessage });

  const response = await anthropicFetch('reply-analyzer', {
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
  return parseReplyAnalyzerReply(fullText);
}
