// The Media buyer's skill «launch» (step A8; document, step 3 «Запуск»): the part around the writes. PURE: no network, no model, no clock.
//   checkLaunch  → the CHECK BEFORE THE LAUNCH of the document: tracking, UTM links, the offer matches the site, the product is in stock, the budgets follow the strategy.
//                  Anything wrong is a blocker: the launch does not start and the manager gets the reasons («запуск блокується і менеджер отримує причини»).
//   buildPlan    → what will be created in the cabinet: campaigns → ad sets → ads, with budgets in the smallest currency unit, links with UTM tags and button types
//   snapshotOf   → the «Знімок запуску»: what was launched, when, with which settings, creatives and target CPAs, so that the results can be compared later
// The code decides every number and name here; there is no model in this skill.
import { countriesOf, ctaType, landingUrl, minor, slug, utmTags } from '../../metaAdsWrite.js';

const num = (v) => { const x = Number(v); return v !== '' && v != null && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.round(x * 100) / 100;
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const numbersOf = (s) => (String(s || '').match(/\d[\d.,]*\d|\d/g) || []).map((n) => n.replace(/[.,]$/, ''));
const OUT_OF_STOCK = /немає в наявності|нема в наявності|закінчився|закінчилась|out of stock|sold out|нет в наличии/i;
const PIXEL_FRESH_DAYS = 7;
const DAY = 864e5;

// «немає в наявності» counts only NEAR the name of the product (a page may list several products, and only one of them is out of stock)
function mentionedOutOfStock(text, product) {
  const t = norm(text), n = norm(product);
  for (let i = t.indexOf(n); i >= 0; i = t.indexOf(n, i + n.length)) if (OUT_OF_STOCK.test(t.slice(Math.max(0, i - 20), i + n.length + 40))) return true;
  return false;
}
const task = (type, owner, title, evidence) => ({ type, owner, priority: 'high', title, evidence });

// → { blockers: [{ code, text, task }], warnings: [text] }
export function checkLaunch({ accountInfo, accountCurrency, pixels, brief, strategy, creatives, siteData, website, now }) {
  const blockers = [], warnings = [];
  const block = (code, text, t) => blockers.push({ code, text, task: t || null });
  const b = brief?.content || {}, econ = b.economics || {};
  const s = strategy || {}, items = creatives?.items || [];

  // the cabinet
  if (accountInfo) {
    if (accountInfo.status !== 1) block('account', `Рекламний кабінет не активний (статус ${accountInfo.status}${accountInfo.disable_reason != null ? `, причина ${accountInfo.disable_reason}` : ''}): у ньому не можна запускати кампанії.`, task('ads', 'manager', 'Відновити рекламний кабінет Meta', 'Кабінет не активний: запуск неможливий.'));
    const cur = String(econ.currency || '').toUpperCase(), acc = String(accountInfo.currency || accountCurrency || '').toUpperCase();
    if (cur && acc && cur !== acc) block('currency', `Валюта брифу ${cur}, а кабінету ${acc}: бюджети в різних валютах, запуск зупинено.`, task('ads', 'manager', 'Звірити валюту брифу й кабінету', `Бриф ${cur}, кабінет ${acc}.`));
  } else warnings.push('Стан кабінету не вдалося перевірити.');

  // tracking: the pixel must exist and have fired lately
  const fresh = (pixels || []).filter((p) => p.lastFired && now - new Date(p.lastFired) <= PIXEL_FRESH_DAYS * DAY);
  if (!(pixels || []).length) block('pixel', 'У кабінеті немає піксельного набору: без трекінгу не видно покупців, запуск зупинено.', task('tracking', 'client', 'Налаштувати піксель і події покупки', 'Піксельного набору в кабінеті немає.'));
  else if (!fresh.length) block('pixel', `Піксель не спрацьовував за останні ${PIXEL_FRESH_DAYS} днів (${pixels.map((p) => p.name).join(', ')}): події покупки не надходять, запуск зупинено.`, task('tracking', 'client', 'Перевірити піксель: він не спрацьовує', `Піксель не спрацьовував ${PIXEL_FRESH_DAYS}+ днів.`));

  // where the ads lead (and the UTM tags that are added to it)
  let site = null;
  try { site = website ? landingUrl(website, 'x=1') : null; } catch { site = null; }
  if (!website || !site) block('site', 'У картці проєкту немає коректного сайту: рекламі нікуди вести, запуск зупинено.', task('site', 'manager', 'Вказати сайт клієнта в картці проєкту', 'Без адреси сайту не можна зробити посилання з UTM-мітками.'));
  else if (siteData && !(siteData.pages || []).some((p) => p.ok)) block('site', `Сайт ${website} не відповідає (${siteData.errors?.[0] || siteData.pages?.[0]?.error || 'немає відповіді'}): реклама вела б у нікуди, запуск зупинено.`, task('site', 'client', 'Сайт не відкривається', `Адреса ${website}.`));

  // the page the ads are published from
  if (!String(b.general?.fb_page_id || '').replace(/\D/g, '')) block('page', 'У брифі не вказано ID сторінки Facebook, від імені якої йде реклама, запуск зупинено.', task('ads', 'manager', 'Вказати ID сторінки Facebook у брифі', 'Рядок «ID сторінки Facebook» у таблиці брифу.'));

  // where to show: the countries from the GEO of the brief
  const geo = countriesOf(s.geo || b.general?.geo);
  if (!geo.codes.length || geo.unknown.length) block('geo', `Не вдалося визначити країни показу з GEO «${s.geo || b.general?.geo || ''}»${geo.unknown.length ? ` (незрозуміло: ${geo.unknown.join(', ')})` : ''}. Напишіть країни словами або кодами (наприклад «США, Україна» чи «US, UA»).`, task('ads', 'manager', 'Уточнити GEO в брифі', 'Країни показу не визначено.'));

  // budgets follow the strategy and the brief
  const camps = s.campaigns || [];
  const dailyBrief = num(econ.budget_monthly) != null ? r2(num(econ.budget_monthly) / 30) : null;
  const minDaily = num(econ.min_campaign_daily) ?? 15;
  const sum = r2(camps.reduce((t, c) => t + (num(c.daily_budget) || 0), 0));
  if (!camps.length) block('budget', 'У стратегії немає кампаній: запускати нічого.', null);
  else {
    if (camps.some((c) => num(c.daily_budget) == null)) block('budget', 'У схемі є кампанія без денного бюджету.', null);
    const low = camps.filter((c) => num(c.daily_budget) != null && num(c.daily_budget) + 1e-9 < minDaily);
    if (low.length && !s.budget?.below_minimum && camps.length > 1) block('budget', `Бюджет кампанії нижчий за мінімум ${minDaily}: ${low.map((c) => c.name).join(', ')}.`, null);
    if (dailyBrief != null && sum > dailyBrief * 1.01 + 1e-9) block('budget', `Сума денних бюджетів кампаній (${sum}) більша за бюджет із брифу на день (${dailyBrief}): запуск зупинено, щоб не витратити більше погодженого.`, null);
    if (s.budget?.daily != null && Math.abs(sum - num(s.budget.daily)) > num(s.budget.daily) * 0.01 + 0.01) block('budget', `Сума денних бюджетів у схемі (${sum}) не збігається з бюджетом стратегії на день (${s.budget.daily}).`, null);
  }

  // creatives: every ad group needs ready pictures; nothing marked for a check or failed goes live
  const byId = Object.fromEntries(items.map((c) => [c.id, c]));
  const used = [];
  for (const c of camps) for (const g of c.ad_groups || []) {
    const ads = (g.creatives || []).map((x) => byId[x.id]).filter(Boolean);
    if (!ads.length) block('creatives', `У групі «${g.name}» (кампанія «${c.name}») немає креативів.`, task('creatives', 'manager', `Додати креативи в групу «${g.name}»`, `Кампанія «${c.name}».`));
    for (const a of ads) { used.push(a); if (a.status !== 'ready' || !/^https:\/\//i.test(a.image_url || '')) block('creatives', `Креатив «${a.tag}» не готовий до запуску (стан: ${a.status || '—'}${a.problems?.length ? `; ${a.problems.join('; ')}` : ''}).`, task('creatives', 'manager', `Довести креатив до готовності: ${a.goal || a.id}`, a.problems?.join('; ') || a.note || 'Картинки немає.')); }
  }

  // the offer in the ad must be on the site; the product must be in stock (what the reader of the site saw)
  const pages = (siteData?.pages || []).filter((p) => p.ok);
  const text = norm(pages.map((p) => p.text).join(' '));
  const nums = new Set(numbersOf(text));
  if (pages.length) {
    const offers = [...new Set(used.map((a) => a.offer).filter(Boolean))];
    for (const name of offers) {
      const o = (econ.offers || []).find((x) => norm(x.name) === norm(name));
      const onSite = (o?.pays != null && nums.has(String(Math.round(Number(o.pays))))) || norm(name).split(' ').filter((w) => w.length > 3).filter((w) => text.includes(w)).length >= 2;
      if (!onSite) block('offer', `Оффер «${name}» не знайдено на сайті: у рекламі й на сайті різні умови, запуск зупинено.`, task('site', 'client', `Додати оффер «${name}» на сайт`, 'Оффер у рекламі має збігатися з сайтом.'));
    }
    for (const product of [...new Set(used.map((a) => a.product).filter(Boolean))]) {
      const holders = pages.filter((p) => norm(p.text).includes(norm(product)));
      if (!holders.length) warnings.push(`Наявність товару «${product}» не вдалося перевірити: сторінку з ним не знайдено.`);
      else if (holders.some((p) => mentionedOutOfStock(p.text, product))) block('stock', `Схоже, товару «${product}» немає в наявності (сторінка ${holders[0].url}): реклама вела б на недоступний товар.`, task('site', 'client', `Перевірити наявність товару «${product}»`, `Сторінка ${holders[0].url}.`));
    }
  } else if (website) warnings.push('Сторінки сайту не прочитано: оффер і наявність товару не перевірено.');

  for (const a of used) if (!ctaType(a.cta).known) warnings.push(`Кнопка «${a.cta}» не має відповідного типу в Meta: буде «Дізнатись більше».`);
  return { blockers, warnings };
}

// → { campaigns: [{ key, name, daily, adsets: [{ key, name, dailyMinor, group, ads: [{ key, name, creative, link, cta }] }] }], countries, pixelId, pageId, utm }
export function buildPlan({ strategy, creatives, website, pageId, pixelId, now }) {
  const date = now.toISOString().slice(0, 10);
  const byId = Object.fromEntries((creatives?.items || []).map((c) => [c.id, c]));
  const geo = countriesOf(strategy.geo);
  const campaigns = (strategy.campaigns || []).map((c, ci) => {
    const groups = c.ad_groups || [];
    const each = r2(Number(c.daily_budget) / Math.max(1, groups.length));
    const adsets = groups.map((g, gi) => ({
      key: `${slug(c.name)}/${slug(g.name)}`, name: `${g.name} · ${date}`, group: g.name, segment: g.segment || '',
      dailyMinor: minor(gi === 0 ? r2(Number(c.daily_budget) - each * (groups.length - 1)) : each),
      ads: (g.creatives || []).map((x) => byId[x.id]).filter(Boolean).map((a) => {
        const tags = utmTags({ campaign: c.name, content: `${a.id}-v${a.version || 1}` });
        return { key: `${a.id}-v${a.version || 1}`, name: a.tag, creative: a, link: landingUrl(website, tags), urlTags: tags, cta: ctaType(a.cta).type };
      }),
    }));
    return { key: slug(c.name), name: `${c.name} · ${date}`, daily: Number(c.daily_budget), adsets };
  });
  return { campaigns, countries: geo.codes, pixelId, pageId: String(pageId).replace(/\D/g, ''), date };
}

// the snapshot of the launch (document glossary: «Запис про те, що саме запущено і з якими налаштуваннями, щоб потім порівнювати результат»)
export function snapshotOf({ plan, created, account, thresholds, strategy, status, now, warnings = [] }) {
  return {
    schema: 1, status, launched_at: now.toISOString(), account: { id: account.account_id, name: account.account_name || null, currency: account.currency || null },
    settings: { objective: 'OUTCOME_SALES', optimization: 'OFFSITE_CONVERSIONS (покупка)', bid: 'найнижча ціна без ліміту', targeting: `країни: ${plan.countries.join(', ')}; вік від 18; Advantage+ аудиторія (інтереси й сегменти не задаються автоматично)`, pixel_id: plan.pixelId, page_id: plan.pageId, utm: 'utm_source=facebook · utm_medium=paid · utm_campaign=<кампанія> · utm_content=<креатив і версія>' },
    targets: { breakeven_cpa: thresholds?.breakeven_cpa ?? null, target_cpa: thresholds?.target_cpa ?? null, breakeven_roas: thresholds?.breakeven_roas ?? null, target_roas: thresholds?.target_roas ?? null },
    strategy_version: strategy?.version ?? null, budget_monthly: strategy?.budget_monthly ?? null,
    campaigns: plan.campaigns.map((c) => ({ key: c.key, name: c.name, daily: c.daily, id: created.campaigns[c.key] || null, adsets: c.adsets.map((a) => ({ key: a.key, name: a.name, daily: r2(a.dailyMinor / 100), id: created.adsets[a.key] || null, ads: a.ads.map((x) => ({ key: x.key, tag: x.name, link: x.link, cta: x.cta, creative_id: created.creatives[x.key] || null, ad_id: created.ads[x.key] || null })) })) })),
    warnings,
  };
}

export function renderLaunchText(s) {
  const out = [`Знімок запуску. ${s.status === 'done' ? 'Запущено' : 'Запуск не завершено'}: ${s.launched_at.slice(0, 16).replace('T', ' ')}. Кабінет: ${s.account.name || s.account.id} (${s.account.currency || '—'}).`];
  out.push('', 'Налаштування', ...Object.entries({ Ціль: s.settings.objective, Оптимізація: s.settings.optimization, Ставка: s.settings.bid, Таргетинг: s.settings.targeting, Піксель: s.settings.pixel_id, Сторінка: s.settings.page_id, 'UTM-мітки': s.settings.utm }).map(([k, v]) => `• ${k}: ${v}`));
  out.push('', 'Цільові показники (з Unit Economy)', `• беззбитковий CPA ${s.targets.breakeven_cpa ?? '—'}, цільовий CPA ${s.targets.target_cpa ?? '—'}; беззбитковий ROAS ${s.targets.breakeven_roas ?? '—'}, цільовий ${s.targets.target_roas ?? '—'}`);
  out.push('', `Що запущено (стратегія версії ${s.strategy_version ?? '—'}, бюджет ${s.budget_monthly ?? '—'} на місяць)`);
  s.campaigns.forEach((c, i) => {
    out.push(`${i + 1}. ${c.name}: ${c.daily} на день, id ${c.id || 'не створено'}`);
    c.adsets.forEach((a) => { out.push(`   Група «${a.name}»: ${a.daily} на день, id ${a.id || 'не створено'}`); a.ads.forEach((x) => out.push(`   · ${x.tag} · кнопка ${x.cta} · id оголошення ${x.ad_id || 'не створено'}`, `     ${x.link}`)); });
  });
  if (s.warnings.length) { out.push('', 'Попередження'); s.warnings.forEach((w) => out.push(`• ${w}`)); }
  return out.join('\n');
}
