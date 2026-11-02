import { Box, HBars, Medallion, Pill, PALETTE, Donut } from './kit';
import { Creatives, MetricTable, ReportTexts } from './parts';
import FunnelBox from './Funnel';
import { Kpis } from './MonthView';
import { dmy, fmtValue, rangeText, roasBars, spendSlices, viewKeys } from '../../lib/clientReport';

const Stamps = ({ items }) => (
  <div className="stampr">
    {items.map(([icon, node, st]) => <span className="sp2" key={icon}><Medallion icon={icon} cls="xs" st={st} /><span>{node}</span></span>)}
  </div>
);

// The page of ONE custom report (a link made for it, /r/<token>): the six numbers, the spend by group, the funnel, the table with the texts and the creatives
// of the chosen dates. Everything comes from the saved report; what the team hid with the eye is not in it.
export default function PeriodView({ view, model }) {
  const ctx = { custom: model.custom, platformLabel: model.platform === 'meta' ? 'Meta' : model.platform === 'google' ? 'Google' : '' };
  const hide = (key) => (view.hiddenMetrics || []).includes(key);
  const showRoas = view.kind !== 'leadgen' && !hide('roas');
  const slices = spendSlices(view).map((s, i) => ({ ...s, g: PALETTE[i % PALETTE.length] }));
  const bars = showRoas ? roasBars(view).map((b, i) => ({ label: b.label, value: b.value, text: fmtValue('roas', b.value, 'ratio'), g: PALETTE[i % PALETTE.length] })) : [];
  const spent = slices.reduce((a, s) => a + s.value, 0);
  const days = Math.round((new Date(view.end) - new Date(view.start)) / 86400000) + 1;
  return (
    <>
      <Stamps items={[
        ['cal', <>Period <b>{dmy(view.start)} – {dmy(view.end)}</b></>, 'st-ok'],
        ['shield', <>Data as of <b>{view.updatedAt ? dmy(view.updatedAt.slice(0, 10)) : '—'}</b></>, 'st-ok'],
      ]}
      />
      <Kpis view={view} />
      {(slices.length > 0 || bars.length > 0) && (
        <div className="g2">
          {slices.length > 0 && <Box icon="pie" title="Spend by campaign group"><div className="gx"><Donut slices={slices} center={fmtValue('spend', spent, 'money', view.currency)} caption="ad spend" fmt={(v) => fmtValue('spend', v, 'money', view.currency)} /></div></Box>}
          {bars.length > 0 && <Box icon="bars" title="ROAS by campaign group"><div className="gx"><HBars items={bars} /></div></Box>}
        </div>
      )}
      <FunnelBox view={view} custom={model.custom} />
      <Box icon="file" title="Report for the period" sub={`${rangeText(view.start, view.end)} · ${days} ${days === 1 ? 'day' : 'days'}`} right={<Pill tone="ok">Final</Pill>}>
        <div className="split">
          <div className="l"><MetricTable view={view} keys={viewKeys(view, model)} {...ctx} /></div>
          <div className="r"><ReportTexts view={view} /><Creatives items={view.creatives} /></div>
        </div>
      </Box>
    </>
  );
}
