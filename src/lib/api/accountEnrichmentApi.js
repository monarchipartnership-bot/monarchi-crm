import { anthropicFetch } from '../followupData';
import { buildAccountEnrichmentSystemPrompt, buildAccountEnrichmentUserMessage, parseAccountEnrichmentReply } from '../accountEnrichmentPrompt';

const FETCH_ENDPOINT = '/api/fetch-website-text';

export async function fetchWebsiteText(url) {
  const response = await fetch(FETCH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error('Fetch API error: ' + response.status);
  return response.json(); // { text } | { redirected, location } | { error, text: '' }
}

export async function enrichAccount({ url }) {
  const fetched = await fetchWebsiteText(url);
  if (fetched.redirected) {
    throw new Error(`Сайт перенаправляє на ${fetched.location || 'інший URL'} — спробуй вставити цей URL напряму.`);
  }
  if (fetched.error && !fetched.text) {
    throw new Error(fetched.error);
  }

  const systemPrompt = buildAccountEnrichmentSystemPrompt();
  const userMsg = buildAccountEnrichmentUserMessage({ url, websiteText: fetched.text });

  const response = await anthropicFetch('account-enrichment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  if (!response.ok) throw new Error('API error: ' + response.status);

  const data = await response.json();
  const textBlock = data.content.find((b) => b.type === 'text');
  const fullText = textBlock ? textBlock.text : '';
  return parseAccountEnrichmentReply(fullText);
}
