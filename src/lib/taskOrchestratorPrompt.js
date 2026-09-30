// System/user prompt construction for the Task Orchestrator Agent
// ("Координатор AI-процесів"). Unlike every other agent, its "knowledge
// base" IS the AI Agents roster itself — the system prompt is built from
// the live AGENT_DEPTS data, not hand-written, so it never drifts out of
// sync with which agents actually exist/work as new ones are added.
import { AGENT_DEPTS } from '../data/aiAgentsData';

function buildAgentRosterBlock() {
  const lines = [];
  for (const dept of Object.values(AGENT_DEPTS)) {
    for (const sc of dept.subcategories || []) {
      for (const a of sc.agents) {
        const statusTag = (a.status === 'in_development' || a.status === 'live') ? '[РЕАЛЬНО ПРАЦЮЄ]' : '[ЩЕ НЕ ПОБУДОВАНО]';
        lines.push(`- ${a.name} ${statusTag}: ${a.description}`);
      }
    }
  }
  return lines.join('\n');
}

export function buildTaskOrchestratorSystemPrompt() {
  return `Ти працюєш координатором AI-процесів для перформанс-маркетингової агенції Mon'Archi. Тобі дають опис складної задачі менеджера. Твоє завдання: розбити задачу на конкретні кроки й для кожного кроку визначити, який AI-агент з наявного реєстру Mon'Archi може його виконати.

РЕЄСТР AI-АГЕНТІВ:
${buildAgentRosterBlock()}

ЛОГІКА:
1. Розбий задачу на послідовні кроки, тільки якщо це реально потрібно — просту однокрокову задачу не роздроблюй штучно.
2. Для кожного кроку підбери НАЙБІЛЬШ підходящого агента з реєстру вище.
3. Якщо агент позначений [ЩЕ НЕ ПОБУДОВАНО] — все одно можеш його назвати як ідеальний варіант, але прямо познач, що зараз його ще не існує і крок доведеться виконати вручну.
4. Якщо жоден агент з реєстру не підходить під крок — прямо напиши "немає відповідного агента, потрібна ручна робота".
5. Не вигадуй агентів, яких немає в реєстрі вище.
6. Зберігай реалістичний порядок кроків (що логічно йде раніше, а що пізніше).

Відповідай СУВОРО у цьому форматі (по одному рядку на крок):
КРОК 1: [короткий опис підзадачі] → АГЕНТ: [точна назва агента з реєстру, або "немає відповідного агента"]
КРОК 2: [...] → АГЕНТ: [...]
(стільки кроків, скільки реально потрібно)
---
[короткий підсумок для людини, 1-3 речення: з чого почати і на що звернути увагу]`;
}

export function buildTaskOrchestratorUserMessage({ taskDescription }) {
  return `Задача менеджера:
"""
${taskDescription}
"""`;
}

export function parseTaskOrchestratorReply(fullText) {
  const parts = fullText.split('---');
  let stepsPart = parts[0] || '';
  let summary = parts.slice(1).join('---').trim();

  if (!summary) {
    summary = fullText.trim();
    stepsPart = '';
  }

  const steps = [];
  const stepRegex = /КРОК\s*\d+:\s*(.+?)\s*→\s*АГЕНТ:\s*(.+)/g;
  let match;
  while ((match = stepRegex.exec(stepsPart)) !== null) {
    steps.push({ task: match[1].trim(), agent: match[2].trim() });
  }

  return { steps, summary };
}
