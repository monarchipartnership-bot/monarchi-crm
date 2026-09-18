// Shared "solid gradient status/stage pill" style — our fixed badge look for
// any text-only tag (deal stage, client status, etc.): a gradient built from
// the thing's own real color (not a generic hashed one) with white text,
// instead of the older flat-tint-with-colored-border outline pill.
export function stagePillStyle(color) {
  const c = color || '#94A3B8';
  return {
    color: '#fff',
    background: `linear-gradient(135deg, color-mix(in srgb, ${c} 45%, #fff), ${c})`,
    boxShadow: `0 3px 8px -3px ${c}80`,
  };
}
