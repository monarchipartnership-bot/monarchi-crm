// The words over a picture, made on the SERVER (owner, 2026-11-12, step 3.1 of the plan): the creative arrives for the person's review with its headline and button already on it, with no
// browser involved. The same layout and painting as the browser one (src/lib/creatives/composeText.js, paintText); the font is Onest (Latin, Latin extended, Cyrillic, Cyrillic extended),
// so Ukrainian, Polish, German and the like are spelled by a real font and never by an image model. The canvas is @napi-rs/canvas (a prebuilt binary, runs in a Vercel function).
import { createRequire } from 'node:module';
import path from 'node:path';
import { paintText } from '../../src/lib/creatives/composeText.js';

const require = createRequire(import.meta.url);
const SUBSETS = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'];
const WEIGHTS = [500, 800];
let canvasLib = null;
let fontsReady = false;

function lib() {
  if (!canvasLib) canvasLib = require('@napi-rs/canvas');
  return canvasLib;
}
// The font files of @fontsource/onest (the function bundle includes them: vercel.json → includeFiles).
function fontDir() {
  try { return path.dirname(require.resolve('@fontsource/onest/package.json')); } catch { return path.join(process.cwd(), 'node_modules', '@fontsource', 'onest'); }
}
export function registerFonts() {
  if (fontsReady) return;
  const { GlobalFonts } = lib();
  const dir = path.join(fontDir(), 'files');
  for (const w of WEIGHTS) for (const s of SUBSETS) GlobalFonts.registerFromPath(path.join(dir, `onest-${s}-${w}-normal.woff2`), 'Onest');
  fontsReady = true;
}

// image: a Buffer of the picture (png / jpg / webp). → { png: Buffer, width, height, layout }
export async function composeTextServer({ image, zone = 'left', headline = '', subline = '', badge = '', cta = '', maxSide = 2400, style = null }) {
  const { createCanvas, loadImage } = lib();
  registerFonts();
  const img = await loadImage(image);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const W = Math.round(img.width * scale);
  const H = Math.round(img.height * scale);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);
  const layout = paintText(ctx, { W, H, zone, headline, subline, badge, cta, font: "'Onest', sans-serif", style });
  return { png: canvas.toBuffer('image/png'), width: W, height: H, layout };
}
