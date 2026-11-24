// The Media buyer's skill «launch» (step A8; document, step 3). The ONLY place where an agent changes an ad cabinet, and only after Апрув 2 (the stage 3 of the orchestrator).
// 1 · the check before the launch (launchEngine.checkLaunch): any problem blocks the launch, the manager gets the reasons and tasks, the check repeats every half hour
// 2 · the plan (campaigns → ad sets → ads) is built by code from the approved strategy and creatives
// 3 · the objects are created in the cabinet, ACTIVE at once (owner's decision of 2026-11-23); progress is saved after every campaign and on an error, so a repeat of the run
//     continues where it stopped and never creates a campaign twice
// 4 · the «Знімок запуску» is written (status «done»), and the journal gets the entry
// ctx.metaWrite is the writer (api/_lib/metaAdsWrite.js), ctx.meta the reader. Without the writer the run FAILS with a clear reason: nothing is changed anywhere.
import { otherPlatformsNote } from './platforms.js';
import { collectSiteData } from './siteData.js';
import { buildPlan, checkLaunch, renderLaunchText, snapshotOf } from './launchEngine.js';

const DAY = 864e5;
const empty = () => ({ campaigns: {}, adsets: {}, creatives: {}, ads: {} });
function restore(prev) {
  const c = empty();
  for (const camp of prev?.campaigns || []) {
    if (camp.id) c.campaigns[camp.key] = camp.id;
    for (const a of camp.adsets || []) { if (a.id) c.adsets[a.key] = a.id; for (const x of a.ads || []) { if (x.creative_id) c.creatives[x.key] = x.creative_id; if (x.ad_id) c.ads[x.key] = x.ad_id; } }
  }
  return c;
}

export async function launch({ run, ctx }) {
  const allAccounts = await ctx.repo.listAdAccounts(run.project_id);
  const accounts = allAccounts.filter((a) => a.platform === 'meta');
  if (!accounts.length) return { blocked: { on: 'accounts:meta', reason: 'До проєкту не підключено рекламний кабінет Meta: запускати нікуди.' + otherPlatformsNote(allAccounts) }, tasks: [{ type: 'ads', owner: 'manager', priority: 'high', title: 'Підключити рекламний кабінет Meta до проєкту', evidence: 'Без кабінету запуск неможливий.' + otherPlatformsNote(allAccounts) }], steps: [{ title: 'Кабінет Meta не підключено', status: 'info' }] };
  const account = accounts[0];
  const prevSec = (await ctx.repo.readSection(run.project_id, 'launch'))?.version?.content || null;
  if (prevSec?.status === 'done') return { output: { already_launched: true }, steps: [{ title: 'Запуск уже виконано раніше: нічого не створюється', status: 'info' }] };
  if (!ctx.metaWrite) throw new Error('Немає права запису в кабінет: у Vercel не задано META_ACCESS_TOKEN з правом ads_management. Нічого не змінено.');

  const get = async (k) => (await ctx.repo.readSection(run.project_id, k))?.version || null;
  const [brief, strategySec, creativesSec, ue] = await Promise.all(['brief', 'strategy', 'creatives', 'unit_economy'].map(get));
  if (!strategySec?.content?.campaigns?.length) throw new Error('Немає стратегії зі схемою кампаній: запускати нічого.');
  const now = (ctx.now || (() => new Date()))();
  const project = await ctx.repo.readProject(run.project_id);
  const website = String(project?.website || '').trim();

  // 1 · the check before the launch
  const accountId = account.account_id;
  let accountInfo = null; try { accountInfo = await ctx.metaWrite.accountInfo({ accountId }); } catch (e) { accountInfo = null; }
  let pixels = null; try { pixels = ctx.meta?.pixels ? await ctx.meta.pixels({ accountId }) : null; } catch { pixels = null; }
  let siteData = null;
  if (website) { try { siteData = await collectSiteData({ website, fetchFn: ctx.fetchFn, lookup: ctx.lookup }); } catch (e) { siteData = { pages: [], errors: [String(e?.message || e)] }; } }
  const { blockers, warnings } = checkLaunch({ accountInfo, accountCurrency: account.currency, pixels, brief, strategy: strategySec.content, creatives: creativesSec?.content, siteData, website, now });
  if (pixels === null) warnings.push('Піксель не вдалося перевірити: читання кабінету недоступне.');
  if (blockers.length) {
    return {
      blocked: { on: 'launch_fix', reason: `Запуск зупинено перевіркою: ${blockers.map((b) => b.text).join(' ')}` },
      tasks: blockers.map((b) => b.task).filter(Boolean),
      steps: [{ title: `Перевірка перед запуском: проблем ${blockers.length}`, status: 'info', detail: { problems: blockers.map((b) => b.code) } }],
      output: { blocked: true, problems: blockers.map((b) => b.code) },
    };
  }

  // 2 · the plan
  const pixelId = (pixels || []).filter((p) => p.lastFired && now - new Date(p.lastFired) <= 7 * DAY).sort((a, b) => new Date(b.lastFired) - new Date(a.lastFired))[0]?.id;
  const plan = buildPlan({ strategy: strategySec.content, creatives: creativesSec?.content, website, pageId: brief.content.general.fb_page_id, pixelId, now });
  const thresholds = ue?.content?.thresholds || null;
  const status = ctx.launchStatus || 'ACTIVE';
  const created = prevSec?.status === 'partial' ? restore(prevSec) : empty();
  const save = async (st) => ctx.repo.writeSectionVersion(run.project_id, 'launch', { author_kind: 'agent', author: 'mediabuyer', run_id: run.id, sources: [], body: renderLaunchText(snapshotOf({ plan, created, account, thresholds, strategy: strategySec.content, status: st, now, warnings })), content: snapshotOf({ plan, created, account, thresholds, strategy: strategySec.content, status: st, now, warnings }) });

  // 3 · the objects are created in the cabinet
  const w = ctx.metaWrite;
  const hashes = {};
  let steps = 0;
  try {
    for (const c of plan.campaigns) {
      if (!created.campaigns[c.key]) { created.campaigns[c.key] = await w.createCampaign({ accountId, name: c.name, status }); steps += 1; await save('partial'); } // the id is saved at once: a repeat never makes this campaign again
      for (const a of c.adsets) {
        if (!created.adsets[a.key]) { created.adsets[a.key] = await w.createAdSet({ accountId, campaignId: created.campaigns[c.key], name: a.name, dailyMinor: a.dailyMinor, pixelId: plan.pixelId, countries: plan.countries, status }); steps += 1; await save('partial'); }
        for (const x of a.ads) {
          if (!created.creatives[x.key]) {
            const url = x.creative.image_url;
            hashes[url] ||= await w.uploadImage({ accountId, url });
            created.creatives[x.key] = await w.createAdCreative({ accountId, name: x.name, pageId: plan.pageId, link: x.link, message: x.creative.primary_text, headline: x.creative.headline, imageHash: hashes[url], cta: x.cta, urlTags: x.urlTags });
            steps += 1;
          }
          if (!created.ads[x.key]) { created.ads[x.key] = await w.createAd({ accountId, adsetId: created.adsets[a.key], name: x.name, creativeId: created.creatives[x.key], status }); steps += 1; }
        }
      }
      await save('partial');
    }
  } catch (e) {
    await save('partial').catch(() => {}); // what is already made is remembered: the repeat of the run goes on from here
    // a refused write: say WHY in words of the manager (does the token have ads_management; if it has, the cabinet is not assigned to its user with the right to manage campaigns)
    if ([100, 200, 10, 3].includes(e?.metaCode) && typeof ctx.metaWrite?.diagnose === 'function') {
      try {
        const d = await ctx.metaWrite.diagnose();
        e.message += d.error ? ` Діагностика токена не вдалася: ${d.error}`
          : d.hasManagement ? ` Діагностика: токен${d.who ? ' ' + d.who : ''} має право ads_management, отже користувачу токена не призначено цей кабінет із правом керувати кампаніями (Business Settings → Користувачі системи → Додати активи → Рекламні акаунти → «Керування кампаніями»).`
          : ` Діагностика: токен${d.who ? ' ' + d.who : ''} має лише права: ${d.permissions.join(', ') || 'немає'}. Потрібне право ads_management: створіть токен користувача системи з цим правом (і призначте цьому користувачу кабінет із правом «Керування кампаніями») та задайте його у Vercel як META_WRITE_TOKEN; токен для читання лишається META_ACCESS_TOKEN.`;
      } catch { /* the original error stays */ }
    }
    throw e;
  }

  // 4 · the snapshot of the launch and the journal
  const snap = snapshotOf({ plan, created, account, thresholds, strategy: strategySec.content, status: 'done', now, warnings });
  const adsCount = plan.campaigns.reduce((t, c) => t + c.adsets.reduce((s, a) => s + a.ads.length, 0), 0);
  await ctx.repo.journal(run.project_id, { actor_kind: 'agent', actor: 'mediabuyer', action: 'launch', subject: 'launch', summary: `Запущено в кабінеті ${account.account_name || accountId}: кампаній ${plan.campaigns.length}, оголошень ${adsCount}, ${plan.campaigns.reduce((t, c) => t + c.daily, 0)} на день (${status}).`, meta: { account_id: accountId, status } });
  return {
    writes: [{ key: 'launch', body: renderLaunchText(snap), content: snap, sources: [{ title: 'Стратегія' }, { title: 'Креативи (готові)' }, { title: 'Unit Economy' }] }],
    steps: [{ title: 'Перевірка перед запуском пройдена' }, { title: `Створено в кабінеті: кампаній ${plan.campaigns.length}, оголошень ${adsCount} (${status})` }, { title: 'Записано знімок запуску' }],
    output: { campaigns: plan.campaigns.length, ads: adsCount, created_now: steps },
  };
}
