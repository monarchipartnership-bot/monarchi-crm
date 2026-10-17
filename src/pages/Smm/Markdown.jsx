import { Fragment } from 'react';

// A small, safe reader of the Markdown the agents write (headings, lists, bold, paragraphs). Everything is rendered as React
// text: no HTML from the model is ever inserted into the page.
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
}

export default function Markdown({ text }) {
  const lines = String(text || '').split('\n');
  const out = [];
  let list = null;
  const flush = () => { if (list) { out.push(<ul key={'u' + out.length}>{list.map((li, i) => <li key={i}>{inline(li)}</li>)}</ul>); list = null; } };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (h) { flush(); out.push(<h5 key={i} className="smm-md-h">{inline(h[2])}</h5>); }
    else if (li) { list = list || []; list.push(li[1]); }
    else if (!line.trim()) flush();
    else { flush(); out.push(<p key={i}>{inline(line)}</p>); }
  });
  flush();
  return <div className="smm-md">{out}</div>;
}
