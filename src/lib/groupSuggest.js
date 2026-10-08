// Suggests campaign groups from the campaign names themselves: words that several (but not all)
// campaigns share ("Kinky", "Catalog", "Hybrid"...). Only a starting point: the person
// accepts, renames or ignores each suggestion.
const SKIP = new Set([
  'tof', 'mof', 'bof', 'cbo', 'abo', 'asc', 'adv', 'the', 'and', 'for', 'new', 'copy', 'campaign', 'campaigns', 'ads', 'ad', 'set', 'group',
  'video', 'image', 'static', 'reels', 'stories', 'feed', 'test', 'all', 'broad', 'prospecting', 'retargeting', 'rem', 'lal', 'lookalike',
  'кампанія', 'копія', 'нова',
]);

const tokens = (name) => String(name).split(/[^\p{L}\p{N}+]+/u).map((t) => t.trim()).filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !/^\d{1,2}[.\-/]\d{1,2}/.test(t) && !SKIP.has(t.toLowerCase()));

// campaignNames: string[]. Returns [{ name, keyword, count }]: the words shared by 2+ campaigns (but not by
// almost all of them), most common first. Words that always appear together count once.
export function suggestGroups(campaignNames, max = 8) {
  const names = [...new Set(campaignNames)];
  if (names.length < 3) return [];
  const byToken = new Map();
  names.forEach((n) => new Set(tokens(n).map((t) => t.toLowerCase())).forEach((t) => byToken.set(t, [...(byToken.get(t) || []), n])));
  const seenSets = new Set();
  const out = [];
  [...byToken.entries()]
    .filter(([, list]) => list.length >= 2 && list.length <= Math.max(2, Math.floor(names.length * 0.8)))
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .forEach(([t, list]) => {
      const key = [...list].sort().join('|');
      if (seenSets.has(key) || out.length >= max) return;
      seenSets.add(key);
      // Show the word the way it is written in the names.
      const spelled = tokens(list[0]).find((x) => x.toLowerCase() === t) || t;
      out.push({ name: spelled.charAt(0).toUpperCase() + spelled.slice(1), keyword: t, count: list.length });
    });
  return out;
}
