// Reads everything the audit needs from a Meta ad account (read only). meta = { insights(opts), campaigns({ accountId }), pixels({ accountId }) }.
// A part that cannot be read does not stop the audit: it is listed in data.errors and the audit says what is missing.
import { windowOf } from './auditEngine.js';

const BREAKDOWNS = { age: ['age'], gender: ['gender'], placement: ['publisher_platform', 'platform_position'], device: ['device_platform'], region: ['region'] };

export async function collectAuditData(meta, account) {
  const accountId = account.account_id;
  const errors = [];
  const safe = async (label, fn, fallback) => { try { return await fn(); } catch (e) { errors.push(`${label}: ${String(e?.message || e).slice(0, 160)}`); return fallback; } };
  const rows = async (opts) => (await meta.insights({ accountId, ...opts })).rows;

  const monthly = await rows({ level: 'account', datePreset: 'maximum', increment: 'monthly' }); // without the history there is no audit: a failure here fails the run
  const campaigns = await safe('кампанії за весь час', () => rows({ level: 'campaign', datePreset: 'maximum' }), []);
  const campaignMeta = await safe('цілі кампаній', () => meta.campaigns({ accountId }), []);
  const window = windowOf(monthly);
  const data = { currency: account.currency || 'USD', monthly, campaigns, campaignMeta, window, windowCampaigns: [], windowAdsets: [], windowAds: [], dailyAds: [], dailyTruncated: false, breakdowns: {}, pixels: [], errors };
  if (window) {
    const timeRange = window;
    data.windowCampaigns = await safe('кампанії за 90 днів', () => rows({ level: 'campaign', timeRange }), []);
    data.windowAdsets = await safe('групи за 90 днів', () => rows({ level: 'adset', timeRange, maxPages: 15 }), []);
    data.windowAds = await safe('оголошення за 90 днів', () => rows({ level: 'ad', timeRange, maxPages: 15 }), []);
    const daily = await safe('оголошення по днях', () => meta.insights({ accountId, level: 'ad', timeRange, increment: 1, maxPages: 40, limit: 500 }), { rows: [], truncated: false });
    data.dailyAds = daily.rows; data.dailyTruncated = !!daily.truncated;
  }
  for (const [name, breakdowns] of Object.entries(BREAKDOWNS)) {
    const life = await safe(`розбивка «${name}»`, () => rows({ level: 'account', datePreset: 'maximum', breakdowns }), []);
    const recent = window ? await safe(`розбивка «${name}» за 90 днів`, () => rows({ level: 'account', timeRange: window, breakdowns }), []) : [];
    data.breakdowns[name] = { life, recent };
  }
  data.pixels = await safe('піксельні набори', () => meta.pixels({ accountId }), []);
  return data;
}
