import ClientAvatar from '../Clients/ClientAvatar';
import { fmtDate } from '../../lib/dateHelpers';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';

function fmtAmount(amount, currency) {
  if (amount == null || amount === '') return null;
  return `${Number(amount).toLocaleString('uk-UA')} ${currency || 'USD'}`;
}

function fmtCreated(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export default function DealCard({ deal, onClick, draggable, onDragStart }) {
  const amountLabel = fmtAmount(deal.amount, deal.currency);
  const clientLabel = deal.clients?.company || deal.clients?.name || 'Без клієнта';
  return (
    <div
      className="deal-card"
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={() => onClick(deal)}
    >
      <div className="deal-card-name">{deal.title || clientLabel}</div>
      {(deal.title || (deal.clients?.company && deal.clients?.name)) && (
        <div className="deal-card-sub">{deal.title ? clientLabel : deal.clients.name}</div>
      )}
      <div className="deal-card-meta">
        {amountLabel && <span className="deal-card-amount"><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.currency }} />{amountLabel}</span>}
        <span className="deal-card-date"><span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />{fmtCreated(deal.created_at)}</span>
      </div>
      {deal.manager && (
        <div className="deal-card-footer">
          <ClientAvatar name={deal.manager} size={22} />
          <span className="deal-card-manager">{deal.manager}</span>
        </div>
      )}
    </div>
  );
}
