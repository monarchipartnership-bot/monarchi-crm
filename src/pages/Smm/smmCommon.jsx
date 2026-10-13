import { useRef } from 'react';
import { createPortal } from 'react-dom';
import ActionIcon from '../../components/common/ActionIcon';
import useDialogA11y from '../../lib/useDialogA11y';
import { NETWORKS, STATUSES } from '../../lib/api/smm';

export function NetworkBadge({ platform, withName = true }) {
  const n = NETWORKS[platform] || { label: platform, short: '?', color: '#807394' };
  return (
    <span className="smm-net" style={{ '--net': n.color }}>
      <i aria-hidden="true">{n.short}</i>{withName && n.label}
    </span>
  );
}

export function StatusChip({ status }) {
  const s = STATUSES[status] || { label: status, color: '#807394' };
  return <span className="smm-chip" style={{ '--chip': s.color }}><i aria-hidden="true" />{s.label}</span>;
}

// One window frame for every SMM dialog: focus in, Tab stays inside, Escape closes, focus goes back.
export function Dialog({ title, onClose, children, foot, wide, labelId = 'smm-dialog-title' }) {
  const box = useRef(null);
  useDialogA11y(box, onClose);
  return createPortal(
    <div className="smm-overlay" data-dd="plum" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className={'smm-dialog' + (wide ? ' smm-dialog--wide' : '')} role="dialog" aria-modal="true" aria-labelledby={labelId} tabIndex={-1}>
        <div className="smm-dialog-head">
          <h2 id={labelId}>{title}</h2>
          <button type="button" className="smm-x" onClick={onClose} aria-label="Закрити"><ActionIcon name="close" size={20} /></button>
        </div>
        <div className="smm-dialog-body">{children}</div>
        {foot && <div className="smm-dialog-foot">{foot}</div>}
      </div>
    </div>,
    document.body,
  );
}
