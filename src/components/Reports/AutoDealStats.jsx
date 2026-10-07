// "З угод" line above a channel's metrics: the QL / Contract counts the CRM
// derives from deals (qualified / won in the period, by Source), shown next to
// the numbers typed by hand so the two can be compared. It never writes into
// the report's own fields.
export default function AutoDealStats({ autoStats, fields, channel, period }) {
  const qlMetric = channel.metrics.find((m) => /_ql$/.test(m.id));
  const coMetric = channel.metrics.find((m) => /_co$|_contracts$/.test(m.id));
  const manual = (m) => (m ? Number(fields?.[m.id]) || 0 : null);
  const mq = manual(qlMetric);
  const mc = manual(coMetric);
  const differs = (mq !== null && mq !== autoStats.ql) || (mc !== null && mc !== autoStats.co);
  return (
    <div className={'auto-deal-stats' + (differs ? ' differs' : '')} title={`QL — угоди, кваліфіковані (MQL/SQL) за ${period}; Contracts — угоди, переведені у «Виграно» за ${period}. Рахується за Source угоди.`}>
      <span className="auto-deal-stats-label">З угод за {period}</span>
      <span className="auto-deal-stats-item">QL: <b>{autoStats.ql}</b>{mq !== null && <i> (у звіті {mq})</i>}</span>
      <span className="auto-deal-stats-item">Contracts: <b>{autoStats.co}</b>{mc !== null && <i> (у звіті {mc})</i>}</span>
    </div>
  );
}
