// Extra columns of a Meta report: the metrics of Ads Manager's «Стовпці» that the standard report does not show, picked per project.
// Pure code shared by the browser (the picker, the tables) and the server (api/meta-ads-insights.js asks Meta only for what is picked).
//
// Two layers:
//   COUNTS   the raw numbers Meta reports (link clicks, add to cart, video views...). Each is read from an insights field or from
//            the `actions` list and is stored in a report as an additive base number `x_<count>` (so campaigns, groups and periods sum).
//   METRICS  what a person picks and sees: a count itself or a figure computed from counts (cost per add to cart, hook rate...).
//            key `mx_...`, with `needs` = the counts it is made of, `calc(base)` and how to format it.
// Ads Manager's own interface fields (recommendations, attribution setting, delivery status) are not numbers and are not here.

// source: { field }  a plain insights field            { list }  an insights field that is a list [{ action_type, value }]
//         { action: [types] }  the first matching type in `actions` (several aliases of one event come together: never summed)
export const COUNTS = {
  link_clicks: { field: 'inline_link_clicks' },
  outbound_clicks: { list: 'outbound_clicks' },
  landing_page_views: { action: ['landing_page_view', 'omni_landing_page_view'] },
  post_engagement: { action: ['post_engagement'] },
  reactions: { action: ['post_reaction'] },
  comments: { action: ['comment'] },
  shares: { action: ['post'] },
  saves: { action: ['onsite_conversion.post_save'] },
  view_content: { action: ['omni_view_content', 'view_content', 'offsite_conversion.fb_pixel_view_content'] },
  add_to_cart: { action: ['omni_add_to_cart', 'add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'] },
  initiate_checkout: { action: ['omni_initiated_checkout', 'initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'] },
  add_payment_info: { action: ['add_payment_info', 'offsite_conversion.fb_pixel_add_payment_info'] },
  registrations: { action: ['omni_complete_registration', 'complete_registration', 'offsite_conversion.fb_pixel_complete_registration'] },
  messages: { action: ['onsite_conversion.messaging_conversation_started_7d'] },
  video_3s: { action: ['video_view'] },
  thruplay: { list: 'video_thruplay_watched_actions' },
  video_p25: { list: 'video_p25_watched_actions' },
  video_p50: { list: 'video_p50_watched_actions' },
  video_p75: { list: 'video_p75_watched_actions' },
  video_p100: { list: 'video_p100_watched_actions' },
};

// null when either side is missing (a column that was never fetched is «—», not a made-up 0) or the divisor is 0.
export function ratio(a, b, k = 1) {
  if (a == null || b == null) return null;
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || y === 0) return null;
  return (x / y) * k;
}
export const X = (k) => `x_${k}`;

export const count = (key, group, label, en, goodWhen = 'up') => ({ key: `mx_${key}`, group, label, en, format: 'number', goodWhen, needs: [key], calc: (b) => (b[X(key)] == null ? null : Number(b[X(key)])) });
export const cost = (id, group, label, en, countKey) => ({ key: `mx_cost_${id}`, group, label, en, format: 'money', goodWhen: 'down', needs: [countKey], calc: (b) => ratio(b.spend, b[X(countKey)]) });
export const rate = (id, group, label, en, num, den) => ({ key: `mx_${id}`, group, label, en, format: 'percent', goodWhen: 'up', needs: [num, ...(den ? [den] : [])], calc: (b) => ratio(b[X(num)], den ? b[X(den)] : b.impressions, 100) });

export const G = { reach: 'Охоплення та частота', interaction: 'Взаємодія', funnel: 'Воронка сайту', messages: 'Повідомлення', video: 'Відео' };

export const META_METRIC_LIST = [
  { key: 'mx_frequency', group: G.reach, label: 'Частота', en: 'Frequency', format: 'number', goodWhen: 'neutral', needs: [], calc: (b) => ratio(b.impressions, b.reach) },

  count('link_clicks', G.interaction, 'Кліки по посиланню', 'Link clicks'),
  cost('link_click', G.interaction, 'Ціна за клік по посиланню', 'CPC (link click)', 'link_clicks'),
  rate('link_ctr', G.interaction, 'CTR по посиланню', 'CTR (link click)', 'link_clicks'),
  count('outbound_clicks', G.interaction, 'Вихідні кліки', 'Outbound clicks'),
  cost('outbound_click', G.interaction, 'Ціна за вихідний клік', 'Cost per outbound click', 'outbound_clicks'),
  count('post_engagement', G.interaction, 'Взаємодія з публікацією', 'Post engagements'),
  cost('post_engagement', G.interaction, 'Ціна за взаємодію', 'Cost per engagement', 'post_engagement'),
  rate('engagement_rate', G.interaction, 'Рівень взаємодії', 'Engagement rate', 'post_engagement'),
  count('reactions', G.interaction, 'Реакції на публікацію', 'Post reactions'),
  count('comments', G.interaction, 'Коментарі', 'Post comments'),
  count('shares', G.interaction, 'Поширення', 'Post shares'),
  count('saves', G.interaction, 'Збереження', 'Post saves'),

  count('landing_page_views', G.funnel, 'Перегляди цільової сторінки', 'Landing page views'),
  cost('landing_page_view', G.funnel, 'Ціна за перегляд сторінки', 'Cost per landing page view', 'landing_page_views'),
  rate('landing_rate', G.funnel, 'Клік → перегляд сторінки', 'Click-to-page-view rate', 'landing_page_views', 'link_clicks'),
  count('view_content', G.funnel, 'Перегляди контенту', 'Content views'),
  cost('view_content', G.funnel, 'Ціна за перегляд контенту', 'Cost per content view', 'view_content'),
  count('add_to_cart', G.funnel, 'Додавання в кошик', 'Adds to cart'),
  cost('add_to_cart', G.funnel, 'Ціна додавання в кошик', 'Cost per add to cart', 'add_to_cart'),
  count('initiate_checkout', G.funnel, 'Початок оформлення', 'Checkouts initiated'),
  cost('initiate_checkout', G.funnel, 'Ціна початку оформлення', 'Cost per checkout', 'initiate_checkout'),
  count('add_payment_info', G.funnel, 'Додавання платіжних даних', 'Payment info added'),
  cost('add_payment_info', G.funnel, 'Ціна додавання платіжних даних', 'Cost per payment info', 'add_payment_info'),
  count('registrations', G.funnel, 'Реєстрації', 'Registrations'),
  cost('registration', G.funnel, 'Ціна реєстрації', 'Cost per registration', 'registrations'),
  { key: 'mx_cart_to_purchase', group: G.funnel, label: 'Кошик → покупка', en: 'Cart-to-purchase rate', format: 'percent', goodWhen: 'up', needs: ['add_to_cart'], calc: (b) => ratio(b.purchases, b[X('add_to_cart')], 100) },

  count('messages', G.messages, 'Початі переписки', 'Conversations started'),
  cost('message', G.messages, 'Ціна початої переписки', 'Cost per conversation', 'messages'),

  count('video_3s', G.video, 'Перегляди відео (3 с)', '3-second video plays'),
  cost('video_3s', G.video, 'Ціна перегляду відео (3 с)', 'Cost per 3-second play', 'video_3s'),
  rate('hook_rate', G.video, 'Hook rate (3 с / покази)', 'Hook rate', 'video_3s'),
  count('thruplay', G.video, 'ThruPlay', 'ThruPlays'),
  cost('thruplay', G.video, 'Ціна ThruPlay', 'Cost per ThruPlay', 'thruplay'),
  rate('hold_rate', G.video, 'Hold rate (ThruPlay / 3 с)', 'Hold rate', 'thruplay', 'video_3s'),
  count('video_p25', G.video, 'Відео переглянуто на 25%', 'Video watched to 25%'),
  count('video_p50', G.video, 'Відео переглянуто на 50%', 'Video watched to 50%'),
  count('video_p75', G.video, 'Відео переглянуто на 75%', 'Video watched to 75%'),
  count('video_p100', G.video, 'Відео переглянуто на 100%', 'Video watched to 100%'),
];

export const META_METRICS = Object.fromEntries(META_METRIC_LIST.map((m) => [m.key, m]));
export const isExtraMetric = (key) => typeof key === 'string' && key.startsWith('mx_');

// Only keys of the platform's catalog survive (what comes back from storage or a request is never trusted).
export const cleanColumns = (platform, keys) => (platform === 'meta' ? [...new Set((keys || []).filter((k) => META_METRICS[k]))] : []);

// The raw counts needed for these metric keys.
export const countsFor = (keys) => [...new Set(cleanColumns('meta', keys).flatMap((k) => META_METRICS[k].needs))];

// The insights fields to ask Meta for, on top of the standard ones, for the counts of the picked metrics.
export function insightFieldsFor(keys) {
  const out = new Set();
  countsFor(keys).forEach((c) => { const s = COUNTS[c]; if (s.field) out.add(s.field); if (s.list) out.add(s.list); });
  return [...out];
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
function pickAction(list, types) {
  if (!Array.isArray(list)) return 0;
  for (const t of types) { const hit = list.find((a) => a.action_type === t); if (hit) return num(hit.value); }
  return 0;
}

// One raw insights row → { x_<count>: number } for the counts of the picked metrics.
export function extractCounts(row, keys) {
  const out = {};
  countsFor(keys).forEach((c) => {
    const s = COUNTS[c];
    out[X(c)] = s.field ? num(row[s.field]) : s.list ? num(Array.isArray(row[s.list]) ? row[s.list][0]?.value : 0) : pickAction(row.actions, s.action);
  });
  return out;
}

// The `x_` numbers of a row, as the report stores them.
export const pickCounts = (row) => Object.fromEntries(Object.entries(row || {}).filter(([k, v]) => k.startsWith('x_') && v != null));
