// The WRITE side of the Meta Marketing API for the Media buyer (step A8; document: «Медіабаєр · єдиний агент із правом запису в кабінет»). Everything else in the system only reads.
// Used by exactly one skill (api/_lib/wf/skills/launchAgent.js) and only after Апрув 2. The token is the one of the environment (META_ACCESS_TOKEN) and must have the
// permission ads_management on the ad account (the reading code needs only ads_read): when it does not, Meta answers with an error and the run fails with its text.
// fetch is handed in, so scripts/check-workflow.mjs runs all of it against a stand-in network. The shapes follow the public documentation of the Marketing API
// (campaigns, adsets, adimages, adcreatives, ads); they were NOT yet run against the real API: the first real run is made on the test cabinet at the first deploy.
import { GRAPH } from './metaAdsData.js';

export const actId = (id) => 'act_' + String(id).replace(/\D/g, '');
const clean = (s, token) => String(s || '').split(token || '\u0000').join('***').slice(0, 400);
const MAX_IMAGE = 8 * 1024 * 1024;

// the button wording of the client → the call-to-action type of Meta; unknown wordings become «Дізнатись більше» (the caller is told)
const CTA = [[/куп/i, 'SHOP_NOW'], [/замов/i, 'ORDER_NOW'], [/дізнат|дізна|детальн|learn|more/i, 'LEARN_MORE'], [/зареєстр|sign/i, 'SIGN_UP'], [/подзвон|call/i, 'CALL_NOW'], [/shop/i, 'SHOP_NOW'], [/order/i, 'ORDER_NOW'], [/book|забронюв/i, 'BOOK_TRAVEL']];
export function ctaType(text) {
  const t = String(text || '').trim();
  if (!t) return { type: 'NO_BUTTON', known: true };
  const hit = CTA.find(([re]) => re.test(t));
  return hit ? { type: hit[1], known: true } : { type: 'LEARN_MORE', known: false };
}

// «США, Україна» or «US, UA» → ISO codes; the words the dictionary does not know are returned apart (the launch is blocked and says which)
const COUNTRIES = { США: 'US', USA: 'US', 'UNITED STATES': 'US', УКРАЇНА: 'UA', УКРАИНА: 'UA', UKRAINE: 'UA', ПОЛЬЩА: 'PL', POLAND: 'PL', НІМЕЧЧИНА: 'DE', GERMANY: 'DE', ВЕЛИКОБРИТАНІЯ: 'GB', 'ВЕЛИКА БРИТАНІЯ': 'GB', UK: 'GB', 'UNITED KINGDOM': 'GB', КАНАДА: 'CA', CANADA: 'CA', ФРАНЦІЯ: 'FR', FRANCE: 'FR', ІТАЛІЯ: 'IT', ITALY: 'IT', ІСПАНІЯ: 'ES', SPAIN: 'ES', ЧЕХІЯ: 'CZ', ЛИТВА: 'LT', ЛАТВІЯ: 'LV', ЕСТОНІЯ: 'EE', РУМУНІЯ: 'RO', НІДЕРЛАНДИ: 'NL', АВСТРІЯ: 'AT', ШВЕЙЦАРІЯ: 'CH', ОАЕ: 'AE', ТУРЕЧЧИНА: 'TR', ІЗРАЇЛЬ: 'IL', АВСТРАЛІЯ: 'AU', AUSTRALIA: 'AU' };
export function countriesOf(text) {
  const codes = new Set(), unknown = [];
  for (const part of String(text || '').split(/[,;/\n]+| та | і | and /i).map((x) => x.trim()).filter(Boolean)) {
    const up = part.toUpperCase();
    if (/^[A-Z]{2}$/.test(up) && up !== 'UK') codes.add(up);
    else if (COUNTRIES[up]) codes.add(COUNTRIES[up]);
    else unknown.push(part);
  }
  return { codes: [...codes], unknown };
}

// the countries of the European Union: an ad shown there needs the name of the advertiser and of the payer (the DSA rule of Meta; found by the pilot: Poland in the GEO)
const EU = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE']);
export const hasEu = (codes = []) => codes.some((c) => EU.has(String(c).toUpperCase()));

// money: Meta takes the budget in the smallest unit of the account currency (cents); the currencies with two decimals are assumed
export const minor = (amount) => Math.round(Number(amount) * 100);

// the tags that make the customers of an ad visible in the analytics of the site (document: «посилання з UTM-мітками»)
export const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';
export const utmTags = ({ campaign, content }) => `utm_source=facebook&utm_medium=paid&utm_campaign=${encodeURIComponent(slug(campaign))}&utm_content=${encodeURIComponent(slug(content))}`;
export const landingUrl = (website, tags) => { const u = new URL(/^https?:\/\//i.test(website) ? website : 'https://' + website); for (const [k, v] of new URLSearchParams(tags)) u.searchParams.set(k, v); return u.toString(); };

export function createMetaWriter({ token, fetchFn = fetch, graph = GRAPH } = {}) {
  if (!token) throw new Error('Немає META_ACCESS_TOKEN: запис у кабінет неможливий.');
  async function call(method, path, params = {}) {
    const url = new URL(graph + path.replace(/^\//, ''));
    let res;
    if (method === 'GET') {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      url.searchParams.set('access_token', token);
      res = await fetchFn(url.toString());
    } else {
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v != null) body.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      body.set('access_token', token);
      res = await fetchFn(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      const e = json.error || {};
      const msg = clean(e.error_user_msg || e.message || `HTTP ${res.status}`, token);
      const err = new Error(`Meta: ${msg}${e.code ? ` (#${e.code}${e.error_subcode ? '/' + e.error_subcode : ''})` : ''}${e.code === 200 || e.code === 10 || e.code === 3 ? '. Токен має право лише читати: потрібне право ads_management на цей кабінет.' : ''}`);
      err.metaCode = e.code || res.status;
      throw err;
    }
    return json;
  }
  return {
    // the cabinet itself: is it active, in which currency (status 1 = active)
    async accountInfo({ accountId }) {
      const j = await call('GET', actId(accountId), { fields: 'name,account_status,currency,disable_reason,timezone_name' });
      return { name: j.name, status: Number(j.account_status), currency: j.currency, disable_reason: j.disable_reason ?? null, timezone: j.timezone_name || null };
    },
    // WHY a write is refused: which permissions the token has (found by the pilot: the token read the cabinet but could not create a campaign in it)
    async diagnose() {
      const out = { permissions: [], hasManagement: false, who: null, error: null };
      try {
        const p = await call('GET', 'me/permissions');
        out.permissions = (p.data || []).filter((x) => x.status === 'granted').map((x) => x.permission);
        out.hasManagement = out.permissions.includes('ads_management');
      } catch (e) { out.error = String(e.message || e).slice(0, 200); }
      try { const m = await call('GET', 'me', { fields: 'id,name' }); out.who = m.name ? `${m.name} (${m.id})` : m.id || null; } catch { /* the name is only a hint */ }
      try { const a = await call('GET', 'me/accounts', { fields: 'id,name,tasks', limit: 50 }); out.pages = (a.data || []).map((p) => ({ id: String(p.id), name: p.name || '', tasks: p.tasks || [] })); } catch (e) { out.pagesError = String(e.message || e).slice(0, 160); }
      return out;
    },
    // the pages this cabinet may advertise for (found by the pilot: Meta refused the page of the brief); read only
    async promotePages({ accountId }) {
      const j = await call('GET', `${actId(accountId)}/promote_pages`, { fields: 'id,name', limit: 100 });
      return (j.data || []).map((p) => ({ id: String(p.id), name: p.name || '' }));
    },
    // «would a campaign be accepted?» Meta's validate_only runs the permission and field checks and CREATES NOTHING
    async validateWrite({ accountId }) {
      return call('POST', `${actId(accountId)}/campaigns`, { name: 'validate', objective: 'OUTCOME_SALES', status: 'PAUSED', special_ad_categories: [], buying_type: 'AUCTION', is_adset_budget_sharing_enabled: false, execution_options: ['validate_only'] });
    },
    async createCampaign({ accountId, name, objective = 'OUTCOME_SALES', status = 'ACTIVE' }) {
      const j = await call('POST', `${actId(accountId)}/campaigns`, { name, objective, status, special_ad_categories: [], buying_type: 'AUCTION', is_adset_budget_sharing_enabled: false });
      return j.id;
    },
    async createAdSet({ accountId, campaignId, name, dailyMinor, pixelId, countries, status = 'ACTIVE', optimizationGoal = 'OFFSITE_CONVERSIONS', customEvent = 'PURCHASE', dsaName = null }) {
      const j = await call('POST', `${actId(accountId)}/adsets`, {
        name, campaign_id: campaignId, daily_budget: dailyMinor, billing_event: 'IMPRESSIONS', optimization_goal: optimizationGoal, bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        promoted_object: { pixel_id: pixelId, custom_event_type: customEvent },
        targeting: { geo_locations: { countries }, age_min: 18, targeting_automation: { advantage_audience: 1 } }, status,
        ...(dsaName && hasEu(countries) ? { dsa_beneficiary: dsaName, dsa_payor: dsaName } : {}),
      });
      return j.id;
    },
    // the picture is downloaded from our storage and sent as bytes (the API takes a file, not an address); → the hash of the image
    async uploadImage({ accountId, url }) {
      if (!/^https:\/\//i.test(url || '')) throw new Error('Картинка креатива має бути за адресою https.');
      const r = await fetchFn(url);
      if (!r.ok) throw new Error(`Не вдалося завантажити картинку креатива (HTTP ${r.status}).`);
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_IMAGE) throw new Error('Картинка креатива порожня або більша за 8 МБ.');
      const j = await call('POST', `${actId(accountId)}/adimages`, { bytes: Buffer.from(bytes).toString('base64') });
      const first = Object.values(j.images || {})[0];
      if (!first?.hash) throw new Error('Meta не повернула hash картинки.');
      return first.hash;
    },
    // the video is taken by Meta from our public address (file_url, no bytes through us) and processed ASYNCHRONOUSLY: → the id of the video; videoReady says when it can be used
    async uploadVideo({ accountId, url, title }) {
      if (!/^https:\/\//i.test(url || '')) throw new Error('Відео креатива має бути за адресою https.');
      const j = await call('POST', `${actId(accountId)}/advideos`, { file_url: url, name: String(title || 'video').slice(0, 100) });
      if (!j.id) throw new Error('Meta не повернула id відео.');
      return String(j.id);
    },
    async videoReady({ videoId }) {
      const j = await call('GET', String(videoId), { fields: 'status' });
      const s = j.status?.video_status;
      return { state: s === 'ready' ? 'ready' : s === 'error' ? 'failed' : 'pending', error: s === 'error' ? clean(JSON.stringify(j.status?.processing_progress ?? j.status), token) : null };
    },
    // an ad with a picture (link_data) or, when videoId is given, a video ad (video_data; the picture of the creative is its cover, Meta needs one)
    async createAdCreative({ accountId, name, pageId, link, message, headline, imageHash, cta, urlTags, videoId = null }) {
      let spec;
      if (videoId) {
        const video_data = { video_id: videoId, image_hash: imageHash, message, title: headline, call_to_action: { type: cta && cta !== 'NO_BUTTON' ? cta : 'LEARN_MORE', value: { link } } }; // a video ad needs a destination: no button means «Дізнатись більше»
        spec = { page_id: pageId, video_data };
      } else {
        const link_data = { link, message, name: headline, image_hash: imageHash };
        if (cta && cta !== 'NO_BUTTON') link_data.call_to_action = { type: cta, value: { link } };
        spec = { page_id: pageId, link_data };
      }
      const j = await call('POST', `${actId(accountId)}/adcreatives`, { name, object_story_spec: spec, url_tags: urlTags });
      return j.id;
    },
    async createAd({ accountId, adsetId, name, creativeId, status = 'ACTIVE' }) {
      const j = await call('POST', `${actId(accountId)}/ads`, { name, adset_id: adsetId, creative: { creative_id: creativeId }, status });
      return j.id;
    },
  };
}
