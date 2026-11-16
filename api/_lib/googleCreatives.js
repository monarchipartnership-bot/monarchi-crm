// The creatives of a Google Ads account for a period (plan 2.14, owner 2026-11-16): what the reports and the client page can show as «most effective creatives».
// Read-only, like googleProbe.js. Google does NOT give spend or ROAS per picture (checked 16.11 on the account of Mellow): the numbers belong to a whole
// ASSET GROUP (Performance Max) or to one search AD, so a candidate is that whole unit with its own pictures, videos and texts. The pictures are public
// Google URLs, a video is a YouTube id (its thumbnail has a fixed address).
//   googleCreativeCandidates(target, { from, to, limit }) → { period, items: [{ kind: 'asset_group' | 'search_ad', id, name, campaign, metrics, images, videos, headlines, descriptions }] }
import { enums } from 'google-ads-api';
import { enumName } from './googleProbe.js';
import { copyImage } from './metaCreatives.js';

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

// «Підтягнути з Google» (plan 2.16, owner 2026-11-16): the pictures of the best asset groups become files «Готовий креатив» of the client's library, as the
// button of Meta does for the best ads. Google gives the numbers to a whole group, so the pictures are taken from the best groups in turn (a round per group,
// not all pictures of one); a group that returned less than it cost is not «the best» and gives nothing. The mark of a file is the id of the picture
// (`google-img-<id>`), so a picture that is already in the library is not added twice.
const IMAGE_ORDER = ['SQUARE_MARKETING_IMAGE', 'MARKETING_IMAGE', 'PORTRAIT_MARKETING_IMAGE'];
export const googleExampleMark = (url) => `google-img-${(String(url).match(/(\d{6,})\s*$/) || [])[1] || String(url).replace(/\W+/g, '').slice(-24)}`;
export function pickGoogleExamples(items, { count = 6, minRoas = 1 } = {}) {
  const groups = (items || []).filter((i) => i.kind === 'asset_group' && Number(i.metrics?.roas) >= minRoas && i.images?.length).sort((a, b) => b.metrics.roas - a.metrics.roas);
  const lists = groups.map((g) => ({ g, images: [...g.images].sort((a, b) => (IMAGE_ORDER.indexOf(a.field) + 1 || 99) - (IMAGE_ORDER.indexOf(b.field) + 1 || 99)) }));
  const out = [];
  const seen = new Set();
  for (let round = 0; out.length < count && lists.some((l) => l.images.length > round); round += 1) {
    for (const l of lists) {
      const img = l.images[round];
      if (!img || out.length >= count) continue;
      const mark = googleExampleMark(img.url);
      if (seen.has(mark)) continue;
      seen.add(mark);
      out.push({ mark, url: img.url, field: img.field, group: l.g.name, roas: l.g.metrics.roas, spend: l.g.metrics.spend });
    }
  }
  return out;
}
// → { added: [rows], already, noPicture, looked }
export async function importGoogleExamples({ db, target, projectId, period, count = 6, email = null, fetchFn = fetch }) {
  const { items } = await googleCreativeCandidates(target, { from: period.start, to: period.end, limit: 10 });
  const picks = pickGoogleExamples(items, { count });
  const out = { added: [], already: 0, noPicture: 0, looked: picks.length };
  if (!picks.length) return out;
  const have = await db.from('project_creative_assets').select('path').eq('project_id', projectId).eq('kind', 'creative');
  if (have.error) throw new Error(have.error.message);
  const marks = new Set((have.data || []).map((r) => r.path));
  for (const p of picks) {
    if (marks.has(p.mark)) { out.already += 1; continue; }
    const url = await copyImage({ db, url: p.url, path: `project-examples/${projectId}/${p.mark}`, fetchFn });
    if (!url) { out.noPicture += 1; continue; }
    const name = `Google · ${p.group} · ROAS ${p.roas}`.slice(0, 160);
    const row = await db.from('project_creative_assets').insert({ project_id: projectId, kind: 'creative', name, url, path: p.mark, created_by: email }).select().single();
    if (row.error) throw new Error(row.error.message);
    out.added.push(row.data);
  }
  return out;
}
