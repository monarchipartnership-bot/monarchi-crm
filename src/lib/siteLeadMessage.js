// The form of the Telegram message about a website lead: a template with {placeholders}. Shared by the server (what is really sent) and the
// settings page (the live preview), so the preview is exactly the message. Pure code.
//   Telegram HTML: only <b> <i> <u> <s> <code> are kept from the template; everything else, and every value from the form, is escaped,
//   so nothing a visitor types can become markup.
//   A line whose field placeholders are all empty disappears together with its label (no «Телефон: » with nothing after it).

export const FIELD_KEYS = ['name', 'email', 'phone', 'link', 'services', 'message', 'page', 'utm'];
export const PLACEHOLDERS = [
  { key: 'name', label: 'Імʼя' }, { key: 'email', label: 'E-mail' }, { key: 'phone', label: 'Телефон' }, { key: 'link', label: 'Посилання на проєкт' },
  { key: 'services', label: 'Послуги' }, { key: 'message', label: 'Повідомлення' }, { key: 'page', label: 'Сторінка сайту' }, { key: 'utm', label: 'UTM-мітки' },
  { key: 'time', label: 'Час' }, { key: 'returning', label: 'Позначка «клієнт уже є»' }, { key: 'ping', label: 'Кого позначити' },
];

export const DEFAULT_TEMPLATE = [
  '🆕 <b>Нова заявка з сайту</b>{returning}',
  '<b>Імʼя:</b> {name}',
  '<b>E-mail:</b> {email}',
  '<b>Телефон:</b> {phone}',
  '<b>Проєкт:</b> {link}',
  '<b>Послуги:</b> {services}',
  '<b>Повідомлення:</b> {message}',
  '<b>Сторінка:</b> {page}',
  '<b>UTM:</b> {utm}',
  '{ping}',
].join('\n');

export const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ALLOWED_TAG = /<(\/?)(b|i|u|s|code)>/gi;

// The template text with only the allowed tags kept (the rest of < and > escaped).
export function safeTemplate(t) {
  const tags = [];
  const masked = String(t || '').replace(ALLOWED_TAG, (m, slash, tag) => { tags.push(`<${slash}${tag.toLowerCase()}>`); return `\u0001${tags.length - 1}\u0002`; });
  return escapeHtml(masked).replace(/\u0001(\d+)\u0002/g, (_, i) => tags[Number(i)]);
}

// values: raw strings (and `ping` / `returning` which are already safe HTML). → the HTML text to send.
export function renderMessage(template, values, { clipMessage = 900 } = {}) {
  const v = { ...values, message: String(values.message || '').slice(0, clipMessage) };
  const text = safeTemplate(template || DEFAULT_TEMPLATE);
  const isHtmlValue = (k) => k === 'ping' || k === 'returning';
  const out = [];
  for (const line of text.split('\n')) {
    const keys = [...line.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1]);
    const fields = keys.filter((k) => FIELD_KEYS.includes(k));
    if (fields.length && fields.every((k) => !String(v[k] || '').trim())) continue;
    if (keys.length && !fields.length && keys.every((k) => !String(v[k] || '').trim()) && line.replace(/\{[a-z]+\}/g, '').trim() === '') continue; // a line that is only an empty {ping}
    out.push(line.replace(/\{([a-z]+)\}/g, (m, k) => (k in v ? (isHtmlValue(k) ? String(v[k] || '') : escapeHtml(String(v[k] ?? ''))) : m)));
  }
  let html = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!/\{ping\}/.test(String(template || DEFAULT_TEMPLATE)) && v.ping) html += `\n${v.ping}`;
  return html.slice(0, 4000);
}

// How a person is mentioned in Telegram: @username when there is one, otherwise a link by user id (works without a username).
export const mentionOf = (m) => (m.username ? `@${escapeHtml(m.username)}` : `<a href="tg://user?id=${Number(m.user_id)}">${escapeHtml(m.name || 'учасник')}</a>`);

export const SAMPLE_LEAD = { name: 'Анна Коваль', email: 'anna@example.com', phone: '+380501234567', link: 'https://shop.example', services: 'Google Ads, SEO', message: 'Хочемо запустити рекламу для інтернет-магазину.', page: 'https://www.monarchi.agency/', utm: 'source=google, medium=cpc' };
