// The creatives of a Google Ads account for a period (plan 2.14, owner 2026-11-16): what the reports and the client page can show as «most effective creatives».
// Read-only, like googleProbe.js. Google does NOT give spend or ROAS per picture (checked 16.11 on the account of Mellow): the numbers belong to a whole
// ASSET GROUP (Performance Max) or to one search AD, so a candidate is that whole unit with its own pictures, videos and texts. The pictures are public
// Google URLs, a video is a YouTube id (its thumbnail has a fixed address).
//   googleCreativeCandidates(target, { from, to, limit }) → { period, items: [{ kind: 'asset_group' | 'search_ad', id, name, campaign, metrics, images, videos, headlines, descriptions }] }
import { enums } from 'google-ads-api';
import { enumName } from './googleProbe.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const short = (v, n) => String(v ?? '').slice(0, n);
const metricsOf = (m = {}) => {
  const spend = round2(Number(m.cost_micros || 0) / 1e6);
  const revenue = round2(m.conversions_value);
  return { spend, impressions: Number(m.impressions || 0), clicks: Number(m.clicks || 0), conversions: round2(m.conversions), revenue, roas: spend > 0 && revenue > 0 ? round2(revenue / spend) : null };
};
// the best first: the biggest spend that still returned something, then the biggest spend
const rank = (a, b) => (Number(b.metrics.roas || 0) > 0) - (Number(a.metrics.roas || 0) > 0) || b.metrics.spend - a.metrics.spend;
const ytThumb = (id) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
const unique = (list) => [...new Set(list.filter(Boolean))];

export async function googleCreativeCandidates(target, { from, to, limit = 8 } = {}) {
  if (!DATE.test(String(from)) || !DATE.test(String(to))) throw new Error('from і to у форматі YYYY-MM-DD обовʼязкові');
  const between = `segments.date BETWEEN '${from}' AND '${to}'`;
  const items = [];

  // 1. Performance Max: the asset groups that spent in the period and their assets
  const groups = await target.query(`SELECT asset_group.id, asset_group.name, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM asset_group WHERE ${between} AND metrics.cost_micros > 0`);
  const byId = new Map();
  groups.forEach((r) => {
    const id = String(r.asset_group?.id);
    const cur = byId.get(id) || { kind: 'asset_group', id, name: short(r.asset_group?.name, 80), campaign: short(r.campaign?.name, 80), raw: { cost_micros: 0, impressions: 0, clicks: 0, conversions: 0, conversions_value: 0 } };
    ['cost_micros', 'impressions', 'clicks', 'conversions', 'conversions_value'].forEach((k) => { cur.raw[k] += Number(r.metrics?.[k] || 0); });
    byId.set(id, cur);
  });
  const top = [...byId.values()].map((g) => ({ ...g, metrics: metricsOf(g.raw) })).sort(rank).slice(0, limit);
  if (top.length) {
    const ids = top.map((g) => Number(g.id)).filter(Number.isFinite);
    const assets = await target.query(`SELECT asset_group.id, asset_group_asset.field_type, asset.text_asset.text, asset.image_asset.full_size.url, asset.youtube_video_asset.youtube_video_id FROM asset_group_asset WHERE asset_group.id IN (${ids.join(',')}) AND asset_group_asset.status != 'REMOVED'`);
    top.forEach((g) => {
      const mine = assets.filter((a) => String(a.asset_group?.id) === g.id);
      const field = (a) => enumName(enums.AssetFieldType, a.asset_group_asset?.field_type);
      items.push({
        kind: g.kind, id: g.id, name: g.name, campaign: g.campaign, metrics: g.metrics,
        images: unique(mine.map((a) => a.asset?.image_asset?.full_size?.url && `${field(a)}|${a.asset.image_asset.full_size.url}`)).map((x) => { const [f, ...u] = x.split('|'); return { field: f, url: u.join('|') }; }).slice(0, 12),
        videos: unique(mine.map((a) => a.asset?.youtube_video_asset?.youtube_video_id)).slice(0, 4).map((id) => ({ youtubeId: id, thumb: ytThumb(id) })),
        headlines: unique(mine.filter((a) => /HEADLINE$/.test(field(a))).map((a) => short(a.asset?.text_asset?.text, 90))).slice(0, 8),
        descriptions: unique(mine.filter((a) => field(a) === 'DESCRIPTION').map((a) => short(a.asset?.text_asset?.text, 120))).slice(0, 4),
      });
    });
  }

  // 2. search ads: the responsive search ads that spent in the period, with their own texts
  const ads = await target.query(`SELECT ad_group_ad.ad.id, ad_group.name, campaign.name, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM ad_group_ad WHERE ${between} AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD' AND metrics.cost_micros > 0`);
  ads.map((r) => ({
    kind: 'search_ad', id: String(r.ad_group_ad?.ad?.id), name: short(r.ad_group?.name, 80), campaign: short(r.campaign?.name, 80), metrics: metricsOf(r.metrics),
    images: [], videos: [],
    headlines: unique((r.ad_group_ad?.ad?.responsive_search_ad?.headlines || []).map((h) => short(h.text, 90))).slice(0, 8),
    descriptions: unique((r.ad_group_ad?.ad?.responsive_search_ad?.descriptions || []).map((d) => short(d.text, 120))).slice(0, 4),
  })).sort(rank).slice(0, limit).forEach((x) => items.push(x));

  return { period: { from, to }, items };
}
