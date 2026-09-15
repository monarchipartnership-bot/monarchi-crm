// Tag color assignment for Automation tasks. Base tags get fixed, meaningful
// colors; any custom tag gets a deterministic color from a small palette (a
// hash of the tag text) so it's stable across sessions without needing a
// separate tags-definition table.

export const BASE_TAGS = ['Bot', 'CRM', 'Reports', 'Automation'];

const BASE_TAG_COLORS = {
  Bot: '#6B2FA0',
  CRM: '#1E9E5D',
  Reports: '#2F80ED',
  Automation: '#B8860B',
};

const PALETTE = ['#D14343', '#1E9E5D', '#2F80ED', '#B8860B', '#6B2FA0', '#E8A33D', '#0F9B8E'];

function hashColor(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function colorForTag(tag) {
  return BASE_TAG_COLORS[tag] || hashColor(tag);
}
