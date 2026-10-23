# Panels of the 3D map prototype that are not in the CRM yet

The prototype (`D:/Monarchi/Prototypes/ai-world`, standalone) had its own interface layer (`src/ui.js`, `src/style.css`). When the 3D map was
moved into the CRM (2026-10-23, decision 30) the page kept **its own existing panels**; only what belongs to the scene itself came along (department
flags, agent boxes, the camera buttons, the time-of-day switch). The prototype panels below can replace or complement the page's current ones
**one at a time** if the owner wants them.

| Prototype panel | What it shows | Page element it would replace or sit next to |
| --- | --- | --- |
| Top bar (DONE 2026-10-24: restyled in the page: emblem, capsule, search and «До Hub» pills; still missing: department dropdown, «Демо-режим» pill) | Logo + «AI Agents / Monarchi Hub», section capsule, search with results, department dropdown, «Демо-режим» pill, «До Hub» | The page's brand, section nav, search (`agent-search`) and exit pill |
| KPI cards (DONE 2026-10-24: `ai-kpis` in the page, the footer pill with the counts was removed) | Four cards: agents / Live / in development / planned, with a coloured dot and a caption | The footer pill with counts (`ai-footer`) |
| Selected-object card (`detail`) | For a department: description, three status bars, «Всі відділи». For an agent: status, stage, autonomy, description, sub-function | The department panel (`dept-panel`) and the agent info modal |
| Department and agent lists (`table`) | Two tabs («Відділи 7» / «Агенти 31»), rows with number, name, count, selected row highlighted, scroll | The Агенти catalog and the carousel at the bottom |
| «Рух задачі по відділах» (`stepper`) | Six-step strip of the demo task going through the chain (Стратегія → Креативи → Реклама → Звіти → Клієнти → Продажі) with the current step and a «демо» tag | Nothing today (the 3D scene has the moving demo van and a «Демо-задача» tag) |
| «Назад до міста» button | Appears while a department is open | The page's «Всі відділи» button |
| Department dropdown | Jump to any department from the top bar | The carousel (prev/next) |

Already in the CRM from the prototype: department flags above buildings, agent boxes (variant F), camera buttons (zoom, rotate, home),
time-of-day switch (Авто / День / Ніч), hover highlight and the fade of the row in front.
