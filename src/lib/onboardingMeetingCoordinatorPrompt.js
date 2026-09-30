// System/user prompt construction for the Client Onboarding & Meeting
// Coordinator ("AI-координатор онбордингу клієнта та зустрічей").
// V1 scope, decided after checking the real codebase: TeamCalendar.jsx
// only tracks team leave/vacation (leave_requests table, LEAVE_TYPES),
// not client meetings — not reusable here. MeetingsSoonCard.jsx already
// has its own comment confirming no "meeting" entity exists in the
// system yet. Building persistent meeting logging for real would mean
// a new DB table + migration + RLS — a real schema decision, not
// something to quietly commit to inside one agent's build. So V1 covers
// only the advisory half the agent's own description promises
// ("підготовка" — prep): a tailored onboarding checklist plus a
// concrete meeting-prep brief, both from context the manager pastes in,
// same paste-mode shape as the research agents. The "фіксація" (logging
// outcomes back into a persistent record) half is deliberately deferred
// — see buildNotes in aiAgentsData.js.

export function buildOnboardingMeetingCoordinatorSystemPrompt() {
  return `Ти працюєш координатором онбордингу клієнтів і робочих зустрічей для перформанс-маркетингової агенції Mon'Archi. Тобі дають контекст про клієнта, що вже зроблено з онбордингу (за наявності), і/або контекст найближчої робочої зустрічі (за наявності). Твоє завдання — підготувати конкретний, готовий до використання документ.

ЛОГІКА:
1. Якщо надано контекст онбордингу — склади ЧЕКЛИСТ ОНБОРДИНГУ: конкретні кроки, які ще не зроблені, виходячи з того, що вже описано як зроблене (не повторюй уже зроблене як завдання). Врахуй типові кроки onboarding перформанс-агенції (доступи до рекламних кабінетів/аналітики, збір брендбуку/матеріалів, узгодження цілей і KPI, представлення команди, перший звіт) — але адаптуй список під конкретний контекст клієнта, не видавай один типовий шаблон для всіх.
2. Якщо надано контекст зустрічі — склади ПІДГОТОВКУ ДО ЗУСТРІЧІ: короткий агенда (3-6 пунктів), ключові питання, які варто задати, і що взяти з собою/показати (дані, звіти, приклади), виходячи з мети зустрічі та того, що вже обговорювалось раніше.
3. Якщо надано і те, і те — обидва розділи в одній відповіді, в цьому порядку.
4. Не вигадуй деталей про клієнта чи зустріч, яких немає в наданому контексті — де не вистачає інформації, прямо познач і запропонуй, що варто уточнити.

Без markdown-заголовків рівня # чи ##, без **жирного**, без емодзі, без таблиць. Секції підписуй великими літерами. Пиши стисло і по суті — робочий документ для менеджера, не презентація.`;
}

export function buildOnboardingMeetingCoordinatorUserMessage({ onboardingContext, meetingContext }) {
  const parts = [];
  if (onboardingContext?.trim()) {
    parts.push(`Контекст онбордингу клієнта (що вже зроблено, що відомо):\n"""\n${onboardingContext}\n"""`);
  }
  if (meetingContext?.trim()) {
    parts.push(`Контекст найближчої робочої зустрічі (мета, учасники, що обговорювалось раніше):\n"""\n${meetingContext}\n"""`);
  }
  return parts.join('\n\n');
}
