// The Creator's skill «animate_creatives» (Zeely item 5, owner's decisions 2026-11-25): a short vertical VIDEO from the picture of an approved creative (the picture is the first frame, so the product stays
// recognisable). PURE: no network, no model, no clock. Code owns the limits (3 videos per project per month, 4-10 seconds, the project's money), the prompt rules (nothing added to the product, no text in
// the frame) and the refusal of invented customer opinions: the voice-over is the creative's own checked text, and a line that speaks as a customer («я купив…») is refused.
import { LANGS } from './variationsEngine.js';

export const VIDEO_MONTHLY_MAX = 3;
export const DURATION = { min: 4, max: 10, default: 10 };
export const RESOLUTIONS = { '720p': '720p (дешевше)', '1080p': '1080p (чіткіше)' };
export const QUALITY = { fast: 'швидко (дешевше, лише для тестів)', std: 'стандарт (якісніше)' };
export const AUDIO = { silent: 'без звуку', sound: 'зі звуком і музикою, без мови', voice: 'з озвучкою тексту креатива' };
export const MOTIONS = {
  push_in: ['повільне наближення', 'Slow smooth push-in towards the product, gentle natural movement of the surroundings.'],
  orbit: ['обліт навколо товару', 'The camera slowly orbits around the product, the light shifts softly.'],
  handheld: ['жива камера з рук', 'Natural handheld camera feel, small organic movements, as a person filming the product at home.'],
  reveal: ['поступова поява товару', 'The scene slowly reveals the product: a soft focus pull and light change bring it to the centre.'],
};
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const monthKey = (d) => new Date(d).toISOString().slice(0, 7);

// the request of the manager → a clean one, or an error in words of the manager
export function normalizeVideoRequest(input = {}) {
  const sources = [...new Set((Array.isArray(input.sources) ? input.sources : [input.source]).map((s) => String(s || '').trim()).filter(Boolean))].slice(0, VIDEO_MONTHLY_MAX);
  if (!sources.length) throw new Error('Оберіть хоча б один готовий креатив, з якого зробити відео.');
  const d = Math.floor(Number(input.duration));
  const audio = AUDIO[input.audio] ? input.audio : 'silent';
  if (audio === 'voice' && !LANGS[input.language]) throw new Error('Для озвучки оберіть мову.');
  return {
    sources, duration: Number.isFinite(d) ? Math.max(DURATION.min, Math.min(DURATION.max, d)) : DURATION.default,
    resolution: RESOLUTIONS[input.resolution] ? input.resolution : '720p', quality: QUALITY[input.quality] ? input.quality : 'fast',
    audio, language: audio === 'voice' ? input.language : '', motion: MOTIONS[input.motion] ? input.motion : 'push_in',
  };
}

// how many videos this month already (failed ones are not counted: they were not charged)
export const videosThisMonth = (videos, now) => (videos || []).filter((v) => v.month === monthKey(now) && v.status !== 'failed').length;

// a voice-over that speaks AS A CUSTOMER is an invented opinion (owner's rule 2026-11-25: no testimonials)
const TESTIMONIAL = /(?<!\p{L})(?:(?:я|мені|мене|мій|моя|моє|мої|мною)\s+(?:купив|купила|замовив|замовила|користуюс\S*|рекомендую|вдячн\S*|подобається|допомог\S*|сподобал\S*)|i\s+(?:bought|ordered|love|loved|use|used|recommend)|my\s+(?:experience|review)|as a customer)(?!\p{L})/iu;
export const isTestimonial = (text) => TESTIMONIAL.test(String(text || ''));

export function buildMotionPrompt({ card, req }) {
  const parts = [
    'Animate this exact product image as a short vertical ad shot.', MOTIONS[req.motion][1],
    'Keep the product, its shape, colours, packaging and any logo exactly as in the image: do not add, remove or change the product.',
    'No text, subtitles, captions, letters, watermarks or prices appear anywhere in the frame.',
    card.visual_prompt ? `Scene of the picture: ${clip(card.visual_prompt, 300)}` : '',
  ];
  if (req.audio === 'sound') parts.push('Soft natural ambient sound and light music. No speech.');
  if (req.audio === 'voice') parts.push(`A calm voice-over in ${LANGS[req.language]} says: "${clip(card.primary_text, 220)}". No other speech.`);
  return parts.filter(Boolean).join(' ');
}

// the video entries for the chosen cards. Errors (a card that is not ready, a testimonial) are told to the manager before anything is spent.
export function planVideos({ req, items, videos = [], now, max = VIDEO_MONTHLY_MAX }) {
  const month = monthKey(now);
  const out = [];
  const left = max - videosThisMonth(videos, now);
  const skipped = [];
  for (const id of req.sources) {
    const card = items.find((x) => x.id === id);
    if (!card) throw new Error(`Креатива ${id} немає в розділі «Креативи (готові)».`);
    if (card.status !== 'ready' || !/^https:\/\//i.test(card.image_url || '')) throw new Error(`Креатив ${id} ще без готової картинки: відео робиться з готової картинки.`);
    if (req.audio === 'voice') {
      if (!clip(card.primary_text, 10)) throw new Error(`У креатива ${id} немає тексту для озвучки.`);
      if (isTestimonial(card.primary_text)) throw new Error(`Текст креатива ${id} звучить як відгук покупця («я купив…»): озвучувати такий текст не можна, обирайте «зі звуком без мови» або «без звуку».`);
    }
    if (out.length >= left) { skipped.push(id); continue; }
    out.push({
      of: id, month, status: 'planned', duration: req.duration, resolution: req.resolution, quality: req.quality, audio: req.audio !== 'silent', audio_mode: req.audio, language: req.language, motion: req.motion,
      aspect_ratio: '9:16', prompt: buildMotionPrompt({ card, req }), start_url: card.image_url, video_url: '', path: '', job: null, estimate_usd: 0, cost_usd: 0, attempt: 0, note: '', tag: card.tag || '',
    });
  }
  return { videos: out, skipped, left };
}

const STATUS = { planned: 'заплановано', producing: 'генерується', ready: 'готово', failed: 'не вдалося' };
export function renderVideosText(videos) {
  if (!videos?.length) return '';
  const out = ['', 'Відео'];
  videos.forEach((v) => out.push(`• ${v.id} з креатива ${v.of}: ${v.duration} с, ${v.resolution}, ${AUDIO[v.audio_mode] || 'без звуку'} [${STATUS[v.status] || v.status}]${v.note ? ` · ${v.note}` : ''}${v.video_url ? ` · ${v.video_url}` : ''}`));
  return out.join('\n');
}
