// Reads an uploaded image into a data URL, downscaling big files so several
// photos still fit in localStorage. PNG/WebP/GIF stay PNG (transparency is
// what makes a cut-out portrait work); everything else becomes JPEG.
const MAX_SIDE = 1600;

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => resolve(e.target.result);
    r.onerror = () => reject(new Error('Не вдалося прочитати файл'));
    r.readAsDataURL(file);
  });
}

export async function readImage(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Потрібне зображення');
  const url = await readAsDataURL(file);
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Не вдалося відкрити зображення'));
    im.src = url;
  });
  const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  if (k >= 1 && file.size < 1500000) return url;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const keepAlpha = /png|webp|gif/.test(file.type);
  return c.toDataURL(keepAlpha ? 'image/png' : 'image/jpeg', 0.9);
}
