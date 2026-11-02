import { Box, DeltaPill, Donut, GA, GB, GG, GP, Legend, Medallion, PALETTE, Spark, Wave } from './kit';
import { change, fmtValue } from '../../lib/clientReport';
import { monthNameIn, monthShortIn, trFor } from '../../lib/clientLang';
import { LangProvider } from './langContext';

const Stamps = ({ items }) => (
  <div className="stampr">
    {items.map(([icon, node, st]) => <span className="sp2" key={icon}><Medallion icon={icon} cls="xs" st={st} /><span>{node}</span></span>)}
  </div>
);

// Small card: the number of the latest COMPLETE month, its change against the month before, a tiny wave of the whole period.
// (A month to date is never compared with a full month: that would always look like a drop.)
function Mini({ title, icon, values, partial, labels, fmt, g, goodWhen, keyName, lang }) {
  let at = values.length - 1;
  while (at > 0 && partial[at]) at -= 1;
  const cur = values[at];
  const ch = at > 0 ? change(keyName, cur, values[at - 1], goodWhen, lang) : null;
  return (
    <div className="rf mini">
      <div className="mch"><Medallion icon={icon} cls="sm" /><div className="mct"><small>{title}</small><b className="v">{fmt(cur)}</b></div>{ch && <><DeltaPill change={ch} /><span className="sub">{labels[at]} {trFor(lang)('vs')} {labels[at - 1]}</span></>}</div>
      <Spark values={values.map((v) => v || 0)} g={g} />
    </div>
  );
}

// The whole period month by month: the charts and the table read the monthly totals (the running month is marked «to date»).
export default function AllMonths({ model }) {
  const hist = model.history;
  const lang = model.lang;
  const t = trFor(lang);
  if (hist.length < 2) {
    return <div className="emp">{t('The month-by-month comparison appears here as soon as two months have a report.')}</div>;
  }
  const short = (m) => monthShortIn(m.key, lang);
  const kind = model.kind;
  const hid = (key) => (model.hidden || []).includes(key); // metrics the client does not see
  const cur = hist[0].currency;
  const labels = hist.map(short);
  const axis = hist.map((m) => (m.partial ? `${short(m)}*` : short(m)));
  const money = (key) => (v) => fmtValue(key, v, 'money', cur, lang);
  const first = model.months.find((m) => m.key === hist[0].key);
  const last = model.months.find((m) => m.key === hist[hist.length - 1].key);
  const primary = kind === 'leadgen' ? ['leads', t('Leads')] : ['revenue', t('Revenue')];
  const rows0 = (kind === 'leadgen'
    ? [['Spent', 'spend', 'money'], ['Leads', 'leads', 'number'], ['CPL', 'cpl', 'money'], ['CTR', 'ctr', 'percent'], ['CPM', 'cpm', 'money']]
    : [['Spent', 'spend', 'money'], ['Revenue', 'revenue', 'money'], ['ROAS (Meta)', 'roas', 'ratio'], ['Number of sales', 'purchases', 'number'], ['CPP', 'cpa', 'money'], ['AOV', 'aov', 'money'], ['CTR', 'ctr', 'percent'], ['CPM', 'cpm', 'money']]
  ).map(([label, key, format]) => ({ label: t(model.platform === 'meta' ? label : label.replace(' (Meta)', '')), key, format }));
  const metricOf = (k) => (k === 'cpa' ? 'cpp' : k);
  const rows = rows0.filter((r) => !hid(metricOf(r.key)));
  const minis0 = kind === 'leadgen'
    ? [[t('Leads'), 'coin', 'leads', 'number', GP, 'up'], [t('Cost per lead'), 'pct', 'cpl', 'money', GB, 'down'], ['CTR', 'click', 'ctr', 'percent', GG, 'up'], ['CPM', 'eye', 'cpm', 'money', GA, 'down']]
    : [[t('Purchases'), 'cart', 'purchases', 'number', GP, 'up'], [t('Cost per purchase'), 'coin', 'cpa', 'money', GB, 'down'], [t('Average order value'), 'wallet', 'aov', 'money', GG, 'up'], ['CTR', 'click', 'ctr', 'percent', GA, 'up'], ['CPM', 'eye', 'cpm', 'money', GP, 'down'], ['ROAS', 'roas', 'roas', 'ratio', GB, 'up']];
  const minis = minis0.filter(([, , key]) => !hid(metricOf(key)));
  const waveSeries = [
    ...(hid(primary[0]) ? [] : [{ name: primary[1], values: hist.map((m) => m[primary[0]] || 0), g: GP }]),
    ...(hid('spend') ? [] : [{ name: t('Spend'), values: hist.map((m) => m.spend || 0), g: GB }]),
  ];

  return (
    <LangProvider lang={lang}>
      <Stamps items={[
        ['cal', <>{t('Whole period')} <b>{monthNameIn(first.key, lang)} – {monthNameIn(last.key, lang)} {last.key.slice(0, 4)}</b></>, ''],
        ['spark', <>{t('New months are added automatically once a month report is approved')}</>, ''],
        ...(hist.some((m) => m.partial) ? [['clock', <>{t('* {month} is month to date', { month: monthNameIn(last.key, lang) })}</>, 'st-paused']] : []),
      ]}
      />
      <div className="g2">
        <Box icon="roas" title={kind === 'leadgen' ? t('Spend and leads by month') : t('Spend, revenue and ROAS by month')} sub={kind === 'leadgen' ? t('Spend in money, leads under the chart') : t('Spend and revenue in money, ROAS under the chart')} right={<Legend items={waveSeries.map((x) => [x.name, x.g])} />}>
          <div className="gx">
            <Wave labels={axis} series={waveSeries} w={640} h={250} fmt={kind === 'leadgen' ? (v) => String(Math.round(v)) : money('revenue')} />
            {kind !== 'leadgen' && !hid('roas') && (
              <div className="rstrip" style={{ gridTemplateColumns: `repeat(${Math.min(hist.length, 6)},minmax(0,1fr))` }}>
                {hist.map((m) => <div className={`rp${m.partial ? ' part' : ''}`} key={m.key}><small>{m.partial ? t('{m} (to date)', { m: short(m) }) : short(m)} ROAS</small><b>{fmtValue('roas', m.roas, 'ratio', undefined, lang)}</b></div>)}
              </div>
            )}
          </div>
        </Box>
        {kind !== 'leadgen' && !hid('revenue') && (
          <Box icon="pie" title={t('Revenue by month')}>
            <div className="gx">
              <Donut
                slices={hist.map((m, i) => ({ label: m.partial ? t('{m} (to date)', { m: short(m) }) : short(m), value: Math.round(m.revenue || 0), g: PALETTE[i % PALETTE.length] }))}
                center={fmtValue('revenue', hist.reduce((a, m) => a + (m.revenue || 0), 0), 'money', cur, lang)} caption={t('revenue')} fmt={money('revenue')}
              />
            </div>
          </Box>
        )}
      </div>
      <div className="kp k3">
        {minis.map(([title, icon, key, format, g, goodWhen]) => (
          <Mini key={key} title={title} icon={icon} values={hist.map((m) => m[key])} partial={hist.map((m) => m.partial)} labels={labels} fmt={(v) => fmtValue(key === 'cpa' ? 'cpp' : key, v, format, cur, lang)} g={g} goodWhen={goodWhen} keyName={key} lang={lang} />
        ))}
      </div>
      <Box icon="layers" title={t('Month by month')}>
        <div className="scroll">
          <table className="hubt tr2 fx mm" style={{ minWidth: 150 + hist.length * 130 }}>
            <thead><tr><th />{hist.map((m) => <th key={m.key}>{m.partial ? t('{m} (to date)', { m: short(m) }) : short(m)}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}><td>{r.label}</td>{hist.map((m) => <td key={m.key}>{fmtValue(r.key === 'cpa' ? 'cpp' : r.key, m[r.key], r.format, cur, lang)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </Box>
    </LangProvider>
  );
}
