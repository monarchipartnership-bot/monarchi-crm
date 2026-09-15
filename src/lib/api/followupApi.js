import { API_ENDPOINT, SHEET_ID, PROJECTS_CACHE_KEY } from '../followupData';
import {
  buildOldLeadSystemPrompt, buildSeriesStepSystemPrompt, buildUserMessage,
  parseOldLeadReply, parseSeriesStepReply, appendSignatureIfEmail, appendPreviousStepsContext,
} from '../followupPrompt';

// Ported from window.storage.get/set — the legacy tool's cache calls only
// work inside a Claude Artifact sandbox; localStorage is the real-browser
// equivalent for this simple {projects, updatedAt} string cache.
export function loadProjectsCache() {
  try {
    const raw = localStorage.getItem(PROJECTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.projects) && parsed.projects.length) return parsed;
  } catch {
    // no cache yet, keep defaults
  }
  return null;
}

function saveProjectsCache(projects, updatedAt) {
  localStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify({ projects, updatedAt }));
}

// Asks the model to read the agency's Google Sheet of case studies and
// return a fresh project list as JSON.
export async function fetchProjectsFromSheet() {
  const systemPrompt = `Тобі потрібно прочитати Google Таблицю з ID ${SHEET_ID} (посилання: https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit) за допомогою доступних інструментів Google Drive.
У таблиці аркуш "Projects", колонка A — назва проєкту ("Проект"), колонка B — опис ("Опис"), дані починаються з рядка 2.
Поверни ВИКЛЮЧНО JSON-масив без пояснень, без markdown-огорож, у форматі:
[{"name": "...", "desc": "..."}, ...]
Включи всі непорожні рядки.`;

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      mcp_servers: [
        { type: 'url', url: 'https://drivemcp.googleapis.com/mcp/v1', name: 'google-drive-mcp' },
      ],
      messages: [{ role: 'user', content: 'Онови базу проєктів з таблиці.' }],
    }),
  });
  if (!response.ok) throw new Error('API error: ' + response.status);

  const data = await response.json();
  const textBlocks = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  const cleaned = textBlocks.replace(/```json|```/g, '').trim();
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('не вдалося розпізнати відповідь');

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed) || !parsed.length) throw new Error('порожній результат');

  const projects = parsed.map((p) => ({ name: p.name || '', desc: p.desc || p.description || '' }));
  const updatedAt = Date.now();
  saveProjectsCache(projects, updatedAt);
  return { projects, updatedAt };
}

// Type 1/2 — a single follow-up for a lead gone cold long ago.
export async function generateOldLeadFollowup({ chat, extraContext, nameOverride, language, format, projects, selectedProjects }) {
  const projectsBlock = (selectedProjects.length ? selectedProjects : projects)
    .map((p) => `- ${p.name}: ${p.desc}`).join('\n');

  const systemPrompt = buildOldLeadSystemPrompt({ language, format });
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
