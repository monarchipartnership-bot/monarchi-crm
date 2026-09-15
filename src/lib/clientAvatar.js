// Deterministic avatar color per client name — same hash approach as
// tagColors.js's hashColor, but its own palette so client avatars don't
// visually collide with tag chip colors.
const AVATAR_PALETTE = ['#D14343', '#1E9E5D', '#2F80ED', '#B8860B', '#6B2FA0', '#E8A33D', '#0F9B8E', '#C2185B', '#00838F'];

export function initialsFor(name) {
  const trimmed = (name || '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

export function avatarColorFor(name) {
  const str = (name || '').trim();
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
