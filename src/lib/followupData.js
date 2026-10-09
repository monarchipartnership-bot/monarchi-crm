// Real browsers cannot call api.anthropic.com directly (no CORS, requires a
// secret key) — this hits our own Vercel serverless function instead
// (api/anthropic.js), which attaches the real key server-side and forwards
// the request. Requires ANTHROPIC_API_KEY set in the Vercel project's
// environment variables.
export const API_ENDPOINT = '/api/anthropic';

// The agents' call to the proxy: signed in (the proxy refuses anonymous requests) and named, so the
// usage log can show which agent spent what. `agentKey` is a short stable name of the calling agent.
export async function anthropicFetch(agentKey, init = {}) {
  const { supabase } = await import('./supabaseClient');
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token || '';
  return fetch(API_ENDPOINT, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer ' + token, 'X-Agent-Key': agentKey } });
}
