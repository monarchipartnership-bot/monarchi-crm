// The PUBLISHED cases of Mon'Archi (the figures are copied from the brand profile, table smm_brand, 2026-11-25) and the choice of the case for a lead.
// Rule of the document (8.2): at most ONE case in a message; only these figures; no client reviews; unpublished clients are never named.
// Education and info-business have NO published case: pickCase() answers null and the agent says so honestly.

export const CASES = {
  byme: {
    client: 'byMe', subniches: ['fashion', 'beauty', 'jewelry'], channels: ['google', 'meta'], country: 'UA',
    uk: 'ROAS 6.67 → 9.31, виручка +48% (Google Ads)', en: 'ROAS 6.67 → 9.31, revenue +48% (Google Ads)', blurb: 'український fashion-бренд',
  },
  mola: {
    client: 'Mola', subniches: ['beauty', 'fashion'], channels: ['meta', 'google'], country: 'UA',
    uk: 'ROAS 5.55 (+125%), понад 430 додаткових конверсій', en: 'ROAS 5.55 (+125%), 430+ extra conversions', blurb: 'український бренд догляду за шкірою й волоссям',
  },
  mellowdiamond: {
    client: 'MellowDiamond', subniches: ['jewelry', 'fashion', 'beauty', 'other_ecom'], channels: ['meta', 'google'], country: 'US',
    uk: 'вартість покупки −34%, ROAS 330% → 600% (Meta)', en: 'cost per purchase −34%, ROAS 330% → 600% (Meta)', blurb: 'американський e-commerce бутик',
  },
  humancentric: {
    client: 'HumanCentric', subniches: ['furniture', 'home', 'other_ecom'], channels: ['google', 'meta'], country: 'US',
    uk: 'бюджет −50% за того самого обсягу замовлень, ROAS +85%', en: 'budget −50% at the same order volume, ROAS +85%', blurb: 'американський бренд ергономічних меблів',
  },
  mebmodern: {
    client: 'MebModern', subniches: ['furniture', 'home', 'other_ecom'], channels: ['google', 'meta'], country: 'US',
    uk: 'загальний ROAS у 2,5 раза', en: 'overall ROAS up 2.5x', blurb: 'виробник меблів і інтернет-магазин',
  },
  oystersxo: {
    client: 'Oysters XO', subniches: ['services', 'events'], channels: ['google'], country: 'US',
    uk: '113 заявок на місяць, CPA $31–41 (Google Ads)', en: '113 monthly conversions, CPA $31–41 (Google Ads)', blurb: 'американський преміум-кейтеринг, лідогенерація',
  },
};

// → { key, ...case } or null (no honest case exists). `channel`: 'meta' | 'google' | null, the platform the lead already uses.
export function pickCase({ subniche = 'other', niche = 'other', channel = null } = {}) {
  if (niche === 'education' || subniche === 'education' || subniche === 'info') return null;
  const fits = Object.entries(CASES).filter(([, c]) => c.subniches.includes(subniche));
  if (!fits.length) return niche === 'ecommerce' ? { key: 'mellowdiamond', ...CASES.mellowdiamond } : niche === 'leadgen' ? { key: 'oystersxo', ...CASES.oystersxo } : null;
  const byChannel = channel ? fits.find(([, c]) => c.channels[0] === channel) : null;
  const [key, c] = byChannel || fits[0];
  return { key, ...c };
}

export const caseFacts = (c, lang = 'en') => (c ? c[lang === 'uk' ? 'uk' : 'en'] : '');
export const allClientNames = () => Object.values(CASES).map((c) => c.client);
