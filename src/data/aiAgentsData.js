// Real AI Agents catalog for the Constellation map — no invented agents.
// Structure (8 departments / 29 roles — Follow-up Agent intentionally
// excluded, see below) is a direct port of "MON'ARCHI AI Team v1 — 30
// agents" (internal doc, 2026-09-23), replacing the earlier 16-department
// draft entirely. Every role in that doc is represented here; the doc's own
// "Follow-up Agent" (Sales & New Business, Wave 1) is the one deliberate
// omission — it's our already-live Follow-up Generator (/tools/followup),
// which stays a manual tool outside this map by explicit decision, not an
// oversight.
//
// `wave` (1/2/3) mirrors the doc's own recommended rollout order (section
// 4) — shown as a badge on not-yet-built agents so the map doubles as a
// build roadmap, not just an org chart.
//
// `stage` (foundation/capture/generate/orchestrate) is the CHART tab's
// column axis — a rollout-pipeline dimension the doc doesn't define per
// role, so each agent's value here is our own judgment call: foundation =
// groundwork/context another agent depends on, capture = pulling in raw
// data, generate = producing the actual output, orchestrate = dispatching
// work to other agents. Left unset on the one role with no defined shape
// yet (Sales Automation Slot — TBD) so it simply doesn't appear on CHART.
//
// Add new agents here as they're actually designed, not to pad the graph —
// the visual is built to stay honest at any size, small or large.

const ic = (path) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

export const AGENT_ICONS = {
  mail: ic('<path d="M4 5h16v14H4z"/><path d="m4 6 8 7 8-7"/>'),
  building: ic('<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1"/><path d="M3 21h18"/>'),
  pulse: ic('<circle cx="12" cy="12" r="9"/><path d="M7 12h2l2 4 3-8 2 4h2"/>'),
  pen: ic('<path d="M4 20h4l11-11-4-4L4 16z"/><path d="m14 7 3 3"/>'),
  globe: ic('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3z"/>'),
  dispatch: ic('<rect x="3" y="12" width="4" height="8" rx="1"/><rect x="10" y="7" width="4" height="13" rx="1"/><rect x="17" y="3" width="4" height="17" rx="1"/>'),
  ads: ic('<path d="M3 10v4a1 1 0 0 0 1 1h3l5 4V5L7 9H4a1 1 0 0 0-1 1z"/><path d="M17 8a5 5 0 0 1 0 8"/>'),
  clipboard: ic('<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M8 11h8M8 15h5"/>'),
  folder: ic('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  chat: ic('<path d="M4 5h16v11H8l-4 4z"/>'),
  calendar: ic('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  person: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/>'),
  target: ic('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>'),
  star: ic('<path d="m12 2 2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.9-6.2 3.9 1.6-7L2 9.2l7.1-.6z"/>'),
  flask: ic('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/>'),
  slot: ic('<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/><path d="M12 8v4M12 16h.01"/>'),
};

// Department-level icons for the overview hubs — separate from the
// agent-level icons above (though several agents intentionally reuse a
// dept icon's shape rather than getting a bespoke one — see aiAgentsData
// comments above).
export const DEPT_ICONS = {
  barChart: ic('<path d="M6 20v-6M12 20V9M18 20V4"/>'),
  box: ic('<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/>'),
  megaphone: ic('<path d="M3 10v4a1 1 0 0 0 1 1h3l6 4V5L7 9H4a1 1 0 0 0-1 1z"/><path d="M17 8a5 5 0 0 1 0 8"/>'),
  brain: ic('<path d="M9 4a2.5 2.5 0 0 0-2.5 2.5v.2A2.5 2.5 0 0 0 5 9v1a2.5 2.5 0 0 0 .5 5v.5A2.5 2.5 0 0 0 8 18a2 2 0 0 0 1-.3V6.5A2.5 2.5 0 0 0 9 4z"/><path d="M15 4a2.5 2.5 0 0 1 2.5 2.5v.2A2.5 2.5 0 0 1 19 9v1a2.5 2.5 0 0 1-.5 5v.5A2.5 2.5 0 0 1 16 18a2 2 0 0 1-1-.3V6.5A2.5 2.5 0 0 1 15 4z"/>'),
  gear: ic('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  handshake: ic('<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="m15 12 2 2 4-4"/>'),
  trend: ic('<path d="M4 20V10M10 20V6M16 20v-8M3 20h18"/>'),
  refresh: ic('<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>'),
  seoSearch: ic('<circle cx="10" cy="10" r="6"/><path d="m21 21-5.2-5.2"/><path d="M8 11l2-2 2 2 3-3"/>'),
  funnel: ic('<path d="M4 4h16l-6 8v6l-4 2v-8z"/>'),
  grid: ic('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  checklist: ic('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 9h.01M8 13h.01M8 17h.01M12 9h5M12 13h5M12 17h5"/>'),
  shieldCheck: ic('<path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/>'),
};

export const AGENT_DEPTS = {
  management: {
    label: 'Управління та координація AI',
    color: '#A855F7',
    subtitle: 'координація AI-команди',
    tagline: 'ORCHESTRATE THE SYSTEM',
    icon: DEPT_ICONS.gear,
    narrative: 'Керує всією системою: маршрутизація задач між агентами, декомпозиція складних запитів, контекст і ескалації на рівень людини. Обидві ролі — фундамент, на який спирається решта відділів, а не окремий клієнтський продукт.',
    startHere: 'task-orchestrator',
    subcategories: [
      {
        key: 'orchestration',
        label: 'Orchestration',
        agents: [
          {
            key: 'ai-chief-of-staff',
            name: 'Головний AI-координатор',
            icon: AGENT_ICONS.star,
            autonomyLevel: 'human-assisted',
            stage: 'orchestrate',
            wave: 3,
            status: 'not_started',
            description: 'Головна точка управління AI-командою. Отримує складні запити від керівництва, визначає потрібні відділи та збирає єдиний результат.',
          },
          {
            key: 'task-orchestrator',
            name: 'Координатор AI-процесів',
            icon: AGENT_ICONS.dispatch,
            tool: 'task-orchestrator',
            autonomyLevel: 'human-assisted',
            stage: 'orchestrate',
            wave: 1,
            status: 'in_development',
            description: 'Розбиває складну задачу на кроки й для кожного підбирає найкращого агента з реального реєстру Mon\'Archi.',
            buildNotes: 'Дев\'ятий реальний агент секції, останній із Wave 1 і п\'ятий із зафіксованої черги (§4.9 роадмапу). Унікальний серед агентів: його системний промпт генерується напряму з живих даних AGENT_DEPTS (buildAgentRosterBlock у taskOrchestratorPrompt.js), тож ніколи не розходиться з тим, які агенти реально існують — включно із самим собою після побудови. Не підключений до стрічки активності — та сама причина, що й у інших ручних інструментів без client_id.',
          },
        ],
      },
    ],
  },
  sales: {
    label: 'Продажі та розвиток нового бізнесу',
    color: '#F43F5E',
    subtitle: 'нові можливості, закриття угод',
    tagline: 'DRIVE GROWTH',
    icon: DEPT_ICONS.barChart,
    narrative: 'Закриває шлях від нової можливості до якісного наступного кроку в pipeline. Більшість ролей працює в режимі research/draft, а не автономної відправки — саме тому Account Enrichment і Deal Health Check вже в пріоритеті на розробку.',
    startHere: 'deal-health-check',
    subcategories: [
      {
        key: 'lead-generation',
        label: 'Lead Generation',
        agents: [
          {
            key: 'job-lead-finder',
            name: 'Агент пошуку лідів і проєктів',
            icon: DEPT_ICONS.seoSearch,
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 3,
            status: 'not_started',
            description: 'Шукає нові комерційні можливості, що відповідають послугам та ICP Mon’Archi.',
          },
          {
            key: 'job-post-analyzer',
            name: 'Агент аналізу оголошень про проєкти',
            icon: AGENT_ICONS.clipboard,
            tool: 'job-post-analyzer',
            autonomyLevel: 'human-assisted',
            stage: 'foundation',
            wave: 1,
            status: 'in_development',
            description: 'Розбирає Job Post або inbound-запит і перетворює його на структурований sales brief: ніша, суть задачі, потрібні послуги, бюджет/терміни, ризики та пріоритет відповіді.',
            buildNotes: 'Четвертий реальний агент секції. Природний попередній крок перед Cover Letter Agent (обидва читають job post), але навмисно не з\'єднані автоматичним handoff\'ом — event-triggered передача між агентами ще не побудована (§4.5 роадмапу). Не client-scoped (job post ще не прив\'язаний до жодного клієнта в CRM), тому, як і cover-letter-agent, свідомо не підключений до стрічки активності агентів.',
          },
        ],
      },
      {
        key: 'qualification',
        label: 'Qualification',
        agents: [
          {
            key: 'account-enrichment',
            name: 'Агент доповнення даних про клієнта',
            icon: AGENT_ICONS.building,
            tool: 'account-enrichment',
            autonomyLevel: 'human-assisted',
            stage: 'foundation',
            wave: 1,
            status: 'in_development',
            description: 'За сайтом клієнта підтягує нішу, орієнтовний розмір бізнесу й позиціонування — готовий абзац для поля «Додатковий контекст» перед генерацією follow-up чи cover letter.',
            breaksInto: ['Завантаження сайту клієнта', 'Визначення ніші й розміру'],
            wiredInto: ['Follow-up Generator', 'Cover Letter Agent (обидва через "Додатковий контекст")'],
            buildsOn: [],
            whatItReplaces: 'Ручний гуглінг клієнта перед тим, як писати йому follow-up.',
            buildNotes: 'Шостий реальний агент секції, перший із зафіксованої черги побудови (§4.9 роадмапу). Оригінальний блокер ("Планується: пошуковий API") обійдено: замість платного enrichment-провайдера — сервер сам завантажує сайт клієнта (нова функція api/fetch-website-text.js, захищена від SSRF: тільки http/https, перевірка резолвленої IP на приватні/loopback/metadata-адреси, без слідування редіректам, ліміти на розмір і час) і віддає очищений текст в LLM. Не client-scoped при ручному запуску (просто вставляєш URL) — з тієї ж причини, що й cover-letter-agent/job-post-analyzer, свідомо не підключений до стрічки активності агентів.',
            ladder: {
              humanLed: 'Менеджер сам гуглить клієнта й вписує контекст руками.',
              humanAssisted: 'Агент сам підтягує контекст, менеджер перевіряє й за потреби доповнює.',
              fullyAutonomous: 'Контекст оновлюється сам при кожному новому лідi.',
            },
            theHuman: 'Менеджер перевіряє точність підтягнутих даних перед використанням.',
          },
          {
            key: 'lead-qualification-agent',
            name: 'Агент кваліфікації лідів',
            icon: DEPT_ICONS.shieldCheck,
            tool: 'lead-qualification-agent',
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 3,
            status: 'in_development',
            description: 'Перевіряє реальну угоду з CRM проти критеріїв ICP, заданих менеджером: КВАЛІФІКОВАНО/ПІД ПИТАННЯМ/НЕ КВАЛІФІКОВАНО з поясненням по кожному критерію.',
            buildNotes: 'Тринадцятий реальний агент секції, перший Wave 3 із зафіксованої черги (§4.9 роадмапу). Свідомо НЕ зашиває власні критерії ICP — такого визначення ніде в проєкті не існує, а вигадати бюджетні пороги/нішеві обмеження означало б фабрикувати бізнес-рішення. Критерії — обов\'язкове поле, яке менеджер вводить сам. Працює з реальною угодою з CRM (DealPicker), а не з вільним текстом — цим відрізняється від job-post-analyzer, який працює до створення угоди.',
          },
        ],
      },
      {
        key: 'proposal',
        label: 'Proposal',
        agents: [
          {
            key: 'portfolio-case-selector',
            name: 'Агент підбору релевантного кейсу',
            icon: AGENT_ICONS.folder,
            tool: 'portfolio-case-selector',
            autonomyLevel: 'human-assisted',
            stage: 'generate',
            wave: 1,
            status: 'in_development',
            description: 'Обирає один найбільш релевантний підтверджений кейс для конкретного ліда — окремо від Cover Letter/Follow-up, для живого дзвінка чи proposal-документа.',
            buildNotes: 'Сьомий реальний агент секції, третій із зафіксованої черги (§4.9 роадмапу). Той самий крок підбору кейсу, що вже вбудований у Cover Letter Agent і Follow-up Generator, але як окремий інструмент — коли потрібен просто найкращий кейс, без генерації повідомлення. Reuse тієї ж бази followup_cases. Не підключений до стрічки активності — та сама причина, що й у інших ручних інструментів без client_id.',
          },
          {
            key: 'cover-letter-agent',
            name: 'Агент написання супровідних листів',
            icon: AGENT_ICONS.mail,
            tool: 'cover-letter-agent',
            autonomyLevel: 'human-assisted',
            stage: 'generate',
            wave: 1,
            status: 'in_development',
            description: 'Створює персоналізований Upwork cover letter за затвердженою структурою: враховує job post клієнта, підбирає релевантний кейс Mon\'Archi і генерує готовий текст пропозиції.',
            buildNotes: 'Третій реальний агент секції. Прямий нащадок Follow-up Generator — перевикористовує його CORE+STYLE промпт-архітектуру (followupPrompt.js) і базу кейсів (followup_cases) напряму. Не client-scoped (job post ще не прив\'язаний до жодного клієнта в CRM), тому, як і deal-health-check, свідомо не підключений до стрічки активності агентів.',
          },
        ],
      },
      {
        key: 'pipeline',
        label: 'Pipeline',
        agents: [
          {
            key: 'reply-analyzer',
            name: 'Агент аналізу відповідей',
            icon: AGENT_ICONS.chat,
            tool: 'reply-analyzer',
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 3,
            status: 'in_development',
            description: 'Розбирає вхідну відповідь клієнта (тип, заперечення) і пропонує один конкретний наступний крок.',
            buildNotes: 'Чотирнадцятий реальний агент секції, другий Wave 3 із зафіксованої черги (§4.9 роадмапу). Той самий standalone paste-текст підхід, що й job-post-analyzer.',
          },
          {
            key: 'deal-health-check',
            name: 'Агент контролю стану угод',
            icon: AGENT_ICONS.pulse,
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 1,
            status: 'in_development',
            tool: 'deal-health-check',
            description: 'Переглядає угоди без активності N днів і пропонує менеджеру список «потребують уваги» з коротким поясненням чому.',
            breaksInto: ['Пошук застояних угод', 'Пояснення причини застою'],
            wiredInto: ['deals', 'ai_agent_conversations (щоденний автоматичний запуск)'],
            buildsOn: [],
            whatItReplaces: 'Ручний перегляд усіх угод, щоб не пропустити застояну.',
            ladder: {
              humanLed: 'Менеджер сам регулярно переглядає список угод.',
              humanAssisted: 'Агент сам формує список «потребують уваги» щодня.',
              fullyAutonomous: 'Агент сам створює задачу «зв\'язатись» на застояну угоду.',
            },
            theHuman: 'Менеджер вирішує, що робити з кожною угодою зі списку.',
            buildNotes: 'Частково перетинається з Automation Dashboard — тут стає явним іменованим агентом. V1 використовує лише updated_at угоди (tasks-крос-референс — наступний крок). З 2026-09-29 запускається автоматично щодня о 06:00 UTC через pg_cron (run_deal_health_check() у Supabase) і пише результат у «Задачі агентів» як audit — перший приклад запланованого запуску з §4.5 роадмапу.',
          },
          {
            key: 'sales-automation-slot',
            name: 'Резервний агент автоматизації продажів — TBD',
            icon: AGENT_ICONS.slot,
            autonomyLevel: 'human-assisted',
            wave: 3,
            status: 'not_started',
            description: 'Навмисно вільний слот. Агент визначиться лише після міні-аудиту Sales-команди, а не вигадується заздалегідь.',
          },
        ],
      },
    ],
  },
  'client-success': {
    label: 'Робота з клієнтами та акаунт-менеджмент',
    color: '#22D3EE',
    subtitle: 'onboarding і контекст клієнта',
    tagline: 'KEEP CONTEXT ALIVE',
    icon: DEPT_ICONS.handshake,
    narrative: 'Тримає клієнтський контекст і перетворює зустрічі, onboarding та поточні домовленості на керований процес навколо одного Account Manager.',
    startHere: 'ai-account-manager',
    subcategories: [
      {
        key: 'account-management',
        label: 'Account Management',
        agents: [
          {
            key: 'ai-account-manager',
            name: 'AI-акаунт-менеджер',
            icon: AGENT_ICONS.person,
            tool: 'ai-account-manager',
            autonomyLevel: 'human-assisted',
            stage: 'orchestrate',
            wave: 2,
            status: 'in_development',
            description: 'Збирає угоди, задачі та історію AI-агентів по клієнту в один брифінг: статус відносин, що потребує уваги, рекомендований наступний крок.',
            buildNotes: 'Дванадцятий реальний агент секції, п\'ятий Wave 2 із зафіксованої черги (§4.9 роадмапу). На відміну від більшості агентів, вхідні дані — не вставлений текст, а детермінований збір існуючих даних клієнта (clients/deals/tasks/ai_agent_conversations через уже перевірені fetch-функції, src/lib/api/accountManagerData.js) — LLM лише перетворює вже зібраний дайджест на наратив, нічого сам не вигадує й не підтягує. V1 без окремих deal_notes (можна додати пізніше).',
          },
          {
            key: 'client-onboarding-meeting-coordinator',
            name: 'AI-координатор онбордингу клієнта та зустрічей',
            icon: AGENT_ICONS.calendar,
            tool: 'client-onboarding-meeting-coordinator',
            autonomyLevel: 'human-assisted',
            stage: 'foundation',
            wave: 3,
            status: 'in_development',
            description: 'За контекстом онбордингу і/або найближчої зустрічі готує чекліст онбордингу та бриф підготовки до зустрічі.',
            buildNotes: 'Дев\'ятнадцятий реальний агент секції, пункт 16 у зафіксованій черзі (§4.9 роадмапу). Перевірено реальний код перед побудовою: TeamCalendar.jsx відстежує тільки відпустки/лікарняні команди (таблиця leave_requests), не зустрічі з клієнтами — не придатний для перевикористання. MeetingsSoonCard.jsx уже має власний коментар, що жодної сутності "зустріч" у системі ще не існує. Побудова справжнього постійного логування зустрічей означала б нову таблицю в БД + міграцію + RLS — реальне архітектурне рішення, а не те, що варто тихо додати всередині одного агента. Тому V1 покриває тільки консультативну половину власного опису агента ("підготовка"): чекліст онбордингу під конкретний контекст клієнта + бриф підготовки до зустрічі (агенда, ключові питання, що взяти) — обидва з вставленого менеджером тексту, той самий paste-mode формат, що й дослідницькі агенти. Половина "фіксація" (запис результатів зустрічі в постійну історію) свідомо відкладена до окремого рішення про нову таблицю зустрічей.',
          },
        ],
      },
    ],
  },
  'strategy-research': {
    label: 'Стратегія та дослідження',
    color: '#14B8A6',
    subtitle: 'бізнес, ринок, аудиторія, стратегія',
    tagline: 'BUILD THE FOUNDATION',
    icon: DEPT_ICONS.brain,
    narrative: 'Створює базу для рішень: бізнес клієнта, конкуренти, аудиторія і єдина performance-стратегія, на яку спираються Delivery і Creative.',
    startHere: 'marketing-strategist',
    subcategories: [
      {
        key: 'research',
        label: 'Research',
        agents: [
          {
            key: 'business-research-agent',
            name: 'Агент дослідження бізнесу',
            icon: AGENT_ICONS.globe,
            tool: 'business-research-agent',
            autonomyLevel: 'human-assisted',
            stage: 'foundation',
            wave: 3,
            status: 'in_development',
            description: 'Структурує вже зібраний менеджером матеріал про бізнес клієнта (сайт, About-сторінка, нотатки) у документ, достатній для performance-стратегії.',
            buildNotes: 'Шістнадцятий реальний агент секції, перший із трьох paste-mode дослідницьких агентів (§4.9 роадмапу, пункти 13-15). Свідомо НЕ робить живий автономний веб-пошук — менеджер вставляє матеріал, який уже сам зібрав, агент структурує (бізнес-модель, ринок/масштаб, ціннісна пропозиція, релевантні для performance-маркетингу болі, чого бракує). Це відповідає власному ladder.humanLed→humanAssisted рівню агента, а не вищому ступеню автономності. Глибший за account-enrichment (той віддає короткий абзац для поля "Додатковий контекст"; цей — повний документ, що живить Маркетингового стратега і два інших дослідницьких агенти нижче). Верифіковано живим curl-запитом до продакшену — коректний розбір реального прикладу SaaS-бізнесу, без вигаданих фактів.',
          },
          {
            key: 'competitor-research-agent',
            name: 'Агент дослідження конкурентів',
            icon: DEPT_ICONS.seoSearch,
            tool: 'competitor-research-agent',
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 3,
            status: 'in_development',
            description: 'Структурує вже зібраний менеджером матеріал про одного чи кількох конкурентів (сайт, реклама, ціни) у порівняльний аналіз з можливістю диференціації.',
            buildNotes: 'Сімнадцятий реальний агент секції, другий із трьох paste-mode дослідницьких агентів. Той самий принцип, що й business-research-agent — не робить живий пошук конкурентів, розбирає вставлений менеджером матеріал по кожному конкуренту окремо (позиціонування, канали/стратегія, сильні/слабкі сторони) і додає підсумкову можливість диференціації. Верифіковано живим curl-запитом на прикладі двох реальних конкурентів — коректно розділив по конкурентах, не вигадав даних там, де матеріал не давав сигналу (прямо позначив "не вказано в наданих матеріалах").',
          },
          {
            key: 'audience-research-agent',
            name: 'Агент дослідження аудиторії',
            icon: AGENT_ICONS.target,
            tool: 'audience-research-agent',
            autonomyLevel: 'human-assisted',
            stage: 'foundation',
            wave: 3,
            status: 'in_development',
            description: 'Розбиває опис бізнесу/продукту клієнта на 2-4 робочі аудиторні сегменти й пов’язує кожен із pain, motivation, trigger і message.',
            buildNotes: 'Вісімнадцятий реальний агент секції, третій і останній із трьох paste-mode дослідницьких агентів — завершує чергу пунктів 13-15 у §4.9. Приймає опис бізнесу/продукту плюс, за наявності, вихід business-research-agent чи інші нотатки як необов\'язковий додатковий контекст. Свідомо не розтягує штучно до 4 сегментів, якщо опис виправдовує менше. Верифіковано живим curl-запитом — три реалістично різні сегменти (сам відповідає на листи / найнята підтримка не встигає / масштабується), кожен з іншим болем і тригером, а не той самий сегмент переписаний іншими словами.',
          },
        ],
      },
      {
        key: 'strategy',
        label: 'Strategy',
        agents: [
          {
            key: 'marketing-strategist',
            name: 'Маркетинговий стратег',
            icon: DEPT_ICONS.funnel,
            tool: 'marketing-strategist',
            autonomyLevel: 'human-assisted',
            stage: 'orchestrate',
            wave: 2,
            status: 'in_development',
            description: 'Складає єдину performance marketing strategy з опису бізнесу, цілей і (за наявності) вже зібраних досліджень.',
            buildNotes: 'Одинадцятий реальний агент секції, третій Wave 2 із зафіксованої черги (§4.9 роадмапу). Свідомо не залежить від ще не побудованих агентів дослідження (бізнесу/конкурентів/аудиторії) — приймає опис бізнесу, цілей і вже зібраних даних як звичайний текст. На відміну від більшості агентів, повертає один довший структурований документ (6 розділів), а не кілька коротких полів — тому результат рендериться одним блоком без жорсткого парсингу заголовків.',
          },
        ],
      },
    ],
  },
  'performance-delivery': {
    label: 'Рекламна ефективність та оптимізація',
    color: '#D4A017',
    subtitle: 'аналіз і оптимізація Google, Meta, TikTok',
    tagline: 'MAKE IT HAPPEN',
    icon: DEPT_ICONS.box,
    narrative: 'Тут живе найбільш конкретний і вже названий біль: під час аудиту показники з рекламного кабінету доводиться зводити вручну через скріни, бо кабінет сам не рахує суми й порівняння періодів. Ads Insights Analyst закриває це відразу для всіх каналів, а спеціалізовані аналітики й оптимізатори — по кожному каналу окремо.',
    startHere: 'ads-insights-analyst',
    subcategories: [
      {
        key: 'cross-channel',
        label: 'Cross-Channel',
        agents: [
          {
            key: 'ads-insights-analyst',
            name: 'Аналітик рекламних даних та інсайтів',
            icon: AGENT_ICONS.ads,
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 1,
            status: 'in_development',
            tool: 'ads-insights-chat',
            description: 'Підключається напряму до рекламного кабінету (Meta/Google Ads) і відповідає на питання про показники природною мовою — без ручного зведення скрінів.',
            breaksInto: ['Запит показників за період', 'Порівняння періодів', 'Розрахунок похідних метрик'],
            wiredInto: ['Meta Marketing API (ads_read)', 'Google Ads API'],
            buildsOn: [],
            whatItReplaces: 'Ручне зведення показників зі скрінів кабінету під час аудиту — головний названий біль.',
            ladder: {
              humanLed: 'Менеджер сам заходить у кабінет, виставляє фільтри й скрінить показники.',
              humanAssisted: 'Менеджер питає агента природною мовою, агент сам іде в кабінет і рахує відповідь.',
              fullyAutonomous: 'Агент сам готує періодичний звіт без запиту.',
            },
            theHuman: 'Менеджер формулює питання й перевіряє відповідь перед тим, як озвучити висновок клієнту.',
            buildNotes: 'Потребує Meta App Review для ads_read у проді (System User токен без ревʼю для власних кабінетів агентства) і Google Ads developer token рівня Standard.',
          },
        ],
      },
      {
        key: 'google',
        label: 'Google',
        agents: [
          {
            key: 'google-ads-analyst',
            name: 'Аналітик Google Ads',
            icon: AGENT_ICONS.ads,
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 2,
            status: 'not_started',
            description: 'Проводить спеціалізований аналіз Google Ads і пояснює причини зміни performance.',
            buildNotes: 'Свідомо пропущено в черзі побудови (§4.9 роадмапу, 2026-09-30): фактично вже повністю покрито `ads-insights-analyst`. get_google_ads_report (api/ads-insights-chat.js) вже підтримує розбивку по campaign/device/keyword (з Quality Score)/ad/network, а власна система audit-фреймворків там же вже дозволяє зібрати саме "поясни причини зміни performance" як one-click аудит. Окрема сторінка була б чистим дублюванням UI без нової функціональності — не будувати, доки не з\'явиться конкретна відмінна від чату потреба.',
          },
          {
            key: 'google-optimization-agent',
            name: 'Агент оптимізації Google Ads',
            icon: DEPT_ICONS.refresh,
            tool: 'google-optimization-agent',
            autonomyLevel: 'human-assisted',
            stage: 'generate',
            wave: 2,
            status: 'in_development',
            description: 'Перетворює діагноз Google Ads (напр. від Аналітика рекламних даних та інсайтів) на конкретний, пріоритезований план оптимізації з очікуваним ефектом.',
            buildNotes: 'Десятий реальний агент секції, перший Wave 2 із зафіксованої черги (§4.9 роадмапу). Свідомо НЕ звертається до Google Ads API сам — це вже робить ads-insights-analyst. Бере готовий діагноз (вставлений вручну, напр. скопійований з чату аналітика) і перетворює на дії з пріоритетом і ефектом — той самий "paste text → структурований LLM-вивід" підхід, що й Quality Controller/Case Selector. Не підключений до стрічки активності — та сама причина, що й у інших ручних інструментів без client_id.',
          },
        ],
      },
      {
        key: 'meta',
        label: 'Meta',
        agents: [
          {
            key: 'meta-ads-analyst',
            name: 'Аналітик Meta Ads',
            icon: AGENT_ICONS.ads,
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 2,
            status: 'not_started',
            description: 'Проводить спеціалізований аналіз Meta Ads на рівні account, campaign, ad set і creative.',
          },
          {
            key: 'meta-optimization-agent',
            name: 'Агент оптимізації Meta Ads',
            icon: DEPT_ICONS.refresh,
            autonomyLevel: 'human-assisted',
            stage: 'generate',
            wave: 2,
            status: 'not_started',
            description: 'Створює план оптимізації Meta Ads на основі аналізу, creative results і бізнес-KPI.',
          },
        ],
      },
      {
        key: 'tiktok',
        label: 'TikTok',
        agents: [
          {
            key: 'tiktok-ads-analyst',
            name: 'Аналітик TikTok Ads',
            icon: AGENT_ICONS.ads,
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 2,
            status: 'not_started',
            description: 'Аналізує TikTok Ads з акцентом на creative-led performance і швидкість тестування.',
          },
        ],
      },
    ],
  },
  'performance-creative': {
    label: 'Performance-креативи',
    color: '#3B82F6',
    subtitle: 'креативні гіпотези, copy, аналіз ефективності',
    tagline: 'TEST WHAT WINS',
    icon: DEPT_ICONS.megaphone,
    narrative: 'Створює й оцінює performance-креативи як систему гіпотез і вимірних тестів, а не одноразові ідеї — від гіпотези до тексту і до аналізу, що з креативів реально спрацювало.',
    startHere: 'creative-strategist',
    subcategories: [
      {
        key: 'creative',
        label: 'Creative',
        agents: [
          {
            key: 'creative-strategist',
            name: 'Креативний стратег',
            icon: AGENT_ICONS.flask,
            autonomyLevel: 'human-assisted',
            stage: 'foundation',
            wave: 2,
            status: 'not_started',
            description: 'Формує систему рекламних креативних гіпотез для paid media, а не просто список ідей.',
          },
          {
            key: 'performance-copywriter',
            name: 'Копірайтер для performance-реклами',
            icon: AGENT_ICONS.pen,
            tool: 'performance-copywriter',
            autonomyLevel: 'human-assisted',
            stage: 'generate',
            wave: 3,
            status: 'in_development',
            description: 'Пише рекламний текст (Google Search/Meta/TikTok-сценарій) під конкретну гіпотезу — ніша, аудиторія і кут задаються вручну.',
            buildNotes: 'П\'ятнадцятий реальний агент секції, третій Wave 3 із зафіксованої черги (§4.9 роадмапу). Перевикористовує CORE_WRITING_RULES_BLOCK з followupPrompt.js — та сама планка якості письма. Свідомо не залежить від creative-strategist (не побудований, можливо ніколи не буде — див. позначку блоку на цьому агенті) — гіпотезу задає людина вручну.',
          },
          {
            key: 'creative-performance-analyst',
            name: 'Аналітик ефективності креативів',
            icon: DEPT_ICONS.trend,
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 2,
            status: 'not_started',
            description: 'Пов’язує кожен креатив із фактичними результатами і шукає повторювані winning/losing patterns.',
          },
        ],
      },
    ],
  },
  'data-tracking-reporting': {
    label: 'Дані, трекінг та звітність',
    color: '#6366F1',
    subtitle: 'якість даних, tracking, cross-channel звітність',
    tagline: 'TRUST THE NUMBERS',
    icon: DEPT_ICONS.trend,
    narrative: 'Стежить за якістю даних і перетворює cross-channel показники на зрозумілі weekly/monthly insights — без довіри до даних решта агентів працюють наосліп.',
    startHere: 'tracking-data-integrity-agent',
    subcategories: [
      {
        key: 'data-reporting',
        label: 'Data & Reporting',
        agents: [
          {
            key: 'tracking-data-integrity-agent',
            name: 'Агент контролю трекінгу та цілісності даних',
            icon: DEPT_ICONS.checklist,
            tool: 'data-integrity-check',
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 1,
            status: 'in_development',
            description: 'Перевіряє, чи можна довіряти даним, на яких працюють інші агенти: RLS-регресії, збої запланованих задач (pg_cron) та застояла черга «На перевірку».',
            buildNotes: 'П\'ятий реальний агент секції. Три детерміновані перевірки, без LLM: (1) регресія тієї самої RLS-вразливості, знайденої й закритої 2026-09-30 — chi хтось знову вручну додав blanket-політику через Supabase Studio; (2) чи всі 3 pg_cron задачі виконуються без збоїв; (3) чи не залежались записи «На перевірку» довше 3 днів. Запускається автоматично раз на день о 07:00 UTC (run_data_integrity_check()). Навмисно БЕЗ кнопки ручної перевірки — перевірки 1 і 2 читають системні схеми (pg_catalog/cron), недоступні через PostgREST, тож ручний повтор із браузера означав би або дублювання логіки на клієнті, або публічний RPC-доступ до SECURITY DEFINER функції — саме те, що вже закрили в тому ж security-фіксі.',
          },
          {
            key: 'cross-channel-reporting-insights-agent',
            name: 'Агент міжканальної звітності та аналітики',
            icon: DEPT_ICONS.grid,
            autonomyLevel: 'human-assisted',
            stage: 'generate',
            wave: 2,
            status: 'not_started',
            description: 'Об’єднує дані Google, Meta, TikTok та інших доступних джерел у weekly/monthly звітність і пояснює, що змінилося і чому.',
            buildNotes: 'Свідомо пропущено в черзі побудови (§4.9 роадмапу, 2026-09-30) після перевірки реальної схеми: `daily_reports`/`weekly_reports`/`monthly_reports` містять активність sales-команди (ліди, аутрич), а НЕ показники рекламних кабінетів — початкове припущення в черзі, що ці таблиці підійдуть, було помилковим. Повноцінна крос-канальна версія (як описано) впирається в ту саму відсутність Meta/TikTok API, що й meta-ads-analyst/tiktok-ads-analyst. Google-only підмножина була б редундантною з ads-insights-analyst (той самий висновок, що й для google-ads-analyst). Переглянути, якщо колись з\'явиться Meta/TikTok API або окрема таблиця для збереження рекламних метрик у часі.',
          },
        ],
      },
    ],
  },
  'quality-control': {
    label: 'Контроль якості AI',
    color: '#EF4444',
    subtitle: 'незалежна перевірка результатів',
    tagline: 'TRUST BUT VERIFY',
    icon: DEPT_ICONS.shieldCheck,
    narrative: 'Незалежний контроль фактів, правил і ризиків перед тим, як результат інших агентів дійде до людини чи клієнта.',
    startHere: 'ai-quality-controller',
    subcategories: [
      {
        key: 'quality',
        label: 'Quality',
        agents: [
          {
            key: 'ai-quality-controller',
            name: 'Контролер якості AI',
            icon: DEPT_ICONS.shieldCheck,
            tool: 'ai-quality-controller',
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 1,
            status: 'in_development',
            description: 'Незалежно перевіряє критичні outputs інших агентів перед використанням чи відправкою: дотримання правил письма, ризик галюцинацій, тон і внутрішня суперечливість.',
            buildNotes: 'Восьмий реальний агент секції, четвертий (і останній Wave 1) із зафіксованої черги (§4.9 роадмапу). Перевикористовує CORE_WRITING_RULES_BLOCK з followupPrompt.js напряму як чек-лист — та сама планка якості, яку вже мають дотримуватись Cover Letter/Follow-up, а не другий вигаданий стандарт. Не підключений до стрічки активності — та сама причина, що й у інших ручних інструментів без client_id.',
          },
        ],
      },
    ],
  },
};

// Flattens AGENT_DEPTS to look an agent up by its own `key` — used where a
// specific agent's real data (name/description/icon/breaksInto/etc.) is
// needed outside the map itself, e.g. an agent's own workspace header or
// its info popover, so that text is never duplicated/invented a second
// time. Merges in the department/subcategory context the same way the map
// itself does at click time (deptLabel/subcatLabel/color), so a consumer
// gets the exact same shape ConstellationTest.jsx's agent-modal uses.
export function findAgentByKey(agentKey) {
  for (const dept of Object.values(AGENT_DEPTS)) {
    for (const subcat of dept.subcategories) {
      const agent = subcat.agents.find((a) => a.key === agentKey);
      if (agent) return { ...agent, deptLabel: dept.label, subcatLabel: subcat.label, color: dept.color };
    }
  }
  return null;
}

// Shared label maps for an agent's metadata badges (autonomy/status/wave) —
// used by both the map's own agent-info modal (ConstellationTest.jsx) and
// any agent workspace's own info popover built from findAgentByKey().
export const AUTONOMY_LABEL = {
  'human-led': 'HUMAN-LED',
  'human-assisted': 'HUMAN-ASSISTED',
  'fully-autonomous': 'FULLY AUTONOMOUS',
};
export const STATUS_LABEL = {
  not_started: 'Not started',
  in_development: 'In development',
  live: 'Live',
};
export const WAVE_LABEL = { 1: 'WAVE 1', 2: 'WAVE 2', 3: 'WAVE 3' };
