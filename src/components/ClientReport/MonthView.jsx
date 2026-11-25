import { Box, DeltaPill, GB, GP, HBars, Legend, Medallion, Pill, PALETTE, Spark, SpendRank, Wave, Sec } from './kit';
import { Creatives, MetricTable, NotesGrid } from './parts';
import FunnelBox from './Funnel';
import { LangProvider } from './langContext';
import { OTHER_CAMPAIGNS, fmtValue, kpiCards, prevName, rangeText, roasBars, spendSlices, viewKeys } from '../../lib/clientReport';
import { monthNameIn, normLang, trFor } from '../../lib/clientLang';
import { computeMetric } from '../../lib/reportMetrics';

// The four numbers of a report in the order a client reads them (owner, 2026-11-25): what was spent, what it brought in, the return, the number of sales (for lead projects: spent,
// leads, cost per lead, clicks). The result (revenue / leads) is the lit card. The rest (cost per purchase, reach …) is in the table below. `all`: the team's view (nothing hidden).
const KPI_ORDER = { ecom: ['spend', 'revenue', 'roas', 'purchases'], leadgen: ['spend', 'leads', 'cpl', 'clicks'] };
export function Kpis({ view, all = false, series = null }) {
  const t = trFor(view.lang);
  const vs = prevName(view);
  const cards = kpiCards(view, { all });
  if (!cards.length) return null;
  const lead = view.kind === 'leadgen';
  const picks = (KPI_ORDER[lead ? 'leadgen' : 'ecom']).map((key) => cards.find((c) => c.key === key)).filter(Boolean);
  const list = picks.length ? picks : cards.slice(0, 4);
  const main = lead ? 'leads' : 'revenue';
  return (
    <div className="cx-quad">
      {list.map((k) => (
        <div className={'rf mc cx-q' + (k.key === main ? ' main' : '')} key={k.key}>
          <div className="mch"><Medallion icon={k.icon} cls="sm" /><div className="mct"><small>{k.label}</small><b className="v">{k.value}</b></div></div>
          {series?.[k.key] && <Spark values={series[k.key]} g={k.key === main ? ['#FFFFFF', '#F3C6F7'] : ['#F6C5FA', '#C25AC4']} w={240} h={52} className="spk cx-kspk" />}
          <div className="mcf">{k.change && <><DeltaPill change={k.change} /><span className="sub">{t('vs')} {vs}</span></>}</div>
        </div>
      ))}
    </div>
  );
}

// A month or one of its weeks (owner's pick A, 2026-11-25): the page above this one has a switch «Month · Week 1 · Week 2 …», and everything below is the report of what the switch
// says: the four numbers, the spend and ROAS of the groups (a month also shows its weeks as a chart), the funnel, the table of figures in tabs, the manager's notes in tabs and the creatives.
export default function MonthView({ month, model, scope = 'm' }) {
  const week = scope === 'm' ? null : month.weeks.find((w) => String(w.n) === String(scope)) || null;
  const view = week ? week.view : month.monthly;
  const kind = model.kind;
  const platformLabel = model.platform === 'meta' ? 'Meta' : model.platform === 'google' ? 'Google' : '';
  const ctx = { custom: model.custom, platformLabel };
  const lang = normLang(view?.lang || model.lang); // the report's language, else the project's
  const t = trFor(lang);
  const monthName = monthNameIn(month.key, lang);
  if (!view) {
    return <div className="emp">{t('The summary of {month} appears here once the first week is approved and the month totals are calculated.', { month: monthName })}</div>;
  }
  const isMonth = !week;
  const weeksSum = (key) => month.weeks.reduce((a, w) => a + (Number(w.view.total[key]) || 0), 0);
  const money = (key) => (v) => fmtValue(key, v, 'money', view.currency, lang);
  const primary = kind === 'leadgen' ? ['leads', t('Leads')] : ['revenue', t('Revenue')];
  const hide = (key) => (view.hiddenMetrics || []).includes(key);
  const series = [
    ...(hide(primary[0]) ? [] : [{ name: primary[1], values: month.weeks.map((w) => Number(w.view.total[primary[0]]) || 0), g: GP }]),
    ...(hide('spend') ? [] : [{ name: t('Spend'), values: month.weeks.map((w) => Number(w.view.total.spend) || 0), g: GB }]),
  ];
  const showRoas = kind !== 'leadgen' && !hide('roas');
  const wave = isMonth && month.weeks.length > 1 && series.length ? (
    <Box icon="roas" title={t('Weeks of {month}', { month: monthName })} sub={kind === 'leadgen' ? t('Spend and leads') : t('Spend, revenue and ROAS')} right={<Legend items={series.map((x) => [x.name, x.g])} />}>
      <div className="gx">
        <Wave
          labels={month.weeks.map((w) => t('W{n}', { n: w.n }))}
          series={series}
          w={620} h={240} fmt={kind === 'leadgen' ? (v) => String(Math.round(v)) : money('revenue')}
        />
        {showRoas && (
          <div className="rstrip" style={{ gridTemplateColumns: `repeat(${month.weeks.length},minmax(0,1fr))` }}>
            {month.weeks.map((w) => <div className="rp" key={w.n}><small>{t('W{n} ROAS', { n: w.n })}</small><b>{fmtValue('roas', computeMetric('roas', w.view.total), 'ratio', undefined, lang)}</b></div>)}
          </div>
        )}
      </div>
    </Box>
  ) : null;
  const sparks = {};
  if (isMonth && month.weeks.length > 2) { // two points make a straight line, not a trend
    kpiCards(view).forEach((c) => {
      const vals = month.weeks.map((w) => computeMetric(c.key, w.view.total));
      if (vals.filter((x) => x != null && Number.isFinite(x)).length > 2) sparks[c.key] = vals.map((x) => (Number.isFinite(x) ? x : 0));
    });
  }
  const slices = spendSlices(view).map((s, i) => ({ ...s, g: PALETTE[i % PALETTE.length] }));
  const bars = showRoas ? roasBars(view).map((b, i) => ({ label: b.label, short: b.short, stage: b.stage, full: b.full, value: b.value, text: fmtValue('roas', b.value, 'ratio', undefined, lang), g: PALETTE[i % PALETTE.length] })) : [];
  const spent = slices.reduce((a, s) => a + s.value, 0);
  const reachSumWeeks = weeksSum('reach');
  const reachMonth = Number(view.total.reach) || 0;
  const hasTexts = view.blocks.some((b) => String(view.sections?.[b.key] || '').trim());
  const tableTitle = isMonth ? t(month.running ? '{month} so far' : '{month} summary', { month: monthName }) : `${t('Week {n}', { n: week.n })} · ${week.label}`;

  return (
    <LangProvider lang={lang}>
      <Sec id="overview" icon="spark" title={t('Overview')} sub={t(isMonth ? 'The result of the period at a glance' : 'The result of the week at a glance')}>
        <Kpis view={view} series={Object.keys(sparks).length ? sparks : null} />
      </Sec>
      {(wave || slices.length > 0) && (
        <Sec id="spend" icon="pie" title={t('Spend & ROAS')} sub={t('Where the budget went and what it returned')}>
          <div className={wave ? 'g3' : 'g2'}>
            {wave}
            {slices.length > 0 && <Box icon="pie" title={t('Spend by campaign group')} sub={`${t('ad spend')} · ${fmtValue('spend', spent, 'money', view.currency, lang)}`}><div className="gx"><SpendRank slices={slices} fmt={(v) => fmtValue('spend', v, 'money', view.currency, lang)} /></div></Box>}
            {bars.length > 0 && <Box icon="bars" title={t('ROAS by campaign group')}><div className="gx"><HBars items={bars} /></div></Box>}
          </div>
        </Sec>
      )}
      <FunnelBox view={view} custom={model.custom} section />
      <Sec id="details" icon="file" title={tableTitle} nav={t('Metrics')} sub={`${t(view.groups.some((g) => g.name !== OTHER_CAMPAIGNS) ? 'Every metric by campaign group' : 'Every metric of the report')} · ${rangeText(view.start, view.end)}`} right={isMonth ? <Pill tone={month.running ? 'wa' : 'ok'}>{month.running ? t('To date') : t('Final')}</Pill> : <Pill tone="ok">{t('Approved')}</Pill>}>
        <div className="rf cx-card cx-tcard">
          <MetricTable full view={view} keys={viewKeys(view, model)} {...ctx} />
          {isMonth && reachMonth > 0 && reachSumWeeks > 0 && Math.round(reachMonth) !== Math.round(reachSumWeeks) && (
            <p className="hint">{t('Reach of the month ({a}) is counted for the whole month, not summed from the weeks ({b}): the same person is seen in several weeks.', { a: fmtValue('reach', reachMonth, 'number', undefined, lang), b: fmtValue('reach', reachSumWeeks, 'number', undefined, lang) })}</p>
          )}
        </div>
      </Sec>
      {hasTexts && (
        <Sec id="notes" icon="note" title={t('Notes from your manager')} nav={t('Notes')} sub={t('What we did, what we concluded and what is next')}>
          <NotesGrid view={view} />
        </Sec>
      )}
      {view.creatives?.length > 0 && (
        <Sec id="creatives" icon="image" title={t('Most effective creatives')} nav={t('Creatives')} sub={t('Ranked by ROAS')}>
          <Creatives items={view.creatives} heading={false} large />
        </Sec>
      )}
    </LangProvider>
  );
}
