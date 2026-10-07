import { toJpeg, toPng } from 'html-to-image';

// Renders the live 1000x750 cover DOM node to a PNG/JPEG data URL at its true
// size (1x). The node is the cover itself (not the scaled preview wrapper), so
// the preview's CSS transform never leaks into the file.
export const COVER_W = 1000;
export const COVER_H = 750;

const FONTS = [
  '700 40px "Space Grotesk"', '500 20px "Space Grotesk"', '400 18px "Space Grotesk"',
  '400 12px "Space Mono"', '700 12px "Space Mono"',
];

async function waitForFonts() {
  if (!document.fonts) return;
  await Promise.all(FONTS.map((f) => document.fonts.load(f).catch(() => null)));
  await document.fonts.ready;
}

export async function exportCover(node, type) {
  await waitForFonts();
  const opts = { width: COVER_W, height: COVER_H, pixelRatio: 1, backgroundColor: '#000' };
  // First pass warms the image/font cache so the real pass has every asset.
  await toPng(node, opts).catch(() => null);
  return type === 'jpeg' ? toJpeg(node, { ...opts, quality: 0.95 }) : toPng(node, opts);
}
