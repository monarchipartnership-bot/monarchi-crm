// Image Studio data model (v3): defaults, palettes, the per-template field
// catalogue and the one-time migration from the old canvas editor's
// `monarchi_studio_v2` save.

export const STORAGE_KEY = 'monarchi_studio_v3';
export const LEGACY_KEY = 'monarchi_studio_v2';
export const CASES_KEY = 'monarchi_studio_cases';

// Colour keys: five artwork colours + text / muted-text colours.
export const COLOR_KEYS = [
  { key: 'bgA', label: 'Фон згори' },
  { key: 'bgB', label: 'Фон знизу' },
  { key: 'glow', label: 'Сяйво' },
  { key: 'gold', label: 'Акцент' },
  { key: 'mag', label: 'Виділення' },
  { key: 'text', label: 'Текст' },
  { key: 'mut', label: 'Другий текст' },
];

const TEXTS = { text: '#ffffff', mut: '#CBA6CB' };
export const PRESETS = {
  royal: { bgA: '#2a0a2a', bgB: '#48164c', glow: '#7d1f78', gold: '#E8C079', mag: '#C24BC2', ...TEXTS },
  magenta: { bgA: '#3a0c38', bgB: '#7a1c6e', glow: '#c23bab', gold: '#FFD98A', mag: '#E26AD6', ...TEXTS },
  onyx: { bgA: '#140711', bgB: '#2c0e2a', glow: '#5a1652', gold: '#E8C079', mag: '#A23F9E', ...TEXTS },
};
export const DEFAULT_COLORS = PRESETS.royal;

export const TYPES = [
  { id: 'catalog', nm: 'Project Catalog' },
  { id: 'web', nm: 'Portfolio · Web' },
  { id: 'mobile', nm: 'Portfolio · Mobile' },
];

export const SIZE_LABELS = {
  title: 'Заголовок',
  sub: 'Текст',
  tags: 'Теги',
  num: 'Цифри',
};
export const SIZE_RANGE = { min: 60, max: 160, step: 5 };

export const DEFAULT_CONTENT = {
  kicker: 'META · GOOGLE · TIKTOK ADS',
  title: 'Performance Marketing',
  accent: 'that Scales Ambitious Brands',
  subtitle: 'Research, launch, optimize, scale — end to end. Built by a senior team.',
  url: 'monarchi.agency',
  metrics: [
    { v: '420%', l: 'Average ROAS' },
    { v: '100+', l: 'Projects scaled' },
    { v: '$1.5M+', l: 'Ad budget managed' },
  ],
  tags: [
    { t: 'Meta Ads', a: false },
    { t: 'Google Ads', a: false },
    { t: 'TikTok Ads', a: true },
    { t: 'GA4 + GTM', a: false },
    { t: 'Looker Studio', a: false },
    { t: 'Shopify', a: true },
  ],
};

export const DEFAULT_SIZES = { title: 100, sub: 100, tags: 100, num: 100 };

export function defaultState() {
  return {
    type: 'catalog',
    templates: { catalog: 'servicePortrait', web: 'webEditorial', mobile: 'phoneTrio' },
    colors: { ...DEFAULT_COLORS },
    content: JSON.parse(JSON.stringify(DEFAULT_CONTENT)),
    sizes: { ...DEFAULT_SIZES },
    images: { person: null, main: null, s2: null, s3: null },
  };
}

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

// Merge a stored (possibly older / partial) state over the defaults so a save
// from an earlier build can never leave a field undefined.
export function normalize(raw) {
  const d = defaultState();
  if (!isObj(raw)) return d;
  const out = { ...d };
  if (['catalog', 'web', 'mobile'].includes(raw.type)) out.type = raw.type;
  if (isObj(raw.templates)) out.templates = { ...d.templates, ...raw.templates };
  if (isObj(raw.colors)) out.colors = { ...d.colors, ...raw.colors };
  if (isObj(raw.sizes)) out.sizes = { ...d.sizes, ...raw.sizes };
  if (isObj(raw.images)) out.images = { ...d.images, ...raw.images };
  if (isObj(raw.content)) {
    const c = { ...d.content, ...raw.content };
    c.metrics = Array.isArray(raw.content.metrics)
      ? [0, 1, 2].map((i) => ({ v: '', l: '', ...(raw.content.metrics[i] || {}) }))
      : d.content.metrics;
    c.tags = Array.isArray(raw.content.tags) ? raw.content.tags.filter((t) => t && typeof t.t === 'string') : d.content.tags;
    out.content = c;
  }
  return out;
}

// Old canvas editor save -> new shape. Old covers are gone from the new
// editor, so only the content, colours and the main image carry over.
export function migrateLegacy(raw) {
  const d = defaultState();
  if (!isObj(raw)) return d;
  const OLD_TITLE = 'Performance Marketing that Scales Ambitious Brands';
  const out = { ...d };
  if (isObj(raw.colors)) out.colors = { ...d.colors, ...raw.colors };
  const c = { ...d.content };
  if (typeof raw.kicker === 'string') c.kicker = raw.kicker;
  if (typeof raw.subtitle === 'string') c.subtitle = raw.subtitle;
  if (typeof raw.title === 'string' && raw.title !== OLD_TITLE) { c.title = raw.title; c.accent = ''; }
  if (Array.isArray(raw.metrics)) c.metrics = [0, 1, 2].map((i) => ({ v: '', l: '', ...(raw.metrics[i] || {}) }));
  out.content = c;
  if (typeof raw.mainData === 'string') out.images = { ...d.images, main: raw.mainData };
  if (raw.format === 'portfolio') out.type = 'web';
  return out;
}

export function loadState() {
  try {
    const v3 = localStorage.getItem(STORAGE_KEY);
    if (v3) return normalize(JSON.parse(v3));
    const v2 = localStorage.getItem(LEGACY_KEY);
    if (v2) return migrateLegacy(JSON.parse(v2));
  } catch {
    // unreadable save: start from defaults
  }
  return defaultState();
}

export function loadCases() {
  try {
    const raw = JSON.parse(localStorage.getItem(CASES_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((c) => c && c.id && c.content) : [];
  } catch {
    return [];
  }
}
