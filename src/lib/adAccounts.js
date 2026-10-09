
// Ad platforms a project can be created from. `key` is what project_ad_accounts.platform
// and the project reports already use ('meta' / 'google').
export const AD_PLATFORMS = [
  { key: 'meta', label: 'Meta Ads', service: 'Meta Ads', mark: 'M', gradient: 'linear-gradient(135deg, #6C8CFF, #2F55E8)' },
  { key: 'google', label: 'Google Ads', service: 'Google Ads', mark: 'G', gradient: 'linear-gradient(135deg, #FBBC05, #EA4335)' },
];

export function platformInfo(key) {
  return AD_PLATFORMS.find((p) => p.key === key) || { key, label: key, service: null, mark: '?', gradient: 'linear-gradient(135deg, #9CA3AF, #6B7280)' };
}

// One status vocabulary for every platform (also the DB column's values).
export const ACCOUNT_STATUS = {
  active: { label: 'Активний', tone: 'ok' },
  grace: { label: 'Пільговий період', tone: 'warn' },
  unsettled: { label: 'Борг по оплаті', tone: 'bad' },
  review: { label: 'На перевірці', tone: 'warn' },
  disabled: { label: 'Відключений', tone: 'bad' },
  closed: { label: 'Закритий', tone: 'muted' },
  unknown: { label: 'Статус невідомий', tone: 'muted' },
};

const META_STATUS = { 1: 'active', 2: 'disabled', 3: 'unsettled', 7: 'review', 8: 'unsettled', 9: 'grace', 100: 'closed', 101: 'closed', 201: 'active', 202: 'closed' };

export function statusInfo(status) {
  return ACCOUNT_STATUS[status] || ACCOUNT_STATUS.unknown;
}

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

// How the ID is shown to people (and how each platform's own UI writes it).
export function formatAccountId(platform, id) {
  const d = digitsOnly(id);
  if (platform === 'google' && d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (platform === 'meta') return 'act_' + d;
  return d;
}

export function formatMoney(value, currency) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  try {
    return new Intl.NumberFormat('uk-UA', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(Number(value));
  } catch {
    return Number(value).toLocaleString('uk-UA', { maximumFractionDigits: 2 });
  }
}

// POST to one of our serverless endpoints with the signed-in session. These
// only exist on the deployed site (the Vite dev server doesn't serve /api).
export async function authedPost(path, body) {
  // Loaded here, not at the top, so this file can also be imported on the server (the browser client reads import.meta.env).
  const { supabase } = await import('./supabaseClient.js');
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  let res;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (token || '') }, body: JSON.stringify(body) });
  } catch {
    throw new Error('Немає звʼязку із сервером.');
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 404) throw new Error('Ця функція доступна лише на робочому сайті, не в локальному режимі.');
  if (!res.ok) throw new Error(json.error || `Помилка сервера (${res.status})`);
  if (json.configError) throw new Error('Не налаштовано на сервері: ' + (json.missing || []).join(', '));
  return json;
}

function fromMeta(a) {
  return {
    platform: 'meta',
    id: digitsOnly(a.id),
    name: a.name || null,
    currency: a.currency || null,
    timezone: a.timezone || null,
    status: META_STATUS[a.status] || 'unknown',
  };
}

function fromGoogle(a) {
  return { platform: 'google', id: digitsOnly(a.id), name: a.name || null, currency: a.currency || null, timezone: a.timezone || null, status: a.status || 'unknown' };
}

// Every account the platform integration can see, as plain objects.
export async function listAdAccounts(platform) {
  if (platform === 'meta') {
    const json = await authedPost('/api/meta-ads-insights', { list: true });
    return (json.accounts || []).map(fromMeta);
  }
  if (platform === 'google') {
    const json = await authedPost('/api/google-ads-accounts', { action: 'list' });
    return (json.accounts || []).map(fromGoogle);
  }
  return [];
}

// One account by the ID a person typed in; throws a readable error if the
// integration can't see it (wrong ID, or no access granted yet).
export async function lookupAdAccount(platform, rawId) {
  const id = digitsOnly(rawId);
  if (!id) throw new Error('Введіть ID кабінету.');
  if (platform === 'meta') {
    const json = await authedPost('/api/meta-ads-insights', { accountId: id, check: true });
    return fromMeta(json.account);
  }
  if (platform === 'google') {
    if (id.length !== 10) throw new Error('ID Google Ads — 10 цифр (напр. 123-456-7890).');
    const json = await authedPost('/api/google-ads-accounts', { action: 'info', customerId: id });
    return fromGoogle(json.account);
  }
  throw new Error('Невідома платформа.');
}

// Account-level numbers for a period ('last_7d' | 'last_30d'), same shape for both platforms.
export async function fetchAccountInsights(platform, id, datePreset = 'last_7d') {
  if (platform === 'meta') {
    const json = await authedPost('/api/meta-ads-insights', { accountId: id, level: 'account', datePreset });
    const r = json.rows?.[0];
    if (!r) return null;
    return { spend: r.spend, impressions: r.impressions, clicks: r.clicks, ctr_pct: r.ctr_pct, cpc: r.cpc, results: r.purchases, resultsLabel: 'Покупки', revenue: r.revenue, roas: r.roas };
  }
  if (platform === 'google') {
    const json = await authedPost('/api/google-ads-accounts', { action: 'insights', customerId: id, datePreset });
    const r = json.row;
    if (!r) return null;
    return { spend: r.spend, impressions: r.impressions, clicks: r.clicks, ctr_pct: r.ctr_pct, cpc: r.cpc, results: r.conversions, resultsLabel: 'Конверсії', revenue: r.revenue, roas: r.roas };
  }
  return null;
}
