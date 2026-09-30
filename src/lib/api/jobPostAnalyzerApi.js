import { API_ENDPOINT } from '../followupData';
import { buildJobPostAnalyzerSystemPrompt, buildJobPostAnalyzerUserMessage, parseJobPostAnalyzerReply } from '../jobPostAnalyzerPrompt';

export async function analyzeJobPost({ jobPost, extraContext }) {
  const systemPrompt = buildJobPostAnalyzerSystemPrompt();
  const userMsg = buildJobPostAnalyzerUserMessage({ jobPost, extraContext });

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
  return parseJobPostAnalyzerReply(fullText);
}
