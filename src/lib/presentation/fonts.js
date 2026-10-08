// Fonts available in the presentation builder. Three brand fonts plus the PowerPoint
// standards. The standards are drawn with free look-alikes that have the same letter
// widths (Arimo for Arial, Carlito for Calibri, ...), so line breaks in the preview and
// the PDF match PowerPoint; the PPTX gets the real family name.
import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/700.css';
import '@fontsource/onest/800.css';
import '@fontsource/onest/900.css';
import '@fontsource/barlow-condensed/400.css';
import '@fontsource/barlow-condensed/400-italic.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/700-italic.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/800-italic.css';
import '@fontsource/barlow-condensed/900.css';
import '@fontsource/barlow-condensed/900-italic.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/600-italic.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/cormorant-garamond/700-italic.css';
import '@fontsource/arimo/400.css';
import '@fontsource/arimo/400-italic.css';
import '@fontsource/arimo/700.css';
import '@fontsource/arimo/700-italic.css';
import '@fontsource/carlito/400.css';
import '@fontsource/carlito/400-italic.css';
import '@fontsource/carlito/700.css';
import '@fontsource/carlito/700-italic.css';
import '@fontsource/tinos/400.css';
import '@fontsource/tinos/400-italic.css';
import '@fontsource/tinos/700.css';
import '@fontsource/tinos/700-italic.css';
import '@fontsource/caladea/400.css';
import '@fontsource/caladea/400-italic.css';
import '@fontsource/caladea/700.css';
import '@fontsource/caladea/700-italic.css';
import '@fontsource/gelasio/400.css';
import '@fontsource/gelasio/400-italic.css';
import '@fontsource/gelasio/700.css';
import '@fontsource/gelasio/700-italic.css';
import '@fontsource/cousine/400.css';
import '@fontsource/cousine/400-italic.css';
import '@fontsource/cousine/700.css';
import '@fontsource/cousine/700-italic.css';

// weights = the weights that exist as real files; italic = a real italic file exists.
// pptx = the name written into a PPTX; safe = what the "standard fonts" export option uses instead.
export const FONTS = [
  { id: 'Onest', group: 'brand', css: "'Onest', sans-serif", pptx: 'Onest', safe: 'Arial', weights: [400, 500, 600, 700, 800, 900], italic: false },
  { id: 'Barlow Condensed', group: 'brand', css: "'Barlow Condensed', sans-serif", pptx: 'Barlow Condensed', safe: 'Arial Narrow', weights: [400, 700, 800, 900], italic: true },
  { id: 'Cormorant Garamond', group: 'brand', css: "'Cormorant Garamond', serif", pptx: 'Cormorant Garamond', safe: 'Georgia', weights: [400, 600, 700], italic: true },
  { id: 'Arial', group: 'standard', css: "'Arimo', Arial, sans-serif", pptx: 'Arial', safe: 'Arial', weights: [400, 700], italic: true },
  { id: 'Calibri', group: 'standard', css: "'Carlito', Calibri, sans-serif", pptx: 'Calibri', safe: 'Calibri', weights: [400, 700], italic: true },
  { id: 'Times New Roman', group: 'standard', css: "'Tinos', 'Times New Roman', serif", pptx: 'Times New Roman', safe: 'Times New Roman', weights: [400, 700], italic: true },
  { id: 'Cambria', group: 'standard', css: "'Caladea', Cambria, serif", pptx: 'Cambria', safe: 'Cambria', weights: [400, 700], italic: true },
  { id: 'Georgia', group: 'standard', css: "'Gelasio', Georgia, serif", pptx: 'Georgia', safe: 'Georgia', weights: [400, 700], italic: true },
  { id: 'Courier New', group: 'standard', css: "'Cousine', 'Courier New', monospace", pptx: 'Courier New', safe: 'Courier New', weights: [400, 700], italic: true },
];

export const FONT_BY_ID = Object.fromEntries(FONTS.map((f) => [f.id, f]));

export const WEIGHT_LABELS = { 400: 'Звичайний', 500: 'Середній', 600: 'Напівжирний', 700: 'Жирний', 800: 'Дуже жирний', 900: 'Чорний' };

export function fontCss(id) {
  return FONT_BY_ID[id]?.css || FONT_BY_ID.Onest.css;
}

// Nearest weight that has a real file in the family.
export function nearestWeight(fontId, weight) {
  const list = (FONT_BY_ID[fontId] || FONT_BY_ID.Onest).weights;
  return list.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), list[0]);
}

export const SIZE_PRESETS = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96];
export const MIN_SIZE = 12;
export const MAX_SIZE = 96;

// Wait until the fonts the slides use are really loaded (before measuring and exporting).
export async function fontsReady() {
  try {
    const loads = [];
    FONTS.forEach((f) => {
      const name = f.css.split(',')[0];
      f.weights.forEach((w) => loads.push(document.fonts.load(`${w} 16px ${name}`, 'Aa Яя')));
    });
    await Promise.allSettled(loads);
    await document.fonts.ready;
  } catch { /* the page still renders with fallbacks */ }
}
