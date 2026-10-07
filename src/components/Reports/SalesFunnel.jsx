import { FUNNEL_CHANNELS, STAGES, conversions, pctOf, investmentsFrom } from '../../lib/salesFunnel';
import { moneyFmt, pctFmt, numFmt } from '../../lib/weeklyLogic';

// Sales Dashboard blocks: the lead → call → qualified → contract funnel (week
// and month side by side, with the conversion between stages), the same funnel
// per channel for the month, and what was invested in each sales channel.
// Pure presentation — numbers come from lib/salesFunnel.js.

function FunnelCard({ title, funnel }) {
  const { total } = funnel;
  const conv = conversions(total);
  const max = Math.max(total.leads, total.calls, total.ql, total.co, 1);
  const stepConv = [null, conv.leadsToCalls, conv.callsToQl, conv.qlToCo];
  return (
    <div className="sd-funnel-card">
      <div className="sd-funnel-title">{title}</div>
      <div className="sd-funnel">
        {STAGES.map((s, i) => (
          <div key={s.key}>
            {i > 0 && <div className="sd-funnel-conv"><span>↓</span> {pctFmt(stepConv[i])}<em> конверсія</em></div>}
            <div className="sd-funnel-row">
              <span className="sd-funnel-label">{s.label}</span>
              <span className="sd-funnel-track">
                <span className={'sd-funnel-bar sd-funnel-bar--' + (i + 1)} style={{ width: Math.max(4, (total[s.key] / max) * 100) + '%' }} />
              </span>
              <span className="sd-funnel-value">{numFmt(total[s.key])}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="sd-funnel-foot">Від ліда до контракту: <b>{pctFmt(conv.leadsToCo)}</b></div>
    </div>
  );
}

export function FunnelSection({ weekFunnel, monthFunnel, monthLabel }) {
  return (
    <div className="sd-funnel-grid">
      <FunnelCard title="Цей тиждень" funnel={weekFunnel} />
      <FunnelCard title={`Цей місяць — ${monthLabel}`} funnel={monthFunnel} />
    </div>
  );
}

export function ChannelFunnelTable({ funnel }) {
  return (
    <div className="sd-table-wrap">
      <table className="sd-table">
        <thead>
          <tr>
            <th>Канал</th>
            {STAGES.map((s) => <th key={s.key}>{s.label}</th>)}
            <th>Лід → дзвінок</th>
            <th>Дзвінок → QL</th>
            <th>QL → контракт</th>
          </tr>
        </thead>
        <tbody>
          {FUNNEL_CHANNELS.map((c) => {
            const r = funnel.byChannel[c.key];
            return (
              <tr key={c.key}>
                <td>{c.title}</td>
                {STAGES.map((s) => <td key={s.key}>{numFmt(r[s.key])}</td>)}
                <td>{pctFmt(pctOf(r.calls, r.leads))}</td>
                <td>{pctFmt(pctOf(r.ql, r.calls))}</td>
                <td>{pctFmt(pctOf(r.co, r.ql))}</td>
              </tr>
            );
          })}
          <tr className="sd-table-total">
            <td>Усього</td>
            {STAGES.map((s) => <td key={s.key}>{numFmt(funnel.total[s.key])}</td>)}
            <td>{pctFmt(pctOf(funnel.total.calls, funnel.total.leads))}</td>
            <td>{pctFmt(pctOf(funnel.total.ql, funnel.total.calls))}</td>
            <td>{pctFmt(pctOf(funnel.total.co, funnel.total.ql))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function InvestmentsTable({ weekGet, monthGet, monthLabel }) {
  const week = investmentsFrom(weekGet);
  const month = investmentsFrom(monthGet);
  return (
    <div className="sd-table-wrap">
      <table className="sd-table">
        <thead>
          <tr>
            <th rowSpan={2}>Канал продажів</th>
            <th colSpan={3} className="sd-table-group">Цей тиждень</th>
            <th colSpan={3} className="sd-table-group">{monthLabel}</th>
          </tr>
          <tr>
            <th>Інвестиції</th><th>Дохід</th><th>Прибуток</th>
            <th>Інвестиції</th><th>Дохід</th><th>Прибуток</th>
          </tr>
        </thead>
        <tbody>
          {week.rows.map((w, i) => {
            const m = month.rows[i];
            return (
              <tr key={w.key}>
                <td>{w.title}</td>
                <td>{moneyFmt(w.spend)}</td><td>{moneyFmt(w.income)}</td><td className={w.profit < 0 ? 'sd-neg' : ''}>{moneyFmt(w.profit)}</td>
                <td>{moneyFmt(m.spend)}</td><td>{moneyFmt(m.income)}</td><td className={m.profit < 0 ? 'sd-neg' : ''}>{moneyFmt(m.profit)}</td>
              </tr>
            );
          })}
          <tr className="sd-table-total">
            <td>Усього</td>
            <td>{moneyFmt(week.totalSpend)}</td><td>{moneyFmt(week.totalIncome)}</td><td className={week.profit < 0 ? 'sd-neg' : ''}>{moneyFmt(week.profit)}</td>
            <td>{moneyFmt(month.totalSpend)}</td><td>{moneyFmt(month.totalIncome)}</td><td className={month.profit < 0 ? 'sd-neg' : ''}>{moneyFmt(month.profit)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
