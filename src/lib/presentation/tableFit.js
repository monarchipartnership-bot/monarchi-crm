// A table is never split over slides: the whole table goes on one slide and its text and rows shrink to fit.
// The slide is 960 x 540; the content box is 848 wide and 400 high, minus the heading (about 72px), and the table sits 24px in.
const W = 824;
const H = 320;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// `rows`: body rows, `cols`: value columns (the first, label column is extra). `maxFs` / `maxRh`: the size of a roomy table.
export function tableFit(rows, cols, { maxFs = 15, maxRh = 34 } = {}) {
  const c = Math.max(1, cols);
  const n = Math.max(1, rows);
  const pad = c > 9 ? 4 : c > 6 ? 7 : 12;
  const w0 = c > 8 ? 132 : c > 5 ? 150 : Math.round(W * 0.3);
  const colW = (W - w0) / c;
  let fs = clamp(Math.floor((colW - 2 * pad) / 6.4), 8, maxFs); // «$12,345» must fit a column
  const lines = c > 6 ? 3 : c > 3 ? 2 : 1;
  const hfs = Math.max(8, fs - 1);
  const hh = clamp(Math.round(hfs * 1.2 * lines + 12), 38, 72);
  const rh = clamp(Math.floor((H - hh) / n), 14, maxRh);
  fs = clamp(Math.min(fs, Math.floor(rh * 0.6)), 8, maxFs);
  return { fs, hfs: Math.max(8, Math.min(hfs, fs)), rh, hh, pad, w0 };
}

// The card grid of the metrics list: 4 cards a row; with more than 3 rows the cards get lower and their text smaller.
export function metricsFit(items) {
  const rows = Math.max(1, Math.ceil(items / 4));
  const rh = Math.min(106, Math.floor(H / rows));
  return { rh, scale: Math.round((rh / 106) * 100) / 100 };
}
