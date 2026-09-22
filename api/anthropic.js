// Server-side proxy for the Follow-up Generator's calls to the Anthropic API.
// Browsers can't call api.anthropic.com directly (no CORS, and the key must
// never ship in client code) — this Vercel serverless function forwards the
// same request body the client already sends, attaching the real key from
// the server's own environment (ANTHROPIC_API_KEY, set in Vercel's project
// settings, never committed to the repo).
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' });
    return;
  }

  const body = req.body || {};
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await upstream.text();
    res.status(upstream.status).setHeader('Content-Type', 'application/json').send(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach Anthropic API: ' + err.message });
  }
}
