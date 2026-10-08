// Reads a picture chosen by the person, shrinks it and returns a data URL small enough to be
// saved inside the deck (nothing is uploaded anywhere). Only png / jpeg / webp are accepted.
const MAX_SIDE = 1000;
const MAX_BYTES = 420 * 1024;
const OK = ['image/png', 'image/jpeg', 'image/webp'];

export async function readSlideImage(file) {
  if (!file || !OK.includes(file.type)) throw new Error('Підтримуються лише PNG, JPEG і WebP.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Файл завеликий (понад 12 МБ).');
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  // Keep transparency for logos (PNG / WebP), flatten photos to JPEG.
  let src = file.type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.88) : canvas.toDataURL('image/png');
  if (src.length * 0.75 > MAX_BYTES) {
    // Too heavy: JPEG on a dark plum background, lowering the quality until it fits.
    const flat = document.createElement('canvas');
    flat.width = w;
    flat.height = h;
    const fctx = flat.getContext('2d');
    fctx.fillStyle = '#270827';
    fctx.fillRect(0, 0, w, h);
    fctx.drawImage(bmp, 0, 0, w, h);
    for (let q = 0.85; q >= 0.4; q -= 0.15) {
      src = flat.toDataURL('image/jpeg', q);
      if (src.length * 0.75 <= MAX_BYTES) break;
    }
  }
  if (bmp.close) bmp.close();
  if (src.length * 0.75 > MAX_BYTES * 1.6) throw new Error('Зображення завелике, оберіть менше.');
  return { src, w, h };
}
