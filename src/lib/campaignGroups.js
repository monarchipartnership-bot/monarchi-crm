// Campaign groups of a project: a named SET of campaigns chosen by hand (any number, from any linked account). A report can be narrowed to
// one group, so its numbers are those of exactly these campaigns. Pure code, shared by the pages and tested in scripts/check-core.mjs.
//   group = { id, name, platform, campaigns: ['platform|campaign name', ...], keywords?: [...] }
// A group belongs to ONE platform (the tab it was made in); a group without a platform is an old one and is shown in every tab.
// Groups made before this version had only keywords; they keep working: a campaign is in a group when it is listed OR matches a keyword.
import { sumBase } from './reportMetrics.js';

export const campaignKey = (platform, name) => `${platform}|${name}`;

// The groups of one platform tab. `platform` 'total' (the «Разом» tab) has no groups: it is the sum over everything.
export const groupsForPlatform = (groups, platform) => (platform === 'total' ? [] : (groups || []).filter((g) => !g.platform || g.platform === platform));

export function groupMatches(group, platform, name) {
  if ((group.campaigns || []).includes(campaignKey(platform, name))) return true;
  const lname = String(name || '').toLowerCase();
  return (group.keywords || []).some((k) => k && lname.includes(String(k).trim().toLowerCase()));
}

// The keys of the campaigns of a group that exist in `known` ([{ platform, name }]): what the group means right now.
export const groupCampaignKeys = (group, known) => known.filter((c) => groupMatches(group, c.platform, c.name)).map((c) => campaignKey(c.platform, c.name));

// The campaigns of a fetched report, flat: [{ platform, name, ...numbers }].
export const flatCampaigns = (data) => Object.entries(data?.platforms || {}).flatMap(([platform, p]) => (p.campaigns || []).map((c) => ({ platform, ...c })));

// A fetched period narrowed to one group: per platform only its campaigns, the totals are their sum (same for the previous period when
// it is there). A platform with no campaign of the group disappears. `group` null = everything as it was.
export function scopeToGroup(data, group) {
  if (!group || !data) return data;
  const narrow = (platforms) => {
    const out = {};
    Object.entries(platforms || {}).forEach(([platform, p]) => {
      const campaigns = (p.campaigns || []).filter((c) => groupMatches(group, platform, c.name));
      if (campaigns.length) out[platform] = { ...p, campaigns, total: sumBase(campaigns), groups: [] };
    });
    return out;
  };
  return { ...data, platforms: narrow(data.platforms), previous: data.previous ? { ...data.previous, platforms: narrow(data.previous.platforms) } : data.previous };
}

// The picker of the group form: the campaigns of the project (any platform), the biggest spend first, filtered by a search text.
export function filterCampaigns(list, query) {
  const q = String(query || '').trim().toLowerCase();
  return [...list].filter((c) => !q || c.name.toLowerCase().includes(q)).sort((a, b) => (b.spend || 0) - (a.spend || 0) || a.name.localeCompare(b.name));
}

// Campaigns known from several sources (the loaded report, a fresh fetch): one entry per platform + name, the larger spend kept.
export function mergeCampaigns(...lists) {
  const by = new Map();
  lists.flat().forEach((c) => {
    if (!c?.name) return;
    const k = campaignKey(c.platform, c.name);
    const prev = by.get(k);
    if (!prev || (c.spend || 0) > (prev.spend || 0)) by.set(k, { platform: c.platform, name: c.name, spend: c.spend || 0 });
  });
  return [...by.values()];
}
