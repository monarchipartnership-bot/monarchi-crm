// What the Analyst may SAY about the website of a lead: only facts the code has read itself (docs/growth-workflow.md: «одне перевірюване спостереження»).
// The code derives the candidates from the signals of the pages it read; the model can only CHOOSE one of them, it never invents a fact about the site. PURE.
//   pages: [{ kind, ok, signals }] as collectSiteData() returns them;  tags: { meta_pixel, ga, gtm } detected in the raw HTML of the home page (leadSite.js)

export const FINDINGS = {
  no_viewport: { en: 'your site has no mobile viewport tag, so pages may render badly on phones', uk: 'на вашому сайті немає мобільного viewport-тегу, тож сторінки можуть погано виглядати на телефонах' },
  no_meta_pixel: { en: 'I could not find the Meta Pixel loading on your home page', uk: 'я не знайшов піксель Meta на вашій головній сторінці' },
  no_analytics: { en: 'I could not find a Google Analytics or Tag Manager tag on your home page', uk: 'я не знайшов тег Google Analytics чи Tag Manager на вашій головній сторінці' },
  no_product_schema: { en: 'your product pages carry no Product structured data, which Google Shopping and rich results rely on', uk: 'на сторінках товарів немає структурованих даних Product, на які спираються Google Shopping і розширені результати' },
  no_returns_info: { en: 'I did not find delivery and return terms on the pages I read, and shoppers look for them before buying', uk: 'на прочитаних сторінках я не знайшов умов доставки й повернення, а покупці шукають їх перед покупкою' },
  no_reviews: { en: 'I did not find customer reviews on the pages I read', uk: 'на прочитаних сторінках я не знайшов відгуків клієнтів' },
  no_contact_channel: { en: 'I could not find a phone, email or messenger link on your home page', uk: 'я не знайшов на головній сторінці телефону, пошти чи месенджера' },
  heavy_images: { en: 'your home page loads many images and none of them is lazy-loaded, which slows it down', uk: 'головна сторінка завантажує багато зображень, і жодне не відкладене (lazy), що її уповільнює' },
  no_lead_form: { en: 'I did not find a contact or lead form on the pages I read', uk: 'на прочитаних сторінках я не знайшов форми для заявок' },
};

// Detects the tracking tags in the raw HTML of ONE page (pure). A pixel inside Tag Manager is invisible here, so a container hides the «no pixel» finding.
export function detectTags(html = '') {
  const s = String(html);
  return {
    meta_pixel: /fbq\s*\(|connect\.facebook\.net\/[^"']*fbevents\.js|facebook\.com\/tr\?/i.test(s),
    ga: /gtag\s*\(|googletagmanager\.com\/gtag\/js|google-analytics\.com\/(analytics|ga)\.js|G-[A-Z0-9]{6,}/.test(s),
    gtm: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/.test(s),
    // Shopify loads the pixel and the analytics through its own sandbox (web pixels): they are NOT visible in the HTML, so a site on Shopify never gets a «no pixel» claim
    shopify: /cdn\.shopify\.com|Shopify\.shop\b|myshopify\.com/i.test(s),
  };
}

// → [{ id, en, uk }] in the order of importance; only what the pages really show
export function siteFindings({ pages = [], tags = null } = {}) {
  const ok = pages.filter((p) => p?.ok && p.signals);
  if (!ok.length) return [];
  const home = ok.find((p) => p.kind === 'home') || ok[0];
  const s = home.signals;
  const any = (fn) => ok.some((p) => fn(p.signals));
  const out = [];
  const add = (id) => out.push({ id, en: FINDINGS[id].en, uk: FINDINGS[id].uk });
  if (!s.viewport) add('no_viewport');
  if (tags && !tags.meta_pixel && !tags.gtm && !tags.shopify) add('no_meta_pixel');
  if (tags && !tags.ga && !tags.gtm && !tags.shopify) add('no_analytics');
  const product = ok.find((p) => p.kind === 'product');
  if (product && !(product.signals.structured || []).some((t) => /^product$/i.test(t))) add('no_product_schema');
  if (ok.length >= 2 && !any((x) => (x.returns_words || []).length) ) add('no_returns_info');
  if (ok.length >= 2 && !any((x) => (x.review_words || []).length)) add('no_reviews');
  if (!s.phone_link && !s.email_link && !(s.messengers || []).length) add('no_contact_channel');
  if ((s.images || 0) > 12 && (s.lazy_images || 0) === 0) add('heavy_images');
  if (ok.length >= 2 && !any((x) => x.forms > 0)) add('no_lead_form');
  return out;
}
export const findingText = (f, lang = 'en') => (f ? f[lang === 'uk' ? 'uk' : 'en'] : '');
