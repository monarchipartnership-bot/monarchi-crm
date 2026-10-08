import { useEffect, useRef } from 'react';

// True while a Select / DatePicker / TimePicker menu is open: Escape then belongs to that menu, not to the dialog.
export const dropdownOpen = () => !!document.querySelector('.ui-select-menu:not(.closing), .date-picker-menu:not(.closing), .time-picker-menu:not(.closing)');

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

// What every dialog of the project workspace needs: focus moves into it when it opens, Tab stays
// inside, Escape asks to close, and focus goes back to what opened it. `box` is a ref to the dialog
// element (give it tabIndex={-1}); `onClose` may change between renders without resetting anything.
export default function useDialogA11y(box, onClose, { initialFocus } = {}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement;
    const el = box.current;
    (initialFocus ? el?.querySelector(initialFocus) : null)?.focus?.();
    if (!initialFocus || !el?.contains(document.activeElement)) el?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') { if (dropdownOpen()) return; e.stopPropagation(); closeRef.current?.(); return; }
      if (e.key !== 'Tab' || !box.current) return;
      const items = [...box.current.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (opener && opener.isConnected) opener.focus?.();
    };
  }, [box, initialFocus]);
}
