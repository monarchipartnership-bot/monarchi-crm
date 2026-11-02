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

const HAND_METRICS = [
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

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// The rest of Ads Manager's «Стовпці» (2026-11-03): every numeric field of the Insights API (the AdsInsights field list of Meta's own SDK) and every standard conversion
// event in every channel, generated from small tables so the whole catalog stays checkable. Text fields (ids, names, dates, targeting, labels), the three quality rankings
// and averages that cannot be added up are not columns. Counts of PEOPLE (unique clicks, reach-like numbers) are not additive: groups and totals sum them, as reach is summed.
// A key is at most 40 characters (the layout stores keys with that limit).
//   COUNT sources added here: { field } / { list } read any insights field (a list is summed), { action } the first matching type of `actions`,
//   { value } the first matching type of `action_values` (money), { results } the objective result of the campaign.
// ---------------------------------------------------------------------------------------------------------------------------------------------------

const G2 = {
  clicks: 'Кліки та CTR', results: 'Результати', purchases: 'Покупки та ROAS', mm: 'Маркетингові повідомлення', catalog: 'Каталог і товари', instant: 'Миттєвий досвід',
  evAll: 'Події: усі канали', evWeb: 'Події: сайт (піксель)', evApp: 'Події: застосунок', onsite: 'Події в Meta і месенджерах', app: 'Застосунок',
};
Object.assign(G, G2);

const GEN_COUNTS = {};
const GEN = [];
const addCount = (key, source) => { GEN_COUNTS[key] = source; };
const numberMetric = (key, group, label, en, goodWhen = 'up') => count(key, group, label, en, goodWhen);
const moneyMetric = (key, group, label, en) => ({ key: `mx_${key}`, group, label, en, format: 'money', goodWhen: 'up', needs: [key], calc: (b) => (b[X(key)] == null ? null : Number(b[X(key)])) });
// a ratio of two counts (or of a count and a standard number): num / den × k
const share = (id, group, label, en, num, den, k = 100, format = 'percent', goodWhen = 'up') => ({
  key: `mx_${id}`, group, label, en, format, goodWhen, needs: [num, ...(den && !BASE_DEN.has(den) ? [den] : [])],
  calc: (b) => ratio(b[X(num)], BASE_DEN.has(den) ? b[den] : den ? b[X(den)] : b.impressions, k),
});
const BASE_DEN = new Set(['impressions', 'reach', 'clicks', 'spend', 'purchases']);
// the price of one: spend / count (or an own spend, like the spend of marketing messages)
const priceOf = (id, group, label, en, num, spendCount = null) => ({
  key: `mx_cost_${id}`, group, label, en, format: 'money', goodWhen: 'down', needs: [num, ...(spendCount ? [spendCount] : [])],
  calc: (b) => ratio(spendCount ? b[X(spendCount)] : b.spend, b[X(num)]),
});
const returnOf = (id, group, label, en, valueCount) => ({ key: `mx_roas_${id}`, group, label, en, format: 'ratio', goodWhen: 'up', needs: [valueCount], calc: (b) => ratio(b[X(valueCount)], b.spend) });

// ---- plain insights fields: [count, field, group, label, en, money?, withPrice?]
const FIELD_COUNTS = [
  ['unique_clicks', 'unique_clicks', G.clicks, 'Унікальні кліки (усі)', 'Unique clicks (all)'],
  ['unique_link_clicks', 'unique_inline_link_clicks', G.clicks, 'Унікальні кліки по посиланню', 'Unique link clicks'],
  ['unique_outbound_clicks', 'unique_outbound_clicks', G.clicks, 'Унікальні вихідні кліки', 'Unique outbound clicks'],
  ['full_view_impr', 'full_view_impressions', G.reach, 'Покази повного перегляду', 'Full-view impressions'],
  ['full_view_reach', 'full_view_reach', G.reach, 'Охоплення повного перегляду', 'Full-view reach'],
  ['recallers', 'estimated_ad_recallers', G.reach, 'Орієнтовне запамʼятовування реклами (осіб)', 'Estimated ad recallers'],
  ['social_spend', 'social_spend', G.reach, 'Витрати на соціальні покази', 'Social spend', true],
  ['interactive_tap', 'interactive_component_tap', G.interaction, 'Тапи по інтерактивних елементах', 'Interactive component taps'],
  ['total_card_view', 'total_card_view', G.interaction, 'Перегляди карток', 'Card views'],
  ['ig_reminders', 'instagram_upcoming_event_reminders_set', G.interaction, 'Нагадування про події в Instagram', 'Instagram event reminders set'],
  ['instant_open', 'instant_experience_clicks_to_open', G.instant, 'Кліки на відкриття миттєвого досвіду', 'Instant Experience clicks to open'],
  ['instant_start', 'instant_experience_clicks_to_start', G.instant, 'Кліки на запуск миттєвого досвіду', 'Instant Experience clicks to start'],
  ['instant_outbound', 'instant_experience_outbound_clicks', G.instant, 'Вихідні кліки з миттєвого досвіду', 'Instant Experience outbound clicks'],
  ['video_plays', 'video_play_actions', G.video, 'Відтворення відео', 'Video plays', false, true],
  ['video_2s', 'video_continuous_2_sec_watched_actions', G.video, 'Безперервні перегляди відео (2 с)', 'Continuous 2-second video plays', false, true],
  ['video_2s_uniq', 'unique_video_continuous_2_sec_watched_actions', G.video, 'Унікальні безперервні перегляди (2 с)', 'Unique continuous 2-second plays'],
  ['video_15s', 'video_15_sec_watched_actions', G.video, 'Перегляди відео (15 с)', '15-second video plays', false, true],
  ['video_15s_uniq', 'unique_video_view_15_sec', G.video, 'Унікальні перегляди відео (15 с)', 'Unique 15-second video views'],
  ['video_30s', 'video_30_sec_watched_actions', G.video, 'Перегляди відео (30 с)', '30-second video plays', false, true],
  ['video_p95', 'video_p95_watched_actions', G.video, 'Відео переглянуто на 95%', 'Video watched to 95%'],
  ['video_time', 'video_time_watched_actions', G.video, 'Загальний час перегляду відео (с)', 'Video watch time (seconds)'],
  ['conv_leads', 'conversion_leads', G.results, 'Ліди (конверсії)', 'Conversion leads', false, true],
  ['dda_results', 'dda_results', G.results, 'Результати (data-driven attribution)', 'DDA results', false, true],
  ['sp_postbacks', 'total_postbacks', G.messages, 'Постбеки з месенджера', 'Postbacks'],
  ['product_views', 'product_views', G.catalog, 'Перегляди товарів', 'Product views'],
  ['shops_purchases', 'shops_assisted_purchases', G.catalog, 'Покупки через Shops', 'Shops-assisted purchases', false, true],
  ['conv_qty', 'converted_product_quantity', G.catalog, 'Кількість куплених товарів', 'Converted product quantity'],
  ['conv_value', 'converted_product_value', G.catalog, 'Вартість куплених товарів', 'Converted product value', true],
  ['conv_promo_qty', 'converted_promoted_product_quantity', G.catalog, 'Кількість куплених рекламованих товарів', 'Promoted product quantity'],
  ['conv_promo_value', 'converted_promoted_product_value', G.catalog, 'Вартість куплених рекламованих товарів', 'Promoted product value', true],
  ['segment_value', 'catalog_segment_value', G.catalog, 'Цінність сегмента каталогу', 'Catalog segment value', true],
  ['mm_sent', 'marketing_messages_sent', G.mm, 'Маркетингові повідомлення: надіслано', 'Marketing messages sent'],
  ['mm_delivered', 'marketing_messages_delivered', G.mm, 'Маркетингові повідомлення: доставлено', 'Marketing messages delivered', false, false],
  ['mm_read', 'marketing_messages_read', G.mm, 'Маркетингові повідомлення: прочитано', 'Marketing messages read'],
  ['mm_link_click', 'marketing_messages_link_btn_click', G.mm, 'Кліки по кнопці-посиланню', 'Link button clicks'],
  ['mm_quick_reply', 'marketing_messages_quick_reply_btn_click', G.mm, 'Кліки по кнопці швидкої відповіді', 'Quick reply button clicks'],
  ['mm_atc', 'marketing_messages_website_add_to_cart', G.mm, 'Додавання в кошик з повідомлень', 'Add to cart from messages'],
  ['mm_checkout', 'marketing_messages_website_initiate_checkout', G.mm, 'Початок оформлення з повідомлень', 'Checkout from messages'],
  ['mm_purchase', 'marketing_messages_website_purchase', G.mm, 'Покупки з повідомлень', 'Purchases from messages'],
  ['mm_purchase_value', 'marketing_messages_website_purchase_values', G.mm, 'Дохід від покупок з повідомлень', 'Purchase value from messages', true],
  ['mm_spend', 'marketing_messages_spend', G.mm, 'Витрати на маркетингові повідомлення', 'Marketing messages spend', true],
];
FIELD_COUNTS.forEach(([key, field, group, label, en, isMoney, withPrice]) => {
  addCount(key, { field });
  GEN.push(isMoney ? moneyMetric(key, group, label, en) : numberMetric(key, group, label, en));
  if (withPrice) GEN.push(priceOf(key, group, `Ціна: ${label.charAt(0).toLowerCase()}${label.slice(1)}`, `Cost per ${en.charAt(0).toLowerCase()}${en.slice(1)}`, key));
});

// the objective result of the campaign (Ads Manager's «Результати»): the first indicator of `results`
addCount('results', { results: 'results' });
GEN.push(numberMetric('results', G.results, 'Результати', 'Results'), priceOf('result', G.results, 'Ціна за результат', 'Cost per result', 'results'), share('result_rate', G.results, 'Рівень результатів (на 100 показів)', 'Result rate', 'results', null));

// ---- click-through rates and their prices (every CTR of Ads Manager); people-based ones are divided by reach, as Meta does
GEN.push(
  share('ctr_outbound', G.clicks, 'CTR (вихідні кліки)', 'CTR (outbound clicks)', 'outbound_clicks', null),
  share('ctr_unique_all', G.clicks, 'CTR (унікальні кліки, усі)', 'Unique CTR (all)', 'unique_clicks', 'reach'),
  share('ctr_unique_link', G.clicks, 'CTR (унікальні кліки по посиланню)', 'Unique CTR (link clicks)', 'unique_link_clicks', 'reach'),
  share('ctr_unique_outbound', G.clicks, 'CTR (унікальні вихідні кліки)', 'Unique CTR (outbound clicks)', 'unique_outbound_clicks', 'reach'),
  priceOf('unique_click', G.clicks, 'Ціна унікального кліка (усі)', 'Cost per unique click (all)', 'unique_clicks'),
  priceOf('unique_link_click', G.clicks, 'Ціна унікального кліка по посиланню', 'Cost per unique link click', 'unique_link_clicks'),
  priceOf('unique_outbound_click', G.clicks, 'Ціна унікального вихідного кліка', 'Cost per unique outbound click', 'unique_outbound_clicks'),
  priceOf('recaller', G.reach, 'Ціна запамʼятовування реклами', 'Cost per estimated ad recaller', 'recallers'),
  share('ad_recall_rate', G.reach, 'Рівень запамʼятовування реклами', 'Estimated ad recall rate', 'recallers', 'reach'),
);

GEN.push({ key: 'mx_cost_per_1000_reach', group: G.reach, label: 'Ціна за 1000 охоплених', en: 'Cost per 1,000 people reached', format: 'money', goodWhen: 'down', needs: [], calc: (b) => ratio(b.spend, b.reach, 1000) });

// ---- video rates
GEN.push(
  share('video_play_rate', G.video, 'Відтворення відео / покази', 'Video plays per impression', 'video_plays', null),
  share('thruplay_rate', G.video, 'ThruPlay / покази', 'ThruPlays per impression', 'thruplay', null),
  share('video_2s_rate', G.video, 'Перегляди 2 с / покази', '2-second plays per impression', 'video_2s', null),
  { key: 'mx_video_avg_time', group: G.video, label: 'Середній час перегляду відео (с)', en: 'Average video watch time (s)', format: 'number', goodWhen: 'up', needs: ['video_time', 'video_plays'], calc: (b) => ratio(b[X('video_time')], b[X('video_plays')]) },
);

// ---- messages: delivery, read and click rates; the price counts the spend of the messages themselves
GEN.push(
  share('mm_delivery_rate', G.mm, 'Рівень доставки повідомлень', 'Delivery rate', 'mm_delivered', 'mm_sent'),
  share('mm_read_rate', G.mm, 'Рівень прочитання повідомлень', 'Read rate', 'mm_read', 'mm_delivered'),
  share('mm_link_click_rate', G.mm, 'CTR маркетингових повідомлень (кнопка-посилання)', 'Link button click rate', 'mm_link_click', 'mm_delivered'),
  share('mm_quick_reply_rate', G.mm, 'Частка кліків по швидких відповідях', 'Quick reply click rate', 'mm_quick_reply', 'mm_delivered'),
  priceOf('mm_delivered', G.mm, 'Ціна доставленого повідомлення', 'Cost per delivered message', 'mm_delivered', 'mm_spend'),
  priceOf('mm_link_click', G.mm, 'Ціна кліка по кнопці-посиланню', 'Cost per link button click', 'mm_link_click', 'mm_spend'),
  returnOf('mm_roas', G.mm, 'ROAS повідомлень', 'Messages purchase ROAS', 'mm_purchase_value'),
);

// ---- ratios between steps of the path to a sale
GEN.push(
  { key: 'mx_purchase_per_click', group: G.purchases, label: 'Покупок на клік по посиланню', en: 'Purchases per link click', format: 'percent', goodWhen: 'up', needs: ['link_clicks'], calc: (b) => ratio(b.purchases, b[X('link_clicks')], 100) },
  { key: 'mx_purchase_per_lpv', group: G.purchases, label: 'Покупок на перегляд сторінки', en: 'Purchases per landing page view', format: 'percent', goodWhen: 'up', needs: ['landing_page_views'], calc: (b) => ratio(b.purchases, b[X('landing_page_views')], 100) },
  { key: 'mx_lpv_per_purchase', group: G.purchases, label: 'Переглядів сторінки на покупку', en: 'Landing page views per purchase', format: 'number', goodWhen: 'down', needs: ['landing_page_views'], calc: (b) => ratio(b[X('landing_page_views')], b.purchases) },
  { key: 'mx_clicks_per_result', group: G.results, label: 'Кліків по посиланню на результат', en: 'Link clicks per result', format: 'number', goodWhen: 'down', needs: ['link_clicks', 'results'], calc: (b) => ratio(b[X('link_clicks')], b[X('results')]) },
  share('lead_rate', G.results, 'Рівень лідів (на 100 показів)', 'Lead rate', 'conv_leads', null),
);

// ---- conversion events, by channel. type: the key of `actions` / `action_values`; id: the short key (the channel is the suffix: all / web / app)
// The newer events (contact, donate, schedule ...) come as <event>_total / _website / _mobile_app.
const EVENTS = [
  ['view_content', 'Перегляди контенту', 'Content views', { all: 'omni_view_content', web: 'offsite_conversion.fb_pixel_view_content', app: 'app_custom_event.fb_mobile_content_view' }, true],
  ['search', 'Пошуки', 'Searches', { all: 'omni_search', web: 'offsite_conversion.fb_pixel_search', app: 'app_custom_event.fb_mobile_search' }, false],
  ['add_to_cart', 'Додавання в кошик', 'Adds to cart', { all: 'omni_add_to_cart', web: 'offsite_conversion.fb_pixel_add_to_cart', app: 'app_custom_event.fb_mobile_add_to_cart' }, true],
  ['add_to_wishlist', 'Додавання в список бажань', 'Adds to wishlist', { all: 'omni_add_to_wishlist', web: 'offsite_conversion.fb_pixel_add_to_wishlist', app: 'app_custom_event.fb_mobile_add_to_wishlist' }, true],
  ['initiate_checkout', 'Початок оформлення', 'Checkouts initiated', { all: 'omni_initiated_checkout', web: 'offsite_conversion.fb_pixel_initiate_checkout', app: 'app_custom_event.fb_mobile_initiated_checkout' }, true],
  ['add_payment_info', 'Додавання платіжних даних', 'Payment info added', { web: 'offsite_conversion.fb_pixel_add_payment_info', app: 'app_custom_event.fb_mobile_add_payment_info' }, true],
  ['purchase', 'Покупки', 'Purchases', { all: 'omni_purchase', web: 'offsite_conversion.fb_pixel_purchase', app: 'app_custom_event.fb_mobile_purchase' }, true],
  ['lead', 'Ліди', 'Leads', { web: 'offsite_conversion.fb_pixel_lead', app: 'app_custom_event.fb_mobile_lead' }, true],
  ['complete_registration', 'Реєстрації', 'Registrations', { all: 'omni_complete_registration', web: 'offsite_conversion.fb_pixel_complete_registration', app: 'app_custom_event.fb_mobile_complete_registration' }, true],
  ...[
    ['contact', 'Контакти', 'Contacts'], ['customize_product', 'Налаштування товару', 'Product customizations'], ['donate', 'Пожертви', 'Donations'], ['find_location', 'Пошуки місця', 'Location searches'],
    ['schedule', 'Записи на візит', 'Appointments scheduled'], ['start_trial', 'Початок пробного періоду', 'Trials started'], ['submit_application', 'Подані заявки', 'Applications submitted'], ['subscribe', 'Підписки', 'Subscriptions'],
  ].map(([id, uk, en]) => [id, uk, en, { all: `${id}_total`, web: `${id}_website`, app: `${id}_mobile_app` }, true]),
];
const CHANNEL = { all: [G.evAll, 'усі канали', 'all channels'], web: [G.evWeb, 'сайт', 'website'], app: [G.evApp, 'застосунок', 'app'] };
const lower = (s) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;
EVENTS.forEach(([id, uk, en, types, withValue]) => {
  Object.entries(types).forEach(([ch, type]) => {
    const [group, chUk, chEn] = CHANNEL[ch];
    const key = `act_${id}_${ch}`;
    addCount(key, { action: [type] });
    GEN.push(numberMetric(key, group, `${uk} · ${chUk}`, `${en} (${chEn})`), priceOf(`act_${id}_${ch}`, group, `Ціна: ${lower(uk)} · ${chUk}`, `Cost per ${lower(en)} (${chEn})`, key));
    if (withValue) {
      const vkey = `val_${id}_${ch}`;
      addCount(vkey, { value: [type] });
      GEN.push(moneyMetric(vkey, group, `Цінність: ${lower(uk)} · ${chUk}`, `Value of ${lower(en)} (${chEn})`));
      if (id === 'purchase') GEN.push(returnOf(`purchase_${ch}`, group, `ROAS покупок · ${chUk}`, `Purchase ROAS (${chEn})`, vkey));
    }
  });
});

// ---- single actions: [id, type, group, label, en, withPrice]
const ACTIONS = [
  ['page_engagement', 'page_engagement', G.interaction, 'Взаємодія зі сторінкою', 'Page engagements'],
  ['photo_view', 'photo_view', G.interaction, 'Перегляди фото', 'Photo views'],
  ['page_likes', 'like', G.interaction, 'Вподобання сторінки', 'Page likes'],
  ['msg_first_reply', 'onsite_conversion.messaging_first_reply', G.messages, 'Перші відповіді в месенджері', 'First replies'],
  ['msg_contacts', 'onsite_conversion.total_messaging_connection', G.messages, 'Нові контакти в месенджері', 'New messaging contacts'],
  ['msg_blocks', 'onsite_conversion.messaging_block', G.messages, 'Блокування переписки', 'Messaging blocks'],
  ['msg_welcome_view', 'onsite_conversion.messaging_welcome_message_view', G.messages, 'Перегляди привітання', 'Welcome message views'],
  ['msg_replied', 'onsite_conversion.messaging_conversation_replied_7d', G.messages, 'Переписки з відповіддю (7 днів)', 'Conversations replied (7 days)'],
  ['lead_form', 'onsite_conversion.lead_grouped', G.onsite, 'Ліди (форма Meta)', 'Leads (Meta form)'],
  ['app_install', 'mobile_app_install', G.app, 'Встановлення застосунку', 'App installs'],
  ['app_install_all', 'omni_app_install', G.app, 'Встановлення застосунку · усі канали', 'App installs (all channels)'],
  ['app_activate', 'omni_activate_app', G.app, 'Активація застосунку', 'App activations'],
  ['app_achievement', 'omni_achievement_unlocked', G.app, 'Досягнення в застосунку', 'Achievements unlocked'],
  ['app_level', 'omni_level_achieved', G.app, 'Досягнуті рівні', 'Levels achieved'],
  ['app_tutorial', 'omni_tutorial_completion', G.app, 'Завершені навчання', 'Tutorials completed'],
  ['app_credits', 'omni_spend_credits', G.app, 'Витрачені кредити', 'Credits spent'],
];
ACTIONS.forEach(([id, type, group, label, en]) => {
  const key = `act_${id}`;
  addCount(key, { action: [type] });
  GEN.push(numberMetric(key, group, label, en), priceOf(`act_${id}`, group, `Ціна: ${lower(label)}`, `Cost per ${lower(en)}`, key));
});

Object.assign(COUNTS, GEN_COUNTS);

export const META_METRIC_LIST = [...HAND_METRICS, ...GEN];

export const META_METRICS = Object.fromEntries(META_METRIC_LIST.map((m) => [m.key, m]));
export const isExtraMetric = (key) => typeof key === 'string' && key.startsWith('mx_');

// Only keys of the platform's catalog survive (what comes back from storage or a request is never trusted).
export const cleanColumns = (platform, keys) => (platform === 'meta' ? [...new Set((keys || []).filter((k) => META_METRICS[k]))] : []);

// The raw counts needed for these metric keys.
export const countsFor = (keys) => [...new Set(cleanColumns('meta', keys).flatMap((k) => META_METRICS[k].needs))];

// The insights fields to ask Meta for, on top of the standard ones, for the counts of the picked metrics.
export function insightFieldsFor(keys) {
  const out = new Set();
  countsFor(keys).forEach((c) => { const s = COUNTS[c]; if (s.field) out.add(s.field); if (s.list) out.add(s.list); if (s.results) out.add(s.results); });
  return [...out];
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
function pickAction(list, types) {
  if (!Array.isArray(list)) return 0;
  for (const t of types) { const hit = list.find((a) => a.action_type === t); if (hit) return num(hit.value); }
  return 0;
}

// Which field Meta refused (a column of the catalog that this account or API version does not have): the report must still work without it.
// → the field name, or null when the error is about something else.
export function unknownFieldOf(err) {
  if (Number(err?.code) !== 100) return null;
  const m = /nonexisting field \(([a-z0-9_]+)\)/i.exec(String(err.message || '')) || /([a-z0-9_]+) is not valid for fields param/i.exec(String(err.message || '')) || /Unknown field:? ?\(?([a-z0-9_]+)\)?/i.exec(String(err.message || ''));
  return m ? m[1] : null;
}

// A plain field is a number; a list field ([{ action_type, value }]) is the sum of its values.
function readField(v) { return Array.isArray(v) ? v.reduce((sum, i) => sum + num(i?.value ?? i?.values?.[0]?.value), 0) : num(v); }
// `results`: [{ indicator, values: [{ value }] }] — the first indicator is the objective result of the row.
function readResults(v) { return Array.isArray(v) && v.length ? num(v[0]?.values?.[0]?.value ?? v[0]?.value) : 0; }

// One raw insights row → { x_<count>: number } for the counts of the picked metrics.
export function extractCounts(row, keys) {
  const out = {};
  countsFor(keys).forEach((c) => {
    const s = COUNTS[c];
    out[X(c)] = s.field ? readField(row[s.field]) : s.list ? num(Array.isArray(row[s.list]) ? row[s.list][0]?.value : 0) : s.results ? readResults(row[s.results]) : s.value ? pickAction(row.action_values, s.value) : pickAction(row.actions, s.action);
  });
  return out;
}

// The `x_` numbers of a row, as the report stores them.
export const pickCounts = (row) => Object.fromEntries(Object.entries(row || {}).filter(([k, v]) => k.startsWith('x_') && v != null));
