// The creatives of the best ads of a period, for the «Most effective creatives» of a report (Meta). Reads only (ads_read of the same token as the insights).
// The ad-level numbers pick the ads, the ad's creative gives the picture, and the picture is COPIED into our storage (Meta's links expire).
// The Graph reader, the picture fetch and the database are handed in, so everything is tested without a network.
import { GRAPH, MAX_PAGES, formatRow, graphGet } from './metaAdsData.js';
import { captionOf, creativeImageUrl, creativeItem, pickDistinct, rankAds } from '../../src/lib/creatives.js';

const BUCKET = 'smm-assets';
const FIELDS = 'id,name,object_type,image_url,thumbnail_url,video_id,effective_object_story_id,object_story_spec,asset_feed_spec,product_set_id';

// → ads of one account with their numbers: [{ adId, adName, campaign, spend, purchases, revenue, roas, ... }]
export async function topAds({ accountId, start, end, token, graphFn = graphGet }) {
  const digits = String(accountId || '').replace(/^act_/, '').replace(/\D/g, '');
  if (!digits) throw new Error('accountId обовʼязковий');
  const params = { level: 'ad', fields: ['ad_id', 'ad_name', 'campaign_name', 'spend', 'impressions', 'reach', 'clicks', 'actions', 'action_values'].join(','), limit: '200', time_range: JSON.stringify({ since: start, until: end }), access_token: token };
  let url = `${GRAPH}act_${digits}/insights?${new URLSearchParams(params)}`;
  const rows = [];
  for (let page = 0; page < MAX_PAGES && url; page += 1) {
    const res = await graphFn(url, token);
    rows.push(...(res.data || []));
    url = res.paging?.next || null;
  }
  return rows.map((r) => ({ ...formatRow(r), adId: String(r.ad_id), adName: r.ad_name || '', campaign: r.campaign_name || '' }));
}

const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

// → Map adId → creative (the fields of FIELDS), two light reads: ad → creative id, creative id → its fields (the thumbnail asked at a size fit to show).
export async function creativesOf(adIds, { token, graphFn = graphGet }) {
  const byAd = new Map();
  const creativeIds = new Map();
  for (const part of chunks([...new Set(adIds)], 40)) {
    const res = await graphFn(`${GRAPH}?${new URLSearchParams({ ids: part.join(','), fields: 'creative', access_token: token })}`, token);
    part.forEach((id) => { const c = res[id]?.creative?.id; if (c) creativeIds.set(id, String(c)); });
  }
  const details = new Map();
  for (const part of chunks([...new Set(creativeIds.values())], 40)) {
    const res = await graphFn(`${GRAPH}?${new URLSearchParams({ ids: part.join(','), fields: FIELDS, thumbnail_width: '640', thumbnail_height: '800', access_token: token })}`, token);
    part.forEach((id) => { if (res[id]) details.set(id, res[id]); });
  }
  creativeIds.forEach((cid, adId) => { if (details.has(cid)) byAd.set(adId, details.get(cid)); });
  return byAd;
}

// Copies a picture into our storage. → the public address, or null when there is nothing to show (it never throws: a creative without a picture is still a creative).
export async function copyImage({ db, url, path, fetchFn = fetch }) {
  if (!url) return null;
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const type = res.headers?.get?.('content-type') || 'image/jpeg';
    if (!/^image\//.test(type)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) return null;
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    const full = `${path}.${ext}`;
    const up = await db.storage.from(BUCKET).upload(full, bytes, { contentType: type, upsert: true });
    if (up.error) return null;
    return db.storage.from(BUCKET).getPublicUrl(full).data?.publicUrl || null;
  } catch { return null; }
}

// All ads of the project's Meta accounts for the period, ranked.
async function rankedAds({ accounts, start, end, token, graphFn }) {
  const metas = (accounts || []).filter((a) => a.platform === 'meta');
  if (!metas.length) throw new Error('У проєкті немає кабінетів Meta.');
  const all = [];
  for (const a of metas) all.push(...await topAds({ accountId: a.account_id, start, end, token, graphFn }));
  return rankAds(all);
}

const folder = (projectId, start, end) => `report-creatives/${projectId}/${start}_${end}`;

// The best `count` creatives of the period. → items (see creativeItem), each with our own copy of the picture.
export async function collectCreatives({ db, token, accounts, projectId, period, count, graphFn = graphGet, fetchFn = fetch }) {
  const ranked = await rankedAds({ accounts, start: period.start, end: period.end, token, graphFn });
  if (!ranked.length) return [];
  const pool = ranked.slice(0, count * 4);
  const creatives = await creativesOf(pool.map((a) => a.adId), { token, graphFn });
  const chosen = pickDistinct(pool, creatives, count);
  const items = [];
  for (const ad of chosen) {
    const c = creatives.get(ad.adId);
    const img = await copyImage({ db, url: creativeImageUrl(c), path: `${folder(projectId, period.start, period.end)}/${ad.adId}`, fetchFn });
    items.push(creativeItem(ad, c, img));
  }
  return items;
}

// What a person can choose from when replacing a creative: the top ads with a picture to look at now (Meta's own short-lived link, nothing is copied yet).
export async function creativeCandidates({ token, accounts, period, limit = 12, graphFn = graphGet }) {
  const ranked = await rankedAds({ accounts, start: period.start, end: period.end, token, graphFn });
  const pool = ranked.slice(0, limit * 2);
  const creatives = await creativesOf(pool.map((a) => a.adId), { token, graphFn });
  return pickDistinct(pool, creatives, limit).map((ad) => ({ adId: ad.adId, adName: ad.adName, campaign: ad.campaign, caption: captionOf(ad), reason: ad.reason, metrics: { spend: ad.spend, purchases: ad.purchases, roas: ad.roas }, preview: creativeImageUrl(creatives.get(ad.adId)) }));
}

// The chosen ad as a report item, its picture copied into our storage.
export async function pickCreative({ db, token, accounts, projectId, period, adId, graphFn = graphGet, fetchFn = fetch }) {
  const ranked = await rankedAds({ accounts, start: period.start, end: period.end, token, graphFn });
  const ad = ranked.find((a) => a.adId === String(adId));
  if (!ad) throw new Error('Це оголошення не знайдено серед оголошень періоду.');
  const creatives = await creativesOf([ad.adId], { token, graphFn });
  const c = creatives.get(ad.adId);
  const img = await copyImage({ db, url: creativeImageUrl(c), path: `${folder(projectId, period.start, period.end)}/${ad.adId}`, fetchFn });
  return creativeItem(ad, c, img);
}

// The collector the agent's run is given: asks for the creatives of the Meta accounts of a project (null without a token, then the run simply has none).
export const makeCreativesCollector = (db, token) => (token ? ({ projectId, accounts, period, count }) => collectCreatives({ db, token, accounts, projectId, period, count }) : null);
