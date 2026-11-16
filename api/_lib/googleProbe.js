// A READ-ONLY look at what a Google Ads account holds, to decide what the reports can take from it (owner, 2026-11-16: «все метрики як у Meta? а креативи?»).
// It changes nothing and costs nothing: a handful of small GAQL queries, each in its own try/catch, so one query the account does not allow (a campaign
// type that is not there, a field the API version lacks) never hides the others. The answer is counts and a few short samples, never the whole account.
//   probeAccount(target) → { sections: { campaigns, adTypes, conversionActions, conversionsByAction, assetGroups, assets, adAssetLabels, searchAds } }
//   each section: { ok: true, ... } or { ok: false, error }
import { enums } from 'google-ads-api';

// the library gives enums as numbers; a name is easier to read (and a string is kept as it is)
export const enumName = (map, v) => (typeof v === 'number' ? (map?.[v] ?? String(v)) : String(v ?? ''));
const bump = (obj, key, by = 1) => { obj[key] = (obj[key] || 0) + by; };
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const short = (v, n) => String(v ?? '').slice(0, n);
const messageOf = (e) => short(e?.errors?.[0]?.message || e?.message || String(e), 300);

export async function probeAccount(target) {
  const section = async (fn) => {
    try { return { ok: true, ...(await fn()) }; } catch (e) { return { ok: false, error: messageOf(e) }; }
  };

  const campaigns = await section(async () => {
    const rows = await target.query("SELECT campaign.advertising_channel_type, campaign.status FROM campaign WHERE campaign.status != 'REMOVED'");
    const byType = {};
    rows.forEach((r) => {
      const type = enumName(enums.AdvertisingChannelType, r.campaign?.advertising_channel_type);
      const status = enumName(enums.CampaignStatus, r.campaign?.status);
      byType[type] = byType[type] || {};
      bump(byType[type], status);
    });
    return { total: rows.length, byType };
  });

  const adTypes = await section(async () => {
    const rows = await target.query("SELECT ad_group_ad.ad.type, ad_group_ad.status FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED'");
    const byType = {};
    rows.forEach((r) => bump(byType, enumName(enums.AdType, r.ad_group_ad?.ad?.type)));
    return { total: rows.length, byType };
  });

  const conversionActions = await section(async () => {
    const rows = await target.query("SELECT conversion_action.name, conversion_action.type, conversion_action.category, conversion_action.status, conversion_action.primary_for_goal FROM conversion_action WHERE conversion_action.status != 'REMOVED'");
    return {
      total: rows.length,
      items: rows.slice(0, 30).map((r) => ({
        name: short(r.conversion_action?.name, 80),
        type: enumName(enums.ConversionActionType, r.conversion_action?.type),
        category: enumName(enums.ConversionActionCategory, r.conversion_action?.category),
        primary: Boolean(r.conversion_action?.primary_for_goal),
      })),
    };
  });

  // the «conversions» number of a report is the sum of these: what is inside it
  const conversionsByAction = await section(async () => {
    const rows = await target.query('SELECT segments.conversion_action_name, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date DURING LAST_30_DAYS');
    const by = {};
    rows.forEach((r) => {
      const name = short(r.segments?.conversion_action_name || '(без назви)', 80);
      by[name] = by[name] || { conversions: 0, value: 0 };
      by[name].conversions += Number(r.metrics?.conversions || 0);
      by[name].value += Number(r.metrics?.conversions_value || 0);
    });
    const items = Object.entries(by).map(([name, v]) => ({ name, conversions: round2(v.conversions), value: round2(v.value) })).sort((a, b) => b.conversions - a.conversions).slice(0, 20);
    return { period: 'last 30 days', items };
  });

  const assetGroups = await section(async () => {
    const rows = await target.query("SELECT asset_group.id, asset_group.name, asset_group.status, asset_group.ad_strength, campaign.name FROM asset_group WHERE asset_group.status != 'REMOVED'");
    return {
      total: rows.length,
      items: rows.slice(0, 12).map((r) => ({ name: short(r.asset_group?.name, 80), campaign: short(r.campaign?.name, 80), status: enumName(enums.AssetGroupStatus, r.asset_group?.status), adStrength: enumName(enums.AdStrength, r.asset_group?.ad_strength) })),
    };
  });

  // the creatives of Performance Max: pictures, videos, texts of every asset group. This API version has NO performance label on an asset group asset
  // (checked 16.11: the label lives only on ad_group_ad_asset_view, i.e. for search, display and Demand Gen ads, see adAssetLabels below)
  const assets = await section(async () => {
    const rows = await target.query("SELECT asset_group_asset.field_type, asset_group_asset.status, asset.text_asset.text, asset.image_asset.full_size.url, asset.youtube_video_asset.youtube_video_id FROM asset_group_asset WHERE asset_group_asset.status != 'REMOVED' LIMIT 400");
    const byField = {};
    const samples = {};
    rows.forEach((r) => {
      const field = enumName(enums.AssetFieldType, r.asset_group_asset?.field_type);
      bump(byField, field);
      const a = r.asset || {};
      const sample = a.text_asset?.text ? { text: short(a.text_asset.text, 90) } : a.image_asset?.full_size?.url ? { image: short(a.image_asset.full_size.url, 200) } : a.youtube_video_asset?.youtube_video_id ? { video: a.youtube_video_asset.youtube_video_id } : null;
      if (sample) { samples[field] = samples[field] || []; if (samples[field].length < 3) samples[field].push(sample); }
    });
    return { total: rows.length, byField, samples };
  });

  // Google's own label of each asset (best / good / low) for the assets of search, display and Demand Gen ads
  const adAssetLabels = await section(async () => {
    const rows = await target.query('SELECT ad_group_ad_asset_view.field_type, ad_group_ad_asset_view.performance_label FROM ad_group_ad_asset_view WHERE ad_group_ad_asset_view.enabled = TRUE LIMIT 500');
    const byField = {};
    rows.forEach((r) => {
      const field = enumName(enums.AssetFieldType, r.ad_group_ad_asset_view?.field_type);
      const label = enumName(enums.AssetPerformanceLabel, r.ad_group_ad_asset_view?.performance_label);
      byField[field] = byField[field] || {};
      bump(byField[field], label);
    });
    return { total: rows.length, byField };
  });

  const searchAds = await section(async () => {
    const rows = await target.query("SELECT ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions FROM ad_group_ad WHERE ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD' AND ad_group_ad.status != 'REMOVED' LIMIT 5");
    return {
      total: rows.length,
      items: rows.map((r) => ({
        headlines: (r.ad_group_ad?.ad?.responsive_search_ad?.headlines || []).slice(0, 4).map((h) => short(h.text, 60)),
        descriptions: (r.ad_group_ad?.ad?.responsive_search_ad?.descriptions || []).slice(0, 2).map((d) => short(d.text, 90)),
      })),
    };
  });

  return { sections: { campaigns, adTypes, conversionActions, conversionsByAction, assetGroups, assets, adAssetLabels, searchAds } };
}
