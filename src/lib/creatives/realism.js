// The realism looks of the pictures (owner's plan step 3.4, 2026-11-13): a fixed set of photographic looks. The maker writes the scene; the code adds the cues of the chosen look (lens, light, texture,
// the «living» imperfections) to EVERY prompt for Higgsfield and a common list of what makes a picture look generated to the negative prompt, so the approach works whatever the model made of the wording.
// The look is a setting of a TASK (brief.look): «std» (the default: nothing is added), a look of the list, or «auto» (the maker picks a look for every idea). Pure code.

// The look a NEW task starts with (owner, 2026-11-13: «як стандарт студійний»); tasks made before keep «std» until a person changes it in the settings of the task.
export const DEFAULT_LOOK = 'studio';

export const LOOK_NEGATIVE = 'plastic or waxy skin, over-smoothed surfaces, oversharpened HDR look, oversaturated colours, floating objects, warped text, malformed hands, extra fingers, cartoon or CGI look';

export const LOOKS = [
  { key: 'std', label: 'Як зараз', desc: 'Без додавань: стиль, який складає креативщик сам.', use: 'Усе, що не потребує окремого вигляду.', cues: '', color: '#E6DDEB' },
  { key: 'auto', label: 'Авто (обирає креативщик)', desc: 'Для кожної ідеї сам обирає вигляд зі списку нижче.', use: 'Коли в задачі різні за характером ідеї.', cues: '', color: '#D9C7F0' },
  { key: 'studio', label: 'Студійний товар', desc: 'Софтбокс, чистий фон, чесні м’які тіні, обʼєктив 85 мм, кольори без перенасичення.', use: 'Каталог, акції, один товар у кадрі.', color: '#F4F0EA',
    cues: 'Clean studio product photograph, softbox key light with soft fill, seamless backdrop, honest soft shadows, 85mm lens, sharp focus on the product, true-to-life colours, subtle natural reflections.' },
  { key: 'life', label: 'Лайфстайл, природне світло', desc: 'Справжній інтер’єр, денне світло з вікна, 35 мм, живі дрібниці, легке зерно.', use: 'Товар у побуті, настрій бренду.', color: '#F3D9C9',
    cues: 'Candid lifestyle photograph in a real interior, soft window daylight, 35mm lens, natural shadows, lived-in details, natural colours, subtle film grain.' },
  { key: 'ugc', label: 'UGC: фото на телефон', desc: 'Ніби зняла клієнтка: невелика неідеальність кадру, природне світло, мінімум ретуші.', use: 'Соцмережі, відгуки, довіра.', color: '#CFE3D3',
    cues: 'Casual smartphone photo look, handheld, slightly imperfect framing, natural available light, minimal retouching, realistic skin texture and flyaway hairs, mild grain, true-to-life colours.' },
  { key: 'ed', label: 'Редакційний портрет / beauty', desc: '85 мм, м’яке спрямоване світло, справжня шкіра з порами, живе волосся.', use: 'Перуки, косметика, догляд, мода.', color: '#EFC9D4',
    cues: 'Editorial beauty portrait, 85mm lens, soft directional light with gentle fall-off, natural skin texture with visible pores, realistic individual hair strands, neutral colour grade.' },
  { key: 'macro', label: 'Макро: фактура й деталь', desc: 'Крупний план матеріалу, мала глибина різкості, бокове світло.', use: 'Текстура, склад, якість матеріалу.', color: '#D3D6EE',
    cues: 'Macro product photograph, extreme close detail, shallow depth of field, crisp true material texture, raking side light, no artificial gloss.' },
  { key: 'env', label: 'Товар у середовищі', desc: 'Товар там, де ним користуються: полиця, стіл, кухня; правдоподібний масштаб.', use: 'Показати, як це виглядає в житті.', color: '#E9D9A8',
    cues: 'Product in its real use environment, natural light, believable everyday clutter, correct scale and perspective, a real surface with a little wear.' },
];

const BY_KEY = Object.fromEntries(LOOKS.map((l) => [l.key, l]));
export const LOOK_KEYS = LOOKS.map((l) => l.key);
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// → a key of the list other than «std», or null (nothing set = «std»)
export const cleanLook = (v) => (BY_KEY[v] && v !== 'std' ? v : null);
export const lookOf = (brief) => cleanLook(brief?.look) || 'std';
export const lookLabel = (key) => BY_KEY[key]?.label || BY_KEY.std.label;
// the looks that carry cues (the maker may name one of them for an idea in the «auto» mode)
export const REAL_LOOKS = LOOKS.filter((l) => l.cues);

// The prompt of one picture with the cues of the look added at the end (the cues always stay: the scene is cut first) and the common negative list. key: a look with cues, otherwise nothing changes.
export function applyLook({ prompt, negative }, key) {
  const look = BY_KEY[key];
  if (!look?.cues) return { prompt, negative };
  const room = 2500 - look.cues.length - 2;
  const scene = String(prompt || '').trim().slice(0, Math.max(0, room)).replace(/[\s.,;]+$/, '');
  return {
    prompt: scene ? `${scene}. ${look.cues}` : look.cues,
    negative: clip(`${String(negative || '').trim().replace(/[\s,;.]+$/, '')}${negative ? ', ' : ''}${LOOK_NEGATIVE}`, 800),
  };
}

// What the maker is told about the looks (a block of its input). lookKey: the task's setting.
export function lookBlock(lookKey) {
  if (lookKey === 'auto') {
    return { title: 'Реалізм картинок: оберіть вигляд для кожної ідеї', text: `${REAL_LOOKS.map((l) => `- ${l.key}: ${l.label}. ${l.desc} Підходить: ${l.use}`).join('\n')}\nPut the key of the look that fits the idea in the "look" field of EVERY creative (or "std" when none fits). The system adds the cues of the chosen look to your prompt by itself: write the scene, the subject and the composition, and do not repeat lens, light or grain.` };
  }
  const look = BY_KEY[lookKey];
  if (!look?.cues) return null;
  return { title: `Реалізм картинок (обрав менеджер): ${look.label}`, text: `The system adds these cues to every prompt by itself: ${look.cues}\nWrite the scene, the subject and the composition to match this look and do not repeat the cues. Do not ask for anything that contradicts it (CGI, glossy hyper-render, stock-photo perfection).` };
}
