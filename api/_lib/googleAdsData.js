// Real Google Ads numbers for one customer account: one function the Ads Insights chat (api/ads-insights-chat.js) and the campaign-team
// agents both use, so there is a single place that knows how a Google Ads row is read. Needs the GOOGLE_ADS_* variables of the server.
import { GoogleAdsApi } from 'google-ads-api';

export function dateRangeToBounds(dateRange) {
  const fmt = (d) => d.toISOString().slice(0, 10);
  const today = new Date();
  const start = new Date(today);
  if (dateRange === 'LAST_7_DAYS') {
    start.setUTCDate(start.getUTCDate() - 7);
    return { from_date: fmt(start), to_date: fmt(today) };
  }
  if (dateRange === 'LAST_30_DAYS') {
    start.setUTCDate(start.getUTCDate() - 30);
    return { from_date: fmt(start), to_date: fmt(today) };
  }
  if (dateRange === 'THIS_MONTH') {
    start.setUTCDate(1);
    return { from_date: fmt(start), to_date: fmt(today) };
  }
  // LAST_MONTH
  const lastMonthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  const lastMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  return { from_date: fmt(lastMonthStart), to_date: fmt(lastMonthEnd) };
}

const METRICS = [
  'metrics.impressions', 'metrics.clicks', 'metrics.cost_micros', 'metrics.conversions',
  'metrics.conversions_value', 'metrics.cost_per_conversion', 'metrics.ctr', 'metrics.average_cpc',
  'metrics.search_impression_share',
];

function round2(n) { return Math.round(n * 100) / 100; }

function formatRow(row) {
  const m = row.metrics || {};
  const clicks = m.clicks ?? 0;
  const conversions = m.conversions ?? 0;
  const cost = m.cost_micros != null ? round2(m.cost_micros / 1e6) : 0;
  const conversions_value = m.conversions_value != null ? round2(m.conversions_value) : 0;
  return {
    impressions: m.impressions ?? 0,
    clicks,
    cost,
    conversions,
    conversions_value,
    // ROAS/conversion rate computed here rather than trusted from a raw API
    // field, so they're always internally consistent with the other numbers
    // in this same row (and simply absent, not a wrong 0, when undefined).
    roas: cost > 0 ? round2(conversions_value / cost) : null,
    conversion_rate_pct: clicks > 0 ? round2((conversions / clicks) * 100) : null,
    cost_per_conversion: m.cost_per_conversion != null ? round2(m.cost_per_conversion / 1e6) : null,
    ctr_pct: m.ctr != null ? round2(m.ctr * 100) : null,
    avg_cpc: m.average_cpc != null ? round2(m.average_cpc / 1e6) : null,
    // Search-only metric — absent (not zero) for non-Search campaign types.
    search_impression_share_pct: m.search_impression_share != null ? round2(m.search_impression_share * 100) : null,
  };
}

const DEVICE_LABEL = {
  MOBILE: 'мобільні', DESKTOP: 'десктоп', TABLET: 'планшети', CONNECTED_TV: 'Connected TV', OTHER: 'інше',
};
const NETWORK_LABEL = {
  SEARCH: 'Search', SEARCH_PARTNERS: 'Search Partners', CONTENT: 'Display', YOUTUBE_SEARCH: 'YouTube Search',
  YOUTUBE_WATCH: 'YouTube Watch', MIXED: 'Mixed',
};

export async function runGoogleAdsReport(customerId, { dateRange, level }) {
  const { from_date, to_date } = dateRangeToBounds(dateRange);
  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || 'unused',
  });
  const customer = client.Customer({
    customer_id: customerId.replace(/-/g, ''),
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  });

  if (level === 'campaign') {
    const rows = await customer.report({
      entity: 'campaign',
      attributes: ['campaign.id', 'campaign.name'],
      metrics: METRICS,
      from_date,
      to_date,
    });
    return { period: { from_date, to_date }, campaigns: rows.map((r) => ({ name: r.campaign?.name, ...formatRow(r) })) };
  }

  if (level === 'device') {
    const rows = await customer.report({
      entity: 'customer',
      metrics: METRICS,
      segments: ['segments.device'],
      from_date,
      to_date,
    });
    return {
      period: { from_date, to_date },
      devices: rows.map((r) => ({ device: DEVICE_LABEL[r.segments?.device] || r.segments?.device, ...formatRow(r) })),
    };
  }

  if (level === 'network') {
    const rows = await customer.report({
      entity: 'customer',
      metrics: METRICS,
      segments: ['segments.ad_network_type'],
      from_date,
      to_date,
    });
    return {
      period: { from_date, to_date },
      networks: rows.map((r) => ({ network: NETWORK_LABEL[r.segments?.ad_network_type] || r.segments?.ad_network_type, ...formatRow(r) })),
    };
  }

  if (level === 'keyword') {
    const rows = await customer.report({
      entity: 'keyword_view',
      attributes: ['ad_group_criterion.keyword.text', 'ad_group_criterion.keyword.match_type', 'ad_group_criterion.quality_info.quality_score'],
      metrics: METRICS,
      from_date,
      to_date,
    });
    return {
      period: { from_date, to_date },
      keywords: rows.map((r) => ({
        keyword: r.ad_group_criterion?.keyword?.text,
        match_type: r.ad_group_criterion?.keyword?.match_type,
        quality_score: r.ad_group_criterion?.quality_info?.quality_score ?? null,
        ...formatRow(r),
      })),
    };
  }

  if (level === 'ad') {
    const rows = await customer.report({
      entity: 'ad_group_ad',
      attributes: ['ad_group.name', 'ad_group_ad.ad.id'],
      metrics: METRICS,
      from_date,
      to_date,
    });
    return {
      period: { from_date, to_date },
      ads: rows.map((r) => ({ ad_group: r.ad_group?.name, ad_id: r.ad_group_ad?.ad?.id, ...formatRow(r) })),
    };
  }

  const rows = await customer.report({
    entity: 'customer',
    metrics: METRICS,
    from_date,
    to_date,
  });
  // A `customer` entity report with no segments is always exactly one row.
  const empty = { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversions_value: 0, roas: null, conversion_rate_pct: null, cost_per_conversion: null, ctr_pct: null, avg_cpc: null, search_impression_share_pct: null };
  return { period: { from_date, to_date }, account: rows[0] ? formatRow(rows[0]) : empty };
}
