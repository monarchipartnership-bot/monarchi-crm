// A link typed without «https://» opens the site, not a path inside the CRM; other schemes (javascript:, data:, mailto:) never become a link.
// → an address that is safe to put in href, or '' (nothing to link)
export function safeHref(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/]+\.[a-z]{2,}(:\d+)?(\/|$)/i.test(s)) return ''; // mailto:, javascript:, data: ...
  return 'https://' + s.replace(/^\/+/, '');
}
