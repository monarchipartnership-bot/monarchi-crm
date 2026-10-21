// «Most effective creatives» of a report: which ads to show and how to describe them. Pure code (no network), shared by the server (the agent's run and the
// «pick a creative» endpoint) and the tests. The ranking is made in code from the ads' own numbers; the picture comes from the ad's creative.

export const CREATIVE_COUNT = { weekly: 3, monthly: 4, custom: 3 };

// Ads (rows with spend, purchases, roas) best first. An ad counts as «solid» when it spent a fair share of the budget and sold: those go first by ROAS
// (then purchases); then ads that sold but spent little, by purchases; then the rest by spend, so there is still something to show in a weak week.
export function rankAds(rows, { minShare = 0.02 } = {}) {
  const list = (rows || []).filter((r) => r && r.adId);
  const total = list.reduce((s, r) => s + (Number(r.spend) || 0), 0);
  const floor = Math.max(1, total * minShare);
  const solid = (r) => (Number(r.spend) || 0) >= floor && (r.purchases || 0) > 0 && r.roas != null;
  const byRoas = (a, b) => b.roas - a.roas || b.purchases - a.purchases || b.spend - a.spend;
  const byBuys = (a, b) => b.purchases - a.purchases || b.spend - a.spend;
  const a = list.filter(solid).sort(byRoas);
  const b = list.filter((r) => !solid(r) && (r.purchases || 0) > 0).sort(byBuys);
  const c = list.filter((r) => !(r.purchases > 0)).sort((x, y) => y.spend - x.spend);
  return [...a.map((r) => ({ ...r, reason: 'roas' })), ...b.map((r) => ({ ...r, reason: 'purchases' })), ...c.map((r) => ({ ...r, reason: 'spend' }))].map((r, i) => ({ ...r, rank: i + 1 }));
}

// The kind of a creative from what Meta returns for it: 'image' | 'video' | 'carousel' | 'catalog' (a dynamic ad from a product set: no single picture) | 'unknown'.
export function creativeKind(c) {
  if (!c) return 'unknown';
  const link = c.object_story_spec?.link_data;
  if (c.image_url || link?.picture || link?.image_hash) return 'image';
  if (c.video_id || c.object_story_spec?.video_data) return 'video';
  if (link?.child_attachments?.length) return 'carousel';
  if (c.product_set_id || c.asset_feed_spec) return 'catalog';
  return c.thumbnail_url ? 'image' : 'unknown';
}

// The best picture address of a creative (full size first, then what the story carries, then the thumbnail), or null.
export function creativeImageUrl(c) {
  if (!c) return null;
  const link = c.object_story_spec?.link_data;
  return c.image_url || link?.picture || link?.child_attachments?.find((x) => x.picture)?.picture || c.object_story_spec?.video_data?.image_url || c.thumbnail_url || null;
}

const money = (n) => (n == null ? null : Math.round(n * 100) / 100);

// The caption under a creative: the ad's name and its ROAS.
export const captionOf = (ad) => `${ad.adName || 'Ad ' + ad.adId}${ad.roas != null ? ` · ROAS ${ad.roas.toFixed(2)}` : ''}`;

// What a report keeps for one creative. imageUrl is OUR copy (Meta's links expire), null when there is no picture to show.
export function creativeItem(ad, creative, imageUrl) {
  return {
    adId: ad.adId, adName: ad.adName || '', campaign: ad.campaign || '', kind: creativeKind(creative), imageUrl: imageUrl || null,
    caption: captionOf(ad), reason: ad.reason || null,
    metrics: { spend: money(ad.spend), revenue: money(ad.revenue), purchases: ad.purchases || 0, roas: ad.roas, cpp: ad.cost_per_purchase, ctr: ad.ctr_pct },
  };
}

// The first `count` ranked ads that have DIFFERENT creatives (two ads of one picture show it once). creatives: Map adId → creative.
export function pickDistinct(ranked, creatives, count) {
  const seen = new Set();
  const out = [];
  for (const ad of ranked) {
    const c = creatives.get(ad.adId);
    const key = c?.id ? 'c' + c.id : 'a' + ad.adId;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ad);
    if (out.length >= count) break;
  }
  return out;
}
