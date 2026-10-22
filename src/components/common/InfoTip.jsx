import { useEffect, useId, useRef, useState } from 'react';
import '../../styles/infoTip.css';

// A small «!» next to a heading: the explanation of the block opens on click or Enter and closes on a click elsewhere or Esc.
// It replaces the grey hint lines under headings.
export default function InfoTip({ children, label = 'Пояснення' }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span className="infotip" ref={box}>
      <button type="button" className="infotip-btn" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>!</button>
      {open && <span id={id} role="note" className="infotip-pop">{children}</span>}
    </span>
  );
}
