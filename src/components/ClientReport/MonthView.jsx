import { Box, DeltaPill, GB, GP, HBars, Legend, Medallion, Pill, PALETTE, Wave, Donut } from './kit';
import { Creatives, MetricTable, ReportTexts } from './parts';
import { dmy, fmtValue, kpiCards, prevName, rangeText, roasBars, spendSlices, viewKeys } from '../../lib/clientReport';
import { computeMetric } from '../../lib/reportMetrics';

const Stamps = ({ items }) => (
  <div className="stampr">
    {items.map(([icon, node, st]) => <span className="sp2" key={icon}><Medallion icon={icon} cls="xs" st={st} /><span>{node}</span></span>)}
  </div>
);

function Kpis({ view }) {
  const vs = prevName(view);
  return (
    <div className="kp k6">
      {kpiCards(view).map((k) => (
        <div className="rf mc" key={k.key}>
          <div className="mch"><Medallion icon={k.icon} cls="sm" /><div className="mct"><small>{k.label}</small><b className="v">{k.value}</b></div></div>
          <div className="mcf">{k.change && <><DeltaPill change={k.change} /><span className="sub">vs {vs}</span></>}</div>
        </div>
      ))}
    </div>
  );
}

// One approved week.
function Week({ week, ctx, model }) {
  const v = week.view;
  return (
    <Box icon="cal" title={`Week ${week.n}`} sub={week.label} right={<Pill tone="ok">Approved</Pill>}>
      <div className="split">
        <div className="l"><MetricTable view={v} keys={viewKeys(v, model)} {...ctx} /></div>
        <div className="r"><ReportTexts view={v} /><Creatives items={v.creatives} /></div>
      </div>
    </Box>
  );
}

// A month: the stamps, the six numbers, three charts, the weeks one under another and the total of the month.
export default function MonthView({ month, model }) {
  const kind = model.kind;
  const platformLabel = model.platform === 'meta' ? 'Meta' : model.platform === 'google' ? 'Google' : '';
  const ctx = { custom: model.custom, platformLabel };
  const total = month.monthly;
  const weeksSum = (key) => month.weeks.reduce((a, w) => a + (Number(w.view.total[key]) || 0), 0);
  const money = (key) => (v) => fmtValue(key, v, 'money', total?.currency || month.weeks[0]?.view.currency);
  const primary = kind === 'leadgen' ? ['leads', 'Leads'] : ['revenue', 'Revenue'];
  const wave = month.weeks.length > 1 ? (
    <Box icon="roas" title={`Weeks of ${month.name}`} sub={kind === 'leadgen' ? 'Spend and leads' : 'Spend, revenue and ROAS'} right={<Legend items={[[primary[1], GP], ['Spend', GB]]} />}>
      <div className="gx">
        <Wave
          labels={month.weeks.map((w) => `W${w.n}`)}
          series={[{ name: primary[1], values: month.weeks.map((w) => Number(w.view.total[primary[0]]) || 0), g: GP }, { name: 'Spend', values: month.weeks.map((w) => Number(w.view.total.spend) || 0), g: GB }]}
          w={620} h={240} fmt={kind === 'leadgen' ? (v) => String(Math.round(v)) : money('revenue')}
        />
        {kind !== 'leadgen' && (
          <div className="rstrip" style={{ gridTemplateColumns: `repeat(${month.weeks.length},minmax(0,1fr))` }}>
            {month.weeks.map((w) => <div className="rp" key={w.n}><small>W{w.n} ROAS</small><b>{fmtValue('roas', computeMetric('roas', w.view.total), 'ratio')}</b></div>)}
          </div>
        )}
      </div>
    </Box>
  ) : null;
  const slices = total ? spendSlices(total).map((s, i) => ({ ...s, g: PALETTE[i % PALETTE.length] })) : [];
  const bars = total && kind !== 'leadgen' ? roasBars(total).map((b, i) => ({ label: b.label, value: b.value, text: fmtValue('roas', b.value, 'ratio'), g: PALETTE[i % PALETTE.length] })) : [];
  const spent = slices.reduce((a, s) => a + s.value, 0);
  const complete = month.weeksApproved === month.weeksTotal;
  const reachSumWeeks = weeksSum('reach');
  const reachMonth = total ? Number(total.total.reach) || 0 : 0;

  return (
    <>
      <Stamps items={[
        ['shield', <>Data as of <b>{month.asOf ? dmy(month.asOf) : '—'}</b></>, 'st-ok'],
        ['check', <>Weeks approved <b>{month.weeksApproved} of {month.weeksTotal}</b></>, complete ? 'st-ok' : 'st-paused'],
        ['file', <>Month report <b>{!total ? 'not ready' : month.running ? 'to date' : 'final'}</b></>, month.running ? 'st-paused' : ''],
      ]}
      />
      {total && <Kpis view={total} />}
      {total && (wave || slices.length > 0) && (
        <div className={wave ? 'g3' : 'g2'}>
          {wave}
          {slices.length > 0 && <Box icon="pie" title="Spend by campaign group"><div className="gx"><Donut slices={slices} center={fmtValue('spend', spent, 'money', total.currency)} caption="ad spend" fmt={(v) => fmtValue('spend', v, 'money', total.currency)} /></div></Box>}
          {bars.length > 0 && <Box icon="bars" title="ROAS by campaign group"><div className="gx"><HBars items={bars} /></div></Box>}
        </div>
      )}
      {month.weeks.map((w) => <Week key={w.n} week={w} ctx={ctx} model={model} />)}
      {total ? (
        <Box icon="file" title={`${month.name} ${month.running ? 'so far' : 'summary'}`} sub={rangeText(total.start, total.end)} right={<Pill tone={month.running ? 'wa' : 'ok'}>{month.running ? 'To date' : 'Final'}</Pill>}>
          <div className="split">
            <div className="l">
              <MetricTable view={total} keys={viewKeys(total, model)} {...ctx} />
              {reachMonth > 0 && reachSumWeeks > 0 && Math.round(reachMonth) !== Math.round(reachSumWeeks) && (
                <p className="hint">Reach of the month ({fmtValue('reach', reachMonth, 'number')}) is counted for the whole month, not summed from the weeks ({fmtValue('reach', reachSumWeeks, 'number')}): the same person is seen in several weeks.</p>
              )}
            </div>
            <div className="r"><ReportTexts view={total} /><Creatives items={total.creatives} /></div>
          </div>
        </Box>
      ) : (
        <div className="emp">The summary of {month.name} appears here once the first week is approved and the month totals are calculated.</div>
      )}
    </>
  );
}

