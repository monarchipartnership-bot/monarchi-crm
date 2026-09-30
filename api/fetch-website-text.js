import dns from 'node:dns';

// Server-side fetch-and-clean for the Account Enrichment agent (see
// src/lib/api/accountEnrichmentApi.js) — browsers can't reliably fetch an
// arbitrary third-party site (CORS), and doing this fetch server-side
// means it needs its own SSRF hardening since the URL comes from CRM data
// (a client's website field), not something we fully control:
// - http(s) only.
// - Hostname must resolve to a public IP — rejects loopback/private/
//   link-local/reserved ranges (blocks localhost, cloud metadata
//   endpoints like 169.254.169.254, internal 10.x/172.16.x/192.168.x).
// - No redirect following — a redirect target could point somewhere that
//   passed validation's opposite (DNS rebinding); safer to just report it
//   than to re-validate a moving target.
// - Bounded response size and timeout — this is a summarization input,
//   not a general scraper.

const MAX_BYTES = 300_000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_TEXT_CHARS = 6000;

function isPrivateIp(ip) {
  if (ip.includes(':')) {
    // IPv6 — reject loopback, link-local, unique-local, and unspecified.
    const lower = ip.toLowerCase();
    return lower === '::1' || lower === '::' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd');
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 0) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing url' });
    return;
  }

  let parsed;
  try {
    parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    res.status(400).json({ error: 'Only http/https URLs are allowed' });
    return;
  }

  try {
    const { address } = await dns.promises.lookup(parsed.hostname);
    if (isPrivateIp(address)) {
      res.status(400).json({ error: 'This host cannot be fetched' });
      return;
    }
  } catch (err) {
    res.status(400).json({ error: 'Could not resolve host: ' + err.message });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(parsed.toString(), {
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MonarchiCRM-AccountEnrichment/1.0)' },
    });
    clearTimeout(timeout);

    if (upstream.status >= 300 && upstream.status < 400) {
      res.status(200).json({ redirected: true, location: upstream.headers.get('location') || null, text: '' });
      return;
    }
    if (!upstream.ok) {
      res.status(200).json({ error: `Сайт відповів статусом ${upstream.status}`, text: '' });
      return;
    }

    const reader = upstream.body?.getReader();
    let received = 0;
    let html = '';
    const decoder = new TextDecoder('utf-8');
    if (reader) {
      while (received < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        html += decoder.decode(value, { stream: true });
      }
      reader.cancel().catch(() => {});
    } else {
      html = await upstream.text();
    }

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TEXT_CHARS);

    res.status(200).json({ text });
  } catch (err) {
    clearTimeout(timeout);
    res.status(200).json({ error: 'Не вдалося завантажити сайт: ' + (err.message || String(err)), text: '' });
  }
}
