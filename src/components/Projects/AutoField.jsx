import { useEffect, useRef, useState } from 'react';

// A text field that saves itself, like the deal card's fields: the value is kept locally while it is typed and handed to `onCommit` when the field
// loses focus (or Enter is pressed) and it really changed. Escape puts the saved value back. While the field has focus a newer saved value from
// outside never overwrites what is being typed.
export default function AutoField({ value, onCommit, type = 'text', placeholder, step, ariaLabel }) {
  const shown = value == null ? '' : String(value);
  const [text, setText] = useState(shown);
  const focused = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => { if (!focused.current) setText(shown); }, [shown]);

  function commit() {
    focused.current = false;
    if (cancelled.current) { cancelled.current = false; return; }
    if (text !== shown) onCommit(text);
  }

  return (
    <input
      type={type} value={text} placeholder={placeholder} step={step} aria-label={ariaLabel}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { cancelled.current = true; setText(shown); e.currentTarget.blur(); }
      }}
    />
  );
}
