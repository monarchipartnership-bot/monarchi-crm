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
            autonomyLevel: 'human-assisted',
            stage: 'orchestrate',
            wave: 1,
            status: 'not_started',
            description: 'Перетворює складну задачу на керований workflow і передає підзадачі потрібним агентам.',
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
    startHere: 'account-enrichment',
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
            autonomyLevel: 'human-assisted',
            stage: 'foundation',
            wave: 1,
            status: 'not_started',
            description: 'Розбирає Job Post або inbound-запит і перетворює його на структурований sales brief.',
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
            autonomyLevel: 'human-assisted',
            stage: 'foundation',
            wave: 1,
            status: 'not_started',
            description: 'За email або сайтом клієнта з угоди підтягує контекст (ніша, розмір компанії) у поле «Додатковий контекст» перед генерацією follow-up.',
            breaksInto: ['Пошук компанії за доменом', 'Визначення ніші й розміру'],
            wiredInto: ['Планується: пошуковий API'],
            buildsOn: [],
            whatItReplaces: 'Ручний гуглінг клієнта перед тим, як писати йому follow-up.',
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
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 3,
            status: 'not_started',
            description: 'Перевіряє, наскільки можливість відповідає ICP, послугам і комерційним обмеженням Mon’Archi.',
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
            autonomyLevel: 'human-assisted',
            stage: 'generate',
            wave: 1,
            status: 'not_started',
            description: 'Обирає один найбільш релевантний підтверджений кейс для конкретного ліда.',
          },
          {
            key: 'cover-letter-agent',
            name: 'Агент написання супровідних листів',
            icon: AGENT_ICONS.mail,
            autonomyLevel: 'human-assisted',
            stage: 'generate',
            wave: 1,
            status: 'not_started',
            description: 'Створює персоналізований Upwork cover letter або первинну sales-відповідь за затвердженою структурою.',
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
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 3,
            status: 'not_started',
            description: 'Розбирає вхідну відповідь клієнта і пропонує зрозумілий наступний крок.',
          },
          {
            key: 'deal-health-check',
            name: 'Агент контролю стану угод',
            icon: AGENT_ICONS.pulse,
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 1,
            status: 'not_started',
            description: 'Переглядає угоди без активності N днів і пропонує менеджеру список «потребують уваги» з коротким поясненням чому.',
            breaksInto: ['Пошук застояних угод', 'Пояснення причини застою'],
            wiredInto: ['Планується: deals, tasks'],
            buildsOn: [],
            whatItReplaces: 'Ручний перегляд усіх угод, щоб не пропустити застояну.',
            ladder: {
              humanLed: 'Менеджер сам регулярно переглядає список угод.',
              humanAssisted: 'Агент сам формує список «потребують уваги» щодня.',
              fullyAutonomous: 'Агент сам створює задачу «зв\'язатись» на застояну угоду.',
            },
            theHuman: 'Менеджер вирішує, що робити з кожною угодою зі списку.',
            buildNotes: 'Частково перетинається з Automation Dashboard — тут стає явним іменованим агентом.',
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
            autonomyLevel: 'human-assisted',
            stage: 'orchestrate',
            wave: 2,
            status: 'not_started',
            description: 'Утримує цілісний контекст клієнта і координує роботу Client Pod.',
          },
          {
            key: 'client-onboarding-meeting-coordinator',
            name: 'AI-координатор онбордингу клієнта та зустрічей',
            icon: AGENT_ICONS.calendar,
            autonomyLevel: 'human-assisted',
            stage: 'foundation',
            wave: 3,
            status: 'not_started',
            description: 'Об’єднує onboarding клієнта та підготовку/фіксацію робочих зустрічей у V1.',
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
            autonomyLevel: 'human-assisted',
            stage: 'foundation',
            wave: 3,
            status: 'not_started',
            description: 'Розбирає бізнес клієнта до рівня, достатнього для performance-стратегії.',
          },
          {
            key: 'competitor-research-agent',
            name: 'Агент дослідження конкурентів',
            icon: DEPT_ICONS.seoSearch,
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 3,
            status: 'not_started',
            description: 'Досліджує конкурентів та їхні рекламні й комерційні підходи.',
          },
          {
            key: 'audience-research-agent',
            name: 'Агент дослідження аудиторії',
            icon: AGENT_ICONS.target,
            autonomyLevel: 'human-assisted',
            stage: 'foundation',
            wave: 3,
            status: 'not_started',
            description: 'Розбиває ринок на робочі аудиторії та пов’язує їх із pain, motivation, trigger і message.',
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
            autonomyLevel: 'human-assisted',
            stage: 'orchestrate',
            wave: 2,
            status: 'not_started',
            description: 'Збирає дослідження, бізнес-цілі та дані в єдину performance marketing strategy.',
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
          },
          {
            key: 'google-optimization-agent',
            name: 'Агент оптимізації Google Ads',
            icon: DEPT_ICONS.refresh,
            autonomyLevel: 'human-assisted',
            stage: 'generate',
            wave: 2,
            status: 'not_started',
            description: 'Перетворює діагноз Google Ads на конкретний план оптимізації з пріоритетом і очікуваним ефектом.',
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
            autonomyLevel: 'human-assisted',
            stage: 'generate',
            wave: 3,
            status: 'not_started',
            description: 'Пише рекламні тексти та сценарії під конкретну performance-гіпотезу.',
            buildNotes: 'Найближчий родич уже готового Follow-up Generator — імовірно, найшвидший до реалізації, бо CORE+STYLE промпт-архітектура вже перевірена й перевикористовується напряму.',
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
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 1,
            status: 'not_started',
            description: 'Перевіряє, чи можна довіряти даним, на яких працюють інші агенти.',
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
            autonomyLevel: 'human-assisted',
            stage: 'capture',
            wave: 1,
            status: 'not_started',
            description: 'Незалежно перевіряє критичні outputs інших агентів перед використанням чи відправкою.',
          },
        ],
      },
    ],
  },
};

// Flattens AGENT_DEPTS to look an agent up by its own `key` — used where a
// specific agent's real data (name/description/icon) is needed outside the
// map itself, e.g. an agent's own workspace header, so that text is never
// duplicated/invented a second time.
export function findAgentByKey(agentKey) {
  for (const dept of Object.values(AGENT_DEPTS)) {
    for (const subcat of dept.subcategories) {
      const agent = subcat.agents.find((a) => a.key === agentKey);
      if (agent) return agent;
    }
  }
  return null;
}
