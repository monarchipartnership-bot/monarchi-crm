import { useEffect, useMemo, useState } from 'react';
import { fetchPlatformRange } from '../../lib/periodReport';
import { formatMoney } from '../../lib/adAccounts';
import { addDaysIso, todayIso } from '../../lib/dateHelpers';

const SHOWN = 8;
const DAYS = { last_7d: 7, last_30d: 30 };

const fmtNum = (v) => (v == null ? '—' : Number(v).toLocaleString('uk-UA', { maximumFractionDigits: 2 }));
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(2) + '%' : '—');

// «Кампанії» under the account's numbers on the project Overview: every campaign of the linked
// cabinet for the same period (7 / 30 days, ending yesterday like the platform's own presets),
// biggest spend first. Campaigns that did nothing in the period are left out.
export default function AccountCampaigns({ account, period }) {
  const [state, setState] = useState({ status: 'idle', rows: [] });
  const [all, setAll] = useState(false);

  useEffect(() => {
    if (!account) return undefined;
    let cancelled = false;
    setState({ status: 'loading', rows: [] });
    setAll(false);
    const to = addDaysIso(todayIso(), -1);
    const from = addDaysIso(to, -(DAYS[period] - 1));
    fetchPlatformRange(account.platform, account.account_id, from, to, 'ecom')
      .then((res) => { if (!cancelled) setState({ status: 'ok', rows: res.campaigns || [] }); })
      .catch((e) => { if (!cancelled) setState({ status: 'error', rows: [], error: e.message || 'Не вдалося завантажити кампанії.' }); });
    return () => { cancelled = true; };
  }, [account?.id, account?.platform, account?.account_id, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => state.rows
    .filter((r) => r.spend || r.impressions || r.clicks)
    .sort((a, b) => b.spend - a.spend), [state.rows]);
  const cur = account?.currency;
  const visible = all ? rows : rows.slice(0, SHOWN);
  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);

  return (
    <div className="pacc-camps">
      <div className="pacc-metrics-title">Кампанії{state.status === 'ok' && rows.length ? ` · ${rows.length}` : ''}</div>
      {state.status === 'loading' && <div className="pacc-hint">Завантажуємо кампанії…</div>}
      {state.status === 'error' && <div className="pacc-err">{state.error}</div>}
      {state.status === 'ok' && !rows.length && <div className="pacc-hint">За цей період кампанії не витрачали бюджет.</div>}
      {state.status === 'ok' && rows.length > 0 && (
        <>
          <div className="prep-scroll">
            <table className="prep-table">
              <thead>
                <tr><th>Кампанія</th><th>Витрати</th><th>Покази</th><th>Кліки</th><th>CTR</th><th>Покупки/ліди</th><th>Виручка</th><th>ROAS</th></tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.name}>
                    <td className="lbl">{r.name}</td>
                    <td>{formatMoney(r.spend, cur)}</td>
                    <td>{fmtNum(r.impressions)}</td>
                    <td>{fmtNum(r.clicks)}</td>
                    <td>{pct(r.clicks, r.impressions)}</td>
                    <td>{fmtNum((r.purchases || 0) + (r.leads || 0))}</td>
                    <td>{formatMoney(r.revenue, cur)}</td>
                    <td>{r.spend && r.revenue ? (r.revenue / r.spend).toFixed(2) + 'x' : '—'}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td className="lbl">Разом по кампаніях</td>
                  <td>{formatMoney(sum('spend'), cur)}</td>
                  <td>{fmtNum(sum('impressions'))}</td>
                  <td>{fmtNum(sum('clicks'))}</td>
                  <td>{pct(sum('clicks'), sum('impressions'))}</td>
                  <td>{fmtNum(sum('purchases') + sum('leads'))}</td>
                  <td>{formatMoney(sum('revenue'), cur)}</td>
                  <td>{sum('spend') && sum('revenue') ? (sum('revenue') / sum('spend')).toFixed(2) + 'x' : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {rows.length > SHOWN && (
            <button type="button" className="pw-btn pacc-camps-more" onClick={() => setAll((v) => !v)}>
              {all ? 'Показати менше' : `Показати всі (${rows.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
