import { useEffect, useRef } from 'react';

// Textarea that grows to fit its content, matching the legacy autoH() behavior.
// When `capturing` is true, renders a plain div instead — html2canvas doesn't
// reliably paint textarea content, so the legacy pages swapped to divs before
// snapshotting (see swapTextareasForCapture in the old daily_report.html).
export default function AutoResizeTextarea({ value, onChange, capturing, className, ...rest }) {
  const ref = useRef(null);

  const resize = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  useEffect(() => {
    resize(ref.current);
  }, [value, capturing]);

  if (capturing) {
    return <div className="capture-text">{value}</div>;
  }

  return (
    <textarea
      ref={ref}
      className={className}
      rows={1}
      value={value}
      onChange={(e) => { onChange(e.target.value); resize(e.target); }}
      {...rest}
    />
  );
}
