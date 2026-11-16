// Extra columns of a Google Ads report: the metrics of the cabinet's «Стовпці» beyond the standard report, picked per project.
// Same two layers as src/lib/metaColumns.js (counts stored as additive x_g_<count>, metrics `mx_...` computed from them), but a count here is
// computed from the metrics of ONE CAMPAIGN row (a share such as «Частка показів» is turned into additive impression counts, so campaigns, groups
// and the account add up correctly). The account total of an extra count is the sum of its campaigns (see fetchPlatformRange).
// Pure code: the server (api/google-ads-accounts.js) asks Google only for what is picked.
import { X, count, cost, rate, ratio } from './metaColumns.js';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const hasShare = (m) => num(m.search_impression_share) > 0;
// impressions Google could have shown the ad for (search campaigns only: the share is empty elsewhere)
const eligible = (m) => (hasShare(m) ? num(m.impressions) / num(m.search_impression_share) : 0);

// count → the Google Ads metrics it needs (without the `metrics.` prefix) and how one campaign row gives it
export const G_COUNTS = {
  g_interactions: { metrics: ['interactions'], calc: (m) => num(m.interactions) },
  g_engagements: { metrics: ['engagements'], calc: (m) => num(m.engagements) },
  g_all_conversions: { metrics: ['all_conversions'], calc: (m) => num(m.all_conversions) },
  g_all_conv_value: { metrics: ['all_conversions_value'], calc: (m) => num(m.all_conversions_value) },
  g_view_through: { metrics: ['view_through_conversions'], calc: (m) => num(m.view_through_conversions) },
  g_cross_device: { metrics: ['cross_device_conversions'], calc: (m) => num(m.cross_device_conversions) },
  g_video_views: { metrics: ['video_trueview_views'], calc: (m) => num(m.video_trueview_views) }, // «views» of video campaigns (the API calls them TrueView views)
  g_top_impr: { metrics: ['impressions', 'top_impression_percentage'], calc: (m) => num(m.impressions) * num(m.top_impression_percentage) },
  g_abs_top_impr: { metrics: ['impressions', 'absolute_top_impression_percentage'], calc: (m) => num(m.impressions) * num(m.absolute_top_impression_percentage) },
  // commerce (Shopping and Performance Max report orders and units; other campaign types give 0)
  g_orders: { metrics: ['orders'], calc: (m) => num(m.orders) },
  g_units_sold: { metrics: ['units_sold'], calc: (m) => num(m.units_sold) },
  // the quality of the traffic and its visibility
  g_invalid_clicks: { metrics: ['invalid_clicks'], calc: (m) => num(m.invalid_clicks) },
  g_viewable_impr: { metrics: ['active_view_impressions'], calc: (m) => num(m.active_view_impressions) },
  g_viewable_meas: { metrics: ['active_view_measurable_impressions'], calc: (m) => num(m.active_view_measurable_impressions) },
  g_phone_calls: { metrics: ['phone_calls'], calc: (m) => num(m.phone_calls) },
  g_search_eligible: { metrics: ['impressions', 'search_impression_share'], calc: eligible },
  g_search_impr: { metrics: ['impressions', 'search_impression_share'], calc: (m) => (hasShare(m) ? num(m.impressions) : 0) },
  g_lost_budget: { metrics: ['impressions', 'search_impression_share', 'search_budget_lost_impression_share'], calc: (m) => eligible(m) * num(m.search_budget_lost_impression_share) },
  g_lost_rank: { metrics: ['impressions', 'search_impression_share', 'search_rank_lost_impression_share'], calc: (m) => eligible(m) * num(m.search_rank_lost_impression_share) },
  // The top shares have their own denominator (impressions that were eligible for the TOP position), so it is rebuilt from the measured top
  // impressions and the share: eligible_top = top impressions / share.
  g_stop_impr: { metrics: ['impressions', 'top_impression_percentage', 'search_top_impression_share'], calc: (m) => (num(m.search_top_impression_share) > 0 ? num(m.impressions) * num(m.top_impression_percentage) : 0) },
  g_stop_elig: { metrics: ['impressions', 'top_impression_percentage', 'search_top_impression_share'], calc: (m) => (num(m.search_top_impression_share) > 0 ? (num(m.impressions) * num(m.top_impression_percentage)) / num(m.search_top_impression_share) : 0) },
  g_sabs_impr: { metrics: ['impressions', 'absolute_top_impression_percentage', 'search_absolute_top_impression_share'], calc: (m) => (num(m.search_absolute_top_impression_share) > 0 ? num(m.impressions) * num(m.absolute_top_impression_percentage) : 0) },
  g_sabs_elig: { metrics: ['impressions', 'absolute_top_impression_percentage', 'search_absolute_top_impression_share'], calc: (m) => (num(m.search_absolute_top_impression_share) > 0 ? (num(m.impressions) * num(m.absolute_top_impression_percentage)) / num(m.search_absolute_top_impression_share) : 0) },
};

const G = { interaction: 'Взаємодії', conv: 'Конверсії', share: 'Частка показів (пошук)', position: 'Позиція показів', video: 'Відео', commerce: 'Замовлення й товари', quality: 'Якість трафіку', view: 'Видимість (Active View)', calls: 'Дзвінки' };
const down = (m) => ({ ...m, goodWhen: 'down' });

export const GOOGLE_METRIC_LIST = [
  count('g_interactions', G.interaction, 'Взаємодії', 'Interactions'),
  cost('g_interaction', G.interaction, 'Ціна за взаємодію', 'Cost per interaction', 'g_interactions'),
  rate('g_interaction_rate', G.interaction, 'Рівень взаємодії', 'Interaction rate', 'g_interactions'),
  count('g_engagements', G.interaction, 'Залучення', 'Engagements'),

  { key: 'mx_g_conv_rate', group: G.conv, label: 'Коефіцієнт конверсії', en: 'Conversion rate', format: 'percent', goodWhen: 'up', needs: [], calc: (b) => ratio((Number(b.purchases) || 0) + (Number(b.leads) || 0), b.clicks, 100) },
  count('g_all_conversions', G.conv, 'Усі конверсії', 'All conversions'),
  cost('g_all_conversions', G.conv, 'Ціна за всі конверсії', 'Cost per all conversions', 'g_all_conversions'),
  count('g_all_conv_value', G.conv, 'Цінність усіх конверсій', 'All conversions value'),
  count('g_view_through', G.conv, 'Конверсії після перегляду', 'View-through conversions'),
  count('g_cross_device', G.conv, 'Міжпристрійні конверсії', 'Cross-device conversions'),

  rate('g_search_is', G.share, 'Частка показів у пошуку', 'Search impression share', 'g_search_impr', 'g_search_eligible'),
  down(rate('g_lost_budget_is', G.share, 'Втрачена частка (бюджет)', 'Search lost IS (budget)', 'g_lost_budget', 'g_search_eligible')),
  down(rate('g_lost_rank_is', G.share, 'Втрачена частка (рейтинг)', 'Search lost IS (rank)', 'g_lost_rank', 'g_search_eligible')),
  rate('g_search_top_is', G.share, 'Частка показів угорі', 'Search top impression share', 'g_stop_impr', 'g_stop_elig'),
  rate('g_search_abs_top_is', G.share, 'Частка показів на 1-й позиції', 'Search absolute top IS', 'g_sabs_impr', 'g_sabs_elig'),

  rate('g_top_pct', G.position, 'Покази угорі, % від усіх', 'Top impression %', 'g_top_impr'),
  rate('g_abs_top_pct', G.position, 'Покази на 1-й позиції, % від усіх', 'Absolute top impression %', 'g_abs_top_impr'),

  count('g_orders', G.commerce, 'Замовлення', 'Orders'),
  cost('g_order', G.commerce, 'Ціна за замовлення', 'Cost per order', 'g_orders'),
  { key: 'mx_g_aov', group: G.commerce, label: 'Середній чек', en: 'Average order value', format: 'money', goodWhen: 'up', needs: ['g_orders'], calc: (b) => ratio(b.revenue, b[X('g_orders')]) },
  count('g_units_sold', G.commerce, 'Продано одиниць', 'Units sold'),
  { key: 'mx_g_units_per_order', group: G.commerce, label: 'Одиниць у замовленні', en: 'Units per order', format: 'number', goodWhen: 'up', needs: ['g_orders', 'g_units_sold'], calc: (b) => ratio(b[X('g_units_sold')], b[X('g_orders')]) },

  down(count('g_invalid_clicks', G.quality, 'Недійсні кліки', 'Invalid clicks')),
  { key: 'mx_g_invalid_rate', group: G.quality, label: 'Частка недійсних кліків', en: 'Invalid click rate', format: 'percent', goodWhen: 'down', needs: ['g_invalid_clicks'], calc: (b) => ratio(b[X('g_invalid_clicks')], b.clicks, 100) },
  count('g_viewable_impr', G.view, 'Видимі покази', 'Viewable impressions'),
  rate('g_viewability', G.view, 'Рівень видимості', 'Viewability', 'g_viewable_impr', 'g_viewable_meas'),

  count('g_phone_calls', G.calls, 'Дзвінки', 'Phone calls'),
  cost('g_phone_call', G.calls, 'Ціна за дзвінок', 'Cost per phone call', 'g_phone_calls'),

  count('g_video_views', G.video, 'Перегляди відео', 'Video views'),
  cost('g_video_view', G.video, 'Ціна перегляду відео', 'Cost per video view', 'g_video_views'),
  rate('g_view_rate', G.video, 'Рівень переглядів відео', 'View rate', 'g_video_views'),
];

export const GOOGLE_METRICS = Object.fromEntries(GOOGLE_METRIC_LIST.map((m) => [m.key, m]));

export const cleanGoogleColumns = (keys) => [...new Set((keys || []).filter((k) => GOOGLE_METRICS[k]))];
export const googleCountsFor = (keys) => [...new Set(cleanGoogleColumns(keys).flatMap((k) => GOOGLE_METRICS[k].needs))];

// The Google Ads metrics to add to the campaign query (with the `metrics.` prefix) for the picked columns.
export const googleMetricNamesFor = (keys) => [...new Set(googleCountsFor(keys).flatMap((c) => G_COUNTS[c].metrics))].map((n) => `metrics.${n}`);

// One campaign row's `metrics` object → { x_g_<count>: number } for the picked columns.
export function extractGoogleCounts(metrics, keys) {
  const out = {};
  googleCountsFor(keys).forEach((c) => { out[X(c)] = Math.round(G_COUNTS[c].calc(metrics || {}) * 100) / 100; });
  return out;
}
