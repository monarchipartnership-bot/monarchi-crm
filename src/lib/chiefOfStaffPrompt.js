// System/user prompt construction for the AI Chief of Staff
// ("Головний AI-координатор"). Built last in the locked queue (docs/
// ai-agents-roadmap.md §4.9, item 18) deliberately, since it's the one
// that benefits most from the fullest possible agent roster underneath
// it (19 real agents exist by the time this was built).
//
// Distinct from task-orchestrator, not a duplicate of it: task-
// orchestrator's job stops at producing a step→agent DISPATCH PLAN — it
// never sees or touches any agent's actual output. This agent's own
// description explicitly goes one step further ("... визначає потрібні
// відділи ТА ЗБИРАЄ ЄДИНИЙ РЕЗУЛЬТАТ") — it takes outputs the manager
// already gathered from individual agents/departments (pasted in) and
// synthesizes them into ONE coherent, leadership-level answer, the way
// a real chief of staff briefs an executive from several teams' work
// rather than just handing over a task list. Reuses the same live-
// roster pattern as taskOrchestratorPrompt.js (own copy of the roster-
// block builder, not extracted into a shared helper — matches how this
// codebase already keeps that logic private per file) so department/
// agent references never drift from what's actually built.
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

export function buildChiefOfStaffSystemPrompt() {
  return `Ти працюєш головним AI-координатором для перформанс-маркетингової агенції Mon'Archi — головна точка управління AI-командою. Тобі дають складний запит від керівництва і, за наявності, результати, які менеджер уже зібрав від окремих AI-агентів чи відділів. Твоє завдання — визначити, які відділи/агенти реально стосуються запиту, і зібрати ЄДИНИЙ узгоджений результат для керівництва, а не просто список розрізнених фрагментів.

РЕЄСТР AI-АГЕНТІВ:
${buildAgentRosterBlock()}

ЛОГІКА:
1. Визнач, які відділи/агенти з реєстру вище реально стосуються запиту.
2. Якщо надано результати, вже зібрані від агентів/відділів — синтезуй їх в ОДНУ зв'язну відповідь для керівництва: знайди зв'язки між ними, зроби один висновок/рекомендацію, а не просто перекажи кожен фрагмент окремо.
3. Не вигадуй фактів чи цифр, яких немає в наданих результатах. Де для повної відповіді на запит керівництва бракує конкретного відділу/агента — прямо познач, що саме ще треба зібрати і від кого (з реєстру вище), замість того щоб додумувати відповідь.
4. Якщо потрібний агент позначений [ЩЕ НЕ ПОБУДОВАНО] — назви його як ідеальне джерело, але прямо познач, що зараз його ще не існує і це доведеться зробити вручну.
5. Тримай фінальну відповідь на рівні керівництва: суть і рекомендація, не технічні деталі процесу.

Структуруй відповідь розділами (без markdown-заголовків рівня # чи ##, без **жирного**, без емодзі, без таблиць):
ЗАЛУЧЕНІ ВІДДІЛИ/АГЕНТИ
ЄДИНИЙ РЕЗУЛЬТАТ ДЛЯ КЕРІВНИЦТВА
ЩО ЩЕ ПОТРІБНО ЗІБРАТИ`;
}

export function buildChiefOfStaffUserMessage({ leadershipRequest, gatheredOutputs }) {
  return `Запит від керівництва:
"""
${leadershipRequest}
"""

${gatheredOutputs?.trim() ? 'Результати, вже зібрані від агентів/відділів:\n"""\n' + gatheredOutputs + '\n"""' : 'Жодних результатів від агентів/відділів ще не зібрано.'}`;
}
