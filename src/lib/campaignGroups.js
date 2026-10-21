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

// The campaigns ([{ platform, name, spend }]) that belong to none of the groups of their platform: in a report they fall into «Other campaigns».
export function campaignsOutsideGroups(groups, campaigns) {
  return (campaigns || []).filter((c) => !groupsForPlatform(groups, c.platform).some((g) => groupMatches(g, c.platform, c.name))).sort((a, b) => (b.spend || 0) - (a.spend || 0));
}

// ---- the columns of a report: what the layout selected ----
// selection = { groups: [group ids], campaigns: ['platform|campaign name', ...] } (see the «Конструктор звіту»).
// A selected group gives ONE highlighted column with the sum of the whole group, then each of its campaigns in a column of its own; the campaigns
// selected by hand follow. A campaign that is in a group and also selected by hand is shown once. A campaign that is not selected, directly or
// through a group, is not in the report (the totals of the report stay those of the whole account).
// → [{ id, name, kind: 'group' | 'campaign', campaignCount, ...numbers }], in the order they are drawn.
export function buildColumns({ platform, campaigns, groups, selection }) {
  const sel = { groups: selection?.groups || [], campaigns: selection?.campaigns || [] };
  const byName = new Map((campaigns || []).map((c) => [c.name, c]));
  const out = [];
  const used = new Set();
  const asCampaign = (c) => ({ ...c, id: `c:${c.name}`, kind: 'campaign', campaignCount: 1 });
  groupsForPlatform(groups, platform).filter((g) => sel.groups.includes(g.id)).forEach((g) => {
    const members = (campaigns || []).filter((c) => groupMatches(g, platform, c.name));
    if (!members.length) return;
    out.push({ id: `g:${g.id}`, name: g.name, kind: 'group', campaignCount: members.length, ...sumBase(members) });
    members.forEach((c) => { if (!used.has(c.name)) { used.add(c.name); out.push(asCampaign(c)); } });
  });
  sel.campaigns.filter((k) => k.startsWith(platform + '|')).forEach((k) => {
    const c = byName.get(k.slice(platform.length + 1));
    if (c && !used.has(c.name)) { used.add(c.name); out.push(asCampaign(c)); }
  });
  return out;
}

// The campaigns a layout selection takes in (for the preview and for «what is in the report»): the same rule as buildColumns, by name only.
export function selectedCampaignNames({ platform, campaigns, groups, selection }) {
  return buildColumns({ platform, campaigns: (campaigns || []).map((c) => ({ ...c })), groups, selection }).filter((c) => c.kind === 'campaign').map((c) => c.name);
}
