// How the server (the project AI agent) calls our own platform endpoints: the same handlers the
// browser reaches over HTTP, run in-process with the agent's own signed-in session token. Nothing
// about their checks changes — they still require a valid Supabase session — so the agent is a real
// signed-in user like everyone else, never a back door.
// The folder name starts with an underscore, so Vercel does not publish this file as an endpoint.
import metaAdsInsights from '../meta-ads-insights.js';
import googleAdsAccounts from '../google-ads-accounts.js';
import reportWorkSummary from '../report-work-summary.js';

const HANDLERS = {
  '/api/meta-ads-insights': metaAdsInsights,
  '/api/google-ads-accounts': googleAdsAccounts,
  '/api/report-work-summary': reportWorkSummary,
};

// Returns post(path, body) with the same contract as the browser's authedPost: resolves with the JSON,
// throws an Error with the endpoint's own message when it answers with an error.
export function makeInternalPost(accessToken, handlers = HANDLERS) {
  return async function post(path, body) {
    const handler = handlers[path];
    if (!handler) throw new Error('Невідомий ендпойнт: ' + path);
    let status = 200;
    let payload = {};
    const res = {
      status(code) { status = code; return res; },
      setHeader() { return res; },
      json(value) { payload = value; return res; },
      send(value) { try { payload = typeof value === 'string' ? JSON.parse(value) : value; } catch { payload = { raw: value }; } return res; },
      end() { return res; },
    };
    await handler({ method: 'POST', headers: { authorization: 'Bearer ' + accessToken }, body }, res);
    if (status >= 400) throw new Error(payload?.error || `Помилка сервера (${status})`);
    if (payload?.configError) throw new Error('Не налаштовано на сервері: ' + (payload.missing || []).join(', '));
    return payload;
  };
}
