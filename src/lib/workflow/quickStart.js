// «Швидкий старт» (Zeely item 4): a link is enough to begin. PURE helpers of the form; the calls are in src/lib/api/quickStart.js.

// What a manager typed → an address the server may read, or null. Only http(s), only a real host name (a dot), nothing with a login in it.
export function normalizeSite(raw) {
  let s = String(raw || '').trim();
  if (!s || /\s/.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || !u.hostname.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) return null;
  return u.origin + (u.pathname === '/' ? '' : u.pathname.replace(/\/$/, ''));
}

// a name for the project when the manager gave none: «www.loza-mebli.com.ua» → «Loza mebli»
export function nameFromSite(site) {
  try {
    const host = new URL(site).hostname.replace(/^www\./, '');
    const label = host.split('.')[0].replace(/[-_]+/g, ' ').trim();
    return label ? label[0].toUpperCase() + label.slice(1) : host;
  } catch { return ''; }
}

// the five things that happen after the button, in the words of the manager (shown in the dialog and in the help)
export const QUICK_STEPS = [
  'Створюється проєкт із цим сайтом (і кабінетом Meta, якщо ви його обрали).',
  'Дослідник читає сайт і складає ЧЕРНЕТКУ брифу: товари, ціни, аудиторія, цілі перших креативів.',
  'Ви перевіряєте бриф, дописуєте цифри (бюджет, ROAS, чек) і підтверджуєте його.',
  'Після підтвердження брифу, оплати й договорів процес іде сам: дослідження, ДНК бренду, ідеї, креативи, стратегія, пакет на Апрув 1.',
  'Перший запуск у кабінет іде ВИМКНЕНИМ (PAUSED): гроші не витрачаються, доки ви самі не ввімкнете кампанії в Ads Manager.',
];
