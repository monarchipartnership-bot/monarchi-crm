import DOMPurify from 'dompurify';

// Deal notes are stored as HTML (rich-text editor output) — sanitize both on
// save and again on render, so nothing bad survives even if it slipped into
// the database some other way.
export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'a', 'ul', 'ol', 'li', 'br', 'div', 'p', 'span', 'img'],
    ALLOWED_ATTR: ['href', 'src', 'class', 'data-email', 'target', 'rel'],
  });
}

export function htmlToPlainText(html) {
  const el = document.createElement('div');
  el.innerHTML = html || '';
  return (el.textContent || '').trim();
}
