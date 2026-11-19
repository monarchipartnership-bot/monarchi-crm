// A read-only GA4 Data API client for the workflow agents: runReport(propertyId, body). The sign-in is the one the environment offers
// (service account or the agency's own Google user, see googleSiteData.js authFromEnv); the token is made once and reused. Nothing is written to Google.
import { accessToken, authFromEnv } from './googleSiteData.js';

const URL_BASE = 'https://analyticsdata.googleapis.com/v1beta/properties/';

export const cleanPropertyId = (v) => String(v ?? '').replace(/^properties\//i, '').replace(/\D/g, '');

export function createGa4Reader({ env = process.env, fetchFn = fetch, now = () => new Date() } = {}) {
  let token = null;
  return {
    async runReport({ propertyId, body }) {
      const id = cleanPropertyId(propertyId);
      if (!id) throw new Error('Не вказано GA4 Property ID.');
      if (!token) token = await accessToken({ auth: authFromEnv(env), fetchFn, now }); // throws a readable error when the environment has no Google access
      const res = await fetchFn(`${URL_BASE}${id}:runReport`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = String(json.error?.message || res.status).slice(0, 240);
        throw new Error(`GA4: ${msg}.${res.status === 403 ? ' Немає доступу до цього ресурсу: клієнт має додати пошту нашого Google-акаунта читачем у GA4.' : ''}`);
      }
      return json;
    },
  };
}
