import { useState } from 'react';
import ActionIcon from '../../../../components/common/ActionIcon';

const HEX = /^#([0-9a-f]{6})$/i;

function normalizeHex(v) {
  let s = v.trim();
  if (!s.startsWith('#')) s = '#' + s;
  if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s.slice(1).split('').map((c) => c + c).join('');
  return HEX.test(s) ? s.toLowerCase() : null;
}

// Colour well (native picker) + editable hex. The text box keeps what is being
// typed and only commits a complete, valid colour.
export default function ColorField({ id, label, value, onChange }) {
  // `draft` holds what is being typed; it is dropped on blur so the box
  // always falls back to the real current colour.
  const [draft, setDraft] = useState(null);
  const shown = draft ?? value.toUpperCase();

  function onText(e) {
    const t = e.target.value;
    setDraft(t);
    const ok = normalizeHex(t);
    if (ok) onChange(ok);
  }

  return (
    <div className="color-cell">
      <label className="color-name" htmlFor={id}>{label}</label>
      <span className="color-well">
        <input type="color" id={id} value={HEX.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
        <ActionIcon name="chevron" size={14} className="color-chev" />
      </span>
      <input
        className="color-hex"
        type="text"
        value={shown}
        maxLength={7}
        spellCheck={false}
        aria-label={`${label}: hex`}
        onChange={onText}
        onBlur={() => setDraft(null)}
      />
    </div>
  );
}
