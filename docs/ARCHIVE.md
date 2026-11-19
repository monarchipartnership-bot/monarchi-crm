# Архів старої системи агентів (листопад 2026)

**Навіщо.** Нова система агентів будується суворо за документом «Робочий процес клієнта» (5 агентів + оркестратор у коді). Усе, що належало старій системі і не буде використовуватись, винесено з проєкту в окрему папку, щоб не засмічувати код. Нічого не видалено остаточно.

## Де лежить

- Папка поза проєктом: `D:\Monarchi\Monarchi CRM\_archive-legacy-2026-11\` — повторює структуру `app/` (`api/`, `src/`, `scripts/`).
  - `api/` — 9 ендпоінтів (`agent-queue`, `smm-*`, `site-lead*`, `creative-form-fill`, `ads-insights-chat`, `fetch-website-text`) + `api/_lib/` (23 файли: `agentEngine`, `campaign*`, `creative*`, `smm*`, `seo*`, `higgsfield` та ін.).
  - `src/` — 285 файлів: старі сторінки агентів, SMM, кабінет/карта (`Tools/cockpit`, `aiMap`, `agentMap3d`), `Projects/Teams`, `lib/agents`, стилі.
  - `scripts/` — `check-core.original.mjs` (повний старий тест) і `check-core.legacy.mjs` (лише перевірки старих агентів).
- Git-тег `legacy-before-cleanup-2026-11-19` (коміт e96b898) — повний стан проєкту до чистки. Повернути будь-що: `git show legacy-before-cleanup-2026-11-19:<шлях>`.

## Як відновити файл

Скопіювати з архіву на те саме місце в `app/` (шлях відносний до кореня `app/`), потім за потреби повернути рядок у `src/App.jsx` / `sidebarData.js` / `vercel.json`.

## Що розʼєднано (видно в застосунку)

- Вкладки «Команди» та «Креативи» в картці проєкту — прибрано.
- Меню «AI Агенти» веде на проміжну сторінку-заглушку `/ai-agents` (`src/pages/AiAgents/AiAgentsHome.jsx`), доки не зʼявляться екрани нової системи.
- Пункт меню SMM та «Заявки з сайту» (`/settings/site-leads`) — прибрано.
- `api/agent-tick.js` скорочено до: звіти проєктних агентів за розкладом, щоденна синхронізація Meta-акаунтів, heartbeat. Черга старих команд, нагадування по лідах і сповіщення про витрати — в архіві.
- `vercel.json`: прибрано записи 5 архівованих ендпоінтів; додано `api/wf-tick.js`.

## Що залишено свідомо

- **Таблиці в БД** (`ag_*`, `smm_*`, `site_leads` та ін.) — не чіпали; дані на місці.
- Друга чистка (за словом власника, 2026-11-19): ще 21 «мертвий» файл CRM, не повʼязаний з агентами, теж у архіві — Breadcrumbs, ClientActivityTab/ClientNotesTab, частина Automation і Reports (DayPicker, HubCard, FunnelChart), `groupSuggest`, `KnowledgeOrb`, api-обгортки `dealActivity`/`metaSync`/`projectProfile`/`systemState`, три css (`contactsDesign`, `dailyReportDesign`, `hubPage`), `login-people.png`. Ніхто їх не імпортував; збірка й тести проходять.
- Tools (калькулятор, Image Studio) — використовуються.
- Серверний код Meta-синхронізації (`metaOnboarding`, `metaAdsData`) — потрібен новій системі.

## Що перенести з архіву пізніше

- Для кроку A6 (Креатор): `creativeMake.js`, `creativeText.js`, `creativeInspect.js`, `higgsfield.js` — як джерело ідей і готових викликів, не копіювати як є.
- Ідеї рушія (оренда задач із lease, журнал запусків, версії промптів) вже перенесені у `api/_lib/wf/` і SQL-функцію `wf_claim_runs`.

## Перевірки

Після чистки: `npm run build` — ок; `scripts/check-core.mjs` — 170 перевірок; `scripts/check-workflow.mjs` — 21 перевірка; зламаних відносних імпортів немає.
