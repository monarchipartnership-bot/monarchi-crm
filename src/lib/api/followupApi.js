import { API_ENDPOINT } from '../followupData';
import {
  buildOldLeadSystemPrompt, buildSeriesStepSystemPrompt, buildUserMessage,
  parseOldLeadReply, parseSeriesStepReply, appendSignatureIfEmail, appendPreviousStepsContext,
} from '../followupPrompt';

// Type 1/2 — a single follow-up for a lead gone cold long ago.
export async function generateOldLeadFollowup({ chat, extraContext, nameOverride, language, format, style, projects, selectedProjects }) {
  const projectsBlock = (selectedProjects.length ? selectedProjects : projects)
    .map((p) => `- ${p.name}: ${p.desc}`).join('\n');

  const systemPrompt = buildOldLeadSystemPrompt({ language, format, style });
  const userMsg = buildUserMessage({ chat, nameOverride, projectsBlock, extraContext });

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
  const parsed = parseOldLeadReply(fullText);
  return { ...parsed, messagePart: appendSignatureIfEmail(parsed.messagePart, format) };
}

// Type 3 — a single step (FU1..FU5) of the 5-message series for a lead that
// just recently went quiet. Generated one step at a time so each stage can be
// triggered separately, whenever it's actually due — not all 5 upfront.
// `previousMessages` (optional) is [{ step, message }] for steps already
// generated, so this step doesn't literally repeat them.
export async function generateFollowupStep({ chat, extraContext, nameOverride, language, format, projects, selectedProjects, step, previousMessages }) {
  const projectsBlock = (selectedProjects.length ? selectedProjects : projects)
    .map((p) => `- ${p.name}: ${p.desc}`).join('\n');

  const systemPrompt = buildSeriesStepSystemPrompt({ language, format, step });
  const userMsg = appendPreviousStepsContext(
    buildUserMessage({ chat, nameOverride, projectsBlock, extraContext }),
    previousMessages,
  );

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
  const parsed = parseSeriesStepReply(fullText);
  return { ...parsed, message: appendSignatureIfEmail(parsed.message, format) };
}
