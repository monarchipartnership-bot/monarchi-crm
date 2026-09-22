// Real browsers cannot call api.anthropic.com directly (no CORS, requires a
// secret key) — this hits our own Vercel serverless function instead
// (api/anthropic.js), which attaches the real key server-side and forwards
// the request. Requires ANTHROPIC_API_KEY set in the Vercel project's
// environment variables.
export const API_ENDPOINT = '/api/anthropic';
