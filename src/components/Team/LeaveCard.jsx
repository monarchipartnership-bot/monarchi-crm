import { leaveTypeInfo } from '../../lib/leaveTypes';

function personLabel(p) {
  if (!p) return null;
  const full = `${p.first_name || ''} ${p.last_name || ''}`.trim();
  return full || null;
}

function initials(name, email) {
  if (name?.trim()) return name.trim()[0].toUpperCase();
  return (email || '?')[0].toUpperCase();
}

function fmtIsoDate(iso) {
  if (!iso) return '—';
  const p = iso.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

export default function LeaveCard({ row, profile, onCancel, onApprove, onReject }) {
  const name = personLabel(profile) || row.email;
  const photo = profile?.photo;
  const isPending = row.status === 'pending';
  const typeInfo = leaveTypeInfo(row.type);

  return (
    <div className="leave-card">
      <div className="leave-avatar">
        {photo ? <img src={photo} alt="" /> : initials(name, row.email)}
      </div>
      <div className="leave-main">
        <div className="leave-name">{name}</div>
        <div className="leave-dates">{fmtIsoDate(row.date_start)} — {fmtIsoDate(row.date_end)}{row.reason ? ` · ${row.reason}` : ''}</div>
      </div>
      <div className="leave-tags">
        <span className="tag type-tag" style={{ color: typeInfo.color, background: typeInfo.tint, border: `1px solid ${typeInfo.color}4D` }}>
          <span className="type-tag-ic" dangerouslySetInnerHTML={{ __html: typeInfo.icon }} />
          {typeInfo.label}
        </span>
        {row.status && row.status !== 'approved' && (
          <span className={'tag ' + row.status}>{row.status === 'pending' ? 'На розгляді' : 'Відхилено'}</span>
        )}
      </div>
      {onCancel && isPending && (
        <button type="button" className="req-cancel" onClick={() => onCancel(row.id)}>Скасувати</button>
      )}
      {(onApprove || onReject) && isPending && (
        <div className="req-actions">
          <button type="button" className="req-approve" onClick={() => onApprove(row.id)}>Затвердити</button>
          <button type="button" className="req-reject" onClick={() => onReject(row.id)}>Відхилити</button>
        </div>
      )}
    </div>
  );
}
