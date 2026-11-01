// Local example data in the shape of the cockpit components (the real data comes from useProjectCockpit). Used for the first look and for the preview.
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

export const ACTIVE_PROJECTS = [
  { id: 14, name: 'Осінній розпродаж', client: 'Mellow Diamond', modeLabel: 'Креативи', stageLabel: 'Готово до перегляду', progress: 0.8, waiting: 5, tone: 'attention', updatedAt: ago(4) },
  { id: 21, name: 'Нова лінійка', client: 'Auto Plaza', modeLabel: 'Креативи', stageLabel: 'Креативщик: помилка кроку', progress: 0.6, waiting: 1, tone: 'problem', updatedAt: ago(35) },
  { id: 9, name: 'Позиціонування', client: 'Nordic Pet', modeLabel: 'Стратегія', stageLabel: 'Стратег чекає відповіді', progress: 0.2, waiting: 1, tone: 'attention', updatedAt: ago(70) },
  { id: 7, name: 'Весняна кампанія', client: 'Salon-Fresh', modeLabel: 'Повна кампанія', stageLabel: 'Копірайтер працює', progress: 0.45, waiting: 0, tone: 'ok', updatedAt: ago(2) },
  { id: 5, name: 'Оптимізація жовтня', client: 'Bakery Lviv', modeLabel: 'Аналіз і оптимізація', stageLabel: 'Контроль якості', progress: 0.9, waiting: 0, tone: 'ok', updatedAt: ago(12) },
];

const gradient = (a, b) => `linear-gradient(150deg, ${a}, ${b})`;
const CREATIVES = [
  { id: 1, url: '', gradient: gradient('#B544B5', '#661466'), ratio: '4:5', conceptName: 'Осінь у діамантах', status: 'review' },
  { id: 2, url: '', gradient: gradient('#F5B04A', '#B5651D'), ratio: '4:5', conceptName: 'Подарунок, який не забудуть', status: 'review' },
  { id: 3, url: '', gradient: gradient('#7C8CF8', '#3B3FA8'), ratio: '9:16', conceptName: 'Світло, що залишається', status: 'review' },
  { id: 4, url: '', gradient: gradient('#E46AA8', '#8E1D63'), ratio: '4:5', conceptName: 'Кольє для вас', status: 'review' },
  { id: 5, url: '', gradient: gradient('#4AD488', '#12803F'), ratio: '4:5', conceptName: 'Остання осінь знижок', status: 'review' },
  { id: 6, url: '', gradient: gradient('#B544B5', '#661466'), ratio: '9:16', conceptName: 'Осінь у діамантах, сторіз', status: 'review' },
];

const item = (id, conceptName, ratio, status, g, extra = {}) => ({ id, url: '', downloadUrl: '', ratio, conceptName, status, kind: 'image', fileName: `autumn-sale-${String(id).padStart(2, '0')}.png`, note: '', gradient: g, ...extra });
const ITEMS_14 = [
  item(1, 'Осінь у діамантах', '4:5', 'review', gradient('#B544B5', '#661466'), { note: 'Тепле світло, діаманти в центрі кадру. Текст із заданого набору, дослівно.' }),
  item(2, 'Подарунок, який не забудуть', '4:5', 'review', gradient('#F5B04A', '#B5651D'), { note: 'Подарункова коробка, акцент на дедлайні акції.' }),
  item(3, 'Світло, що залишається', '9:16', 'review', gradient('#7C8CF8', '#3B3FA8'), { note: 'Сторіз: вечірнє світло, колекція «Вечірнє золото».' }),
  item(4, 'Кольє для вас', '4:5', 'approved', gradient('#E46AA8', '#8E1D63'), { note: 'Затверджено вчора.' }),
  item(5, 'Остання осінь знижок', '4:5', 'approved', gradient('#4AD488', '#12803F'), { note: 'Затверджено вчора.' }),
  item(6, 'Осінь у діамантах, сторіз', '9:16', 'rejected', gradient('#B544B5', '#661466'), { note: 'Повернено з коментарем: збільшити текст і посунути його від краю.' }),
  item(7, 'Відео для сторіз', '9:16', 'failed', gradient('#555', '#222'), { kind: 'video', fileName: 'story-video.mp4', note: 'Не згенеровано: ліміт швидкості Higgsfield.' }),
  item(8, 'Вечірнє світло', '4:5', 'producing', gradient('#9aa4f8', '#5b66c8'), { note: 'У роботі, буде за кілька хвилин.' }),
];

export const COCKPIT_WAITING = {
  id: 14, name: 'Осінній розпродаж', client: 'Mellow Diamond', modeLabel: 'Креативи', tone: 'attention', waiting: 5, status: 'active', activeRequestId: 14,
  stages: [
    { key: 'strategy', label: 'Стратег', state: 'done', note: 'готово' },
    { key: 'brief', label: 'ТЗ', state: 'done', note: 'готово' },
    { key: 'copy', label: 'Копірайтер', state: 'done', note: 'готово · 5 текстів', parallel: 'make' },
    { key: 'maker', label: 'Креативщик', state: 'failed', note: 'впав 1 крок з 8', parallel: 'make' },
    { key: 'quality', label: 'Контроль якості', state: 'working', note: 'перевіряє' },
    { key: 'you', label: 'Ви', state: 'waiting', note: 'чекає на вас' },
  ],
  currentStageKey: 'you',
  attention: [
    { id: 'rv-14', kind: 'review', tone: 'attention', title: 'Креативи на перегляд', text: 'Креативщик і Контроль якості передали 6 креативів.', requestId: 14, creatives: CREATIVES,
      actions: [{ key: 'approve_all', label: 'Схвалити всі 6', primary: true }, { key: 'approve_one', label: 'Схвалити' }, { key: 'return', label: 'Повернути з коментарем' }] },
    { id: 'q-1', kind: 'question', tone: 'attention', title: 'Питання від Копірайтера', text: 'Перекласти тексти на англійську чи лишити українською?', requestId: 14, options: ['Лишити українську', 'Перекласти на English'], actions: [{ key: 'answer', label: 'Відповісти', primary: true }] },
    { id: 'ma-1', kind: 'missing_assets', tone: 'attention', title: 'Креативщику не вистачає фото товару', text: 'Без фото креативи будуть менш точними. Можна пропустити.', requestId: 14, actions: [{ key: 'upload_assets', label: 'Додати файли' }, { key: 'dismiss', label: 'Пропустити, менш точно' }] },
    { id: 'fs-1', kind: 'failed_step', tone: 'problem', title: 'Впав крок «Відео для сторіз»', text: 'Higgsfield відхилив запит: ліміт швидкості. Інші 7 кроків готові.', requestId: 14, actions: [{ key: 'retry_step', label: 'Повторити крок', primary: true }] },
    { id: 'qc-1', kind: 'qc_remark', tone: 'attention', title: 'Зауваження контролю якості', text: 'На креативі №3 (сторіз) текст виходить за безпечну зону.', requestId: 14, actions: [{ key: 'retry_step', label: 'Виправити автоматично', primary: true }, { key: 'dismiss', label: 'Лишити як є' }] },
    { id: 'es-1', kind: 'estimate', tone: 'attention', title: 'Оцінка генерації', text: '6 зображень і 2 відео в Higgsfield. Баланс $48.20.', requestId: 14, estimate: { usd: 3.4, count: 8, limitUsd: 48.2 }, actions: [{ key: 'confirm_generation', label: 'Підтвердити генерацію · $3.40', primary: true }] },
  ],
  requests: [
    { id: 14, title: 'Осінній розпродаж', status: 'review', statusLabel: 'на перегляд', updatedAt: ago(4), creatives: { total: 8, review: 3, approved: 2, failed: 1 }, items: ITEMS_14 },
    { id: 13, title: 'Подарунки до Дня матері', status: 'approved', statusLabel: 'затверджено', updatedAt: ago(60 * 24 * 8), creatives: { total: 8, review: 0, approved: 8, failed: 0 }, items: ITEMS_14.slice(0, 5).map((x, k) => ({ ...x, id: 100 + k, status: 'approved', conceptName: 'Подарунок ' + (k + 1) })) },
    { id: 12, title: 'Вечірня колекція', status: 'problem', statusLabel: 'проблема', updatedAt: ago(60 * 24 * 13), creatives: { total: 5, review: 0, approved: 3, failed: 2 }, items: ITEMS_14.slice(0, 5).map((x, k) => ({ ...x, id: 200 + k, status: k < 3 ? 'approved' : 'failed', conceptName: 'Колекція ' + (k + 1) })) },
    { id: 11, title: 'Новинки жовтня', status: 'problem', statusLabel: 'проблема', updatedAt: ago(60 * 24 * 15), creatives: { total: 0, review: 0, approved: 0, failed: 0 }, items: [] },
    { id: 10, title: 'Листопад: ідеї', status: 'draft', statusLabel: 'чернетка', updatedAt: ago(60 * 24 * 17), creatives: { total: 0, review: 0, approved: 0, failed: 0 } },
  ],
  spend: { model: 2.14, higgsfield: 9.6, total: 11.74, currency: 'USD' },
};

export const COCKPIT_CALM = {
  id: 7, name: 'Весняна кампанія', client: 'Salon-Fresh', modeLabel: 'Повна кампанія', tone: 'ok', waiting: 0, status: 'active', activeRequestId: 7,
  stages: [
    { key: 'strategy', label: 'Стратег', state: 'done', note: 'готово' },
    { key: 'brief', label: 'ТЗ', state: 'done', note: 'готово' },
    { key: 'copy', label: 'Копірайтер', state: 'working', note: 'пише тексти…', parallel: 'make' },
    { key: 'maker', label: 'Креативщик', state: 'idle', note: 'чекає тексти', parallel: 'make' },
    { key: 'quality', label: 'Контроль якості', state: 'idle', note: 'чекає' },
    { key: 'you', label: 'Ви', state: 'idle', note: 'після перевірки' },
  ],
  currentStageKey: 'copy',
  attention: [],
  requests: [
    { id: 7, title: 'Весняна кампанія', status: 'running', statusLabel: 'працює', updatedAt: ago(2), creatives: { total: 0, review: 0, approved: 0, failed: 0 } },
    { id: 6, title: 'Бренд-платформа', status: 'approved', statusLabel: 'затверджено', updatedAt: ago(60 * 24 * 4), creatives: { total: 0, review: 0, approved: 0, failed: 0 } },
  ],
  spend: { model: 0.68, higgsfield: 2.42, total: 3.1, currency: 'USD' },
};
