import { useState } from 'react';
import { Box, DeltaPill, GB, GP, HBars, Icon, Legend, Medallion, Pill, PALETTE, Spark, SpendRank, Wave, Sec } from './kit';
import { Creatives, MetricTable, NotesGrid } from './parts';
import FunnelBox from './Funnel';
import { LangProvider } from './langContext';
import { fmtValue, kpiCards, prevName, rangeText, roasBars, spendSlices, viewKeys } from '../../lib/clientReport';
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

// One approved week as a card: its three numbers, a little bar chart of the month's weeks with this one lit, and the button that opens its full report below the cards.
function WeekCard({ week, weeks, on, onPick }) {
  const v = week.view;
  const t = trFor(v.lang);
  const hide = (key) => (v.hiddenMetrics || []).includes(key);
  const lead = v.kind === 'leadgen';
  const figs = (lead ? ['spend', 'leads', 'cpl'] : ['spend', 'roas', 'purchases']).filter((k) => !hide(k)).map((k) => {
    const val = computeMetric(k, v.total);
    return val == null ? null : { key: k, label: k === 'purchases' ? t('Sales') : k === 'spend' ? t('Spent') : k === 'roas' ? 'ROAS' : k === 'leads' ? t('Leads') : 'CPL', value: fmtValue(k, val, k === 'roas' ? 'ratio' : k === 'purchases' || k === 'leads' ? 'number' : 'money', v.currency, v.lang) };
  }).filter(Boolean);
  const pk = lead ? 'leads' : 'revenue';
  const vals = weeks.map((w) => Number(w.view.total[pk]) || 0);
  const mx = Math.max(...vals, 1);
  return (
    <section className={'cx-wc' + (on ? ' on' : '')}>
      <div className="cx-wch">
        <Medallion icon="cal" cls="sm" />
        <span className="cx-wkt"><b>{t('Week {n}', { n: week.n })}</b><small>{week.label}</small></span>
        <span className="cx-grow" />
        <Pill tone="ok">{t('Approved')}</Pill>
      </div>
      {figs.length > 0 && <div className="cx-wn">{figs.map((f) => <div key={f.key}><b>{f.value}</b><span>{f.label}</span></div>)}</div>}
      {weeks.length > 1 && !hide(pk) && (
        <div className="cx-wb" aria-hidden="true">{weeks.map((w, i) => <i key={w.n} className={w.n === week.n ? 'me' : ''} style={{ height: `${Math.max(10, (vals[i] / mx) * 100)}%` }} />)}</div>
      )}
      <button type="button" className="cx-wo" aria-expanded={on} aria-controls="cx-wdetail" onClick={onPick}>{on ? t('Hide the week') : t('Open the week')}<Icon name="down" /></button>
    </section>
  );
}

// The full report of the chosen week (the same table, funnel, notes and creatives a month has), drawn in the week's own language.
function WeekDetail({ week, ctx, model, onClose }) {
  const v = week.view;
  const t = trFor(v.lang);
  const hasTexts = v.blocks.some((b) => String(v.sections?.[b.key] || '').trim());
  return (
    <LangProvider lang={v.lang}>
      <section className="rf cx-wd" id="cx-wdetail">
        <div className="cx-wdh">
          <Medallion icon="cal" cls="sm" />
          <span className="cx-wkt"><b>{t('Week {n}', { n: week.n })}</b><small>{week.label}</small></span>
          <span className="cx-grow" />
          <button type="button" className="cx-x" onClick={onClose} aria-label={t('Close')}>&times;</button>
        </div>
        <div className="cx-wkb">
          <MetricTable full view={v} keys={viewKeys(v, model)} {...ctx} />
          <FunnelBox view={v} custom={model.custom} />
          {hasTexts && <NotesGrid view={v} />}
          <Creatives items={v.creatives} large />
        </div>
      </section>
    </LangProvider>
  );
}

// A month: the six numbers, the charts, the weeks (each one opens) and the summary of the month with its notes and creatives.
export default function MonthView({ month, model }) {
  const [openWeek, setOpenWeek] = useState(() => (month.monthly || !month.weeks.length ? null : month.weeks[month.weeks.length - 1].n));
  const kind = model.kind;
  const platformLabel = model.platform === 'meta' ? 'Meta' : model.platform === 'google' ? 'Google' : '';
  const ctx = { custom: model.custom, platformLabel };
  const total = month.monthly;
  const lang = normLang(total?.lang || model.lang); // the month report's language, else the project's
  const t = trFor(lang);
  const monthName = monthNameIn(month.key, lang);
  const weeksSum = (key) => month.weeks.reduce((a, w) => a + (Number(w.view.total[key]) || 0), 0);
  const money = (key) => (v) => fmtValue(key, v, 'money', total?.currency || month.weeks[0]?.view.currency, lang);
  const primary = kind === 'leadgen' ? ['leads', t('Leads')] : ['revenue', t('Revenue')];
  const hide = (key) => (total?.hiddenMetrics || month.weeks[0]?.view.hiddenMetrics || []).includes(key);
  const series = [
    ...(hide(primary[0]) ? [] : [{ name: primary[1], values: month.weeks.map((w) => Number(w.view.total[primary[0]]) || 0), g: GP }]),
    ...(hide('spend') ? [] : [{ name: t('Spend'), values: month.weeks.map((w) => Number(w.view.total.spend) || 0), g: GB }]),
  ];
  const showRoas = kind !== 'leadgen' && !hide('roas');
  const wave = month.weeks.length > 1 && series.length ? (
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
  if (total && month.weeks.length > 2) { // two points make a straight line, not a trend
    kpiCards(total).forEach((c) => {
      const vals = month.weeks.map((w) => computeMetric(c.key, w.view.total));
      if (vals.filter((x) => x != null && Number.isFinite(x)).length > 2) sparks[c.key] = vals.map((x) => (Number.isFinite(x) ? x : 0));
    });
  }
  const slices = total ? spendSlices(total).map((s, i) => ({ ...s, g: PALETTE[i % PALETTE.length] })) : [];
  const bars = total && showRoas ? roasBars(total).map((b, i) => ({ label: b.label, short: b.short, stage: b.stage, full: b.full, value: b.value, text: fmtValue('roas', b.value, 'ratio', undefined, lang), g: PALETTE[i % PALETTE.length] })) : [];
  const spent = slices.reduce((a, s) => a + s.value, 0);
  const reachSumWeeks = weeksSum('reach');
  const reachMonth = total ? Number(total.total.reach) || 0 : 0;
  const hasTexts = total ? total.blocks.some((b) => String(total.sections?.[b.key] || '').trim()) : false;

  return (
    <LangProvider lang={lang}>
      {total && (
        <Sec id="overview" icon="spark" title={t('Overview')} sub={t('The result of the period at a glance')}>
          <Kpis view={total} series={Object.keys(sparks).length ? sparks : null} />
        </Sec>
      )}
      {total && (wave || slices.length > 0) && (
        <Sec id="spend" icon="pie" title={t('Spend & ROAS')} sub={t('Where the budget went and what it returned')}>
          <div className={wave ? 'g3' : 'g2'}>
            {wave}
            {slices.length > 0 && <Box icon="pie" title={t('Spend by campaign group')} sub={`${t('ad spend')} · ${fmtValue('spend', spent, 'money', total.currency, lang)}`}><div className="gx"><SpendRank slices={slices} fmt={(v) => fmtValue('spend', v, 'money', total.currency, lang)} /></div></Box>}
            {bars.length > 0 && <Box icon="bars" title={t('ROAS by campaign group')}><div className="gx"><HBars items={bars} /></div></Box>}
          </div>
        </Sec>
      )}
      {total && <FunnelBox view={total} custom={model.custom} section />}
      {month.weeks.length > 0 && (
        <Sec id="weeks" icon="cal" title={t('Weeks of {month}', { month: monthName })} nav={t('Weeks')} sub={t('Each approved week with its own numbers')}>
          <div className="cx-weeks">
            {month.weeks.map((w) => <WeekCard key={w.n} week={w} weeks={month.weeks} on={openWeek === w.n} onPick={() => setOpenWeek((cur) => (cur === w.n ? null : w.n))} />)}
          </div>
          {month.weeks.filter((w) => w.n === openWeek).map((w) => <WeekDetail key={w.n} week={w} ctx={ctx} model={model} onClose={() => setOpenWeek(null)} />)}
        </Sec>
      )}
      {total ? (
        <LangProvider lang={total.lang}>
          <Sec id="details" icon="file" title={t(month.running ? '{month} so far' : '{month} summary', { month: monthName })} nav={t('Details')} sub={`${t('Every metric by campaign group')} · ${rangeText(total.start, total.end)}`} right={<Pill tone={month.running ? 'wa' : 'ok'}>{month.running ? t('To date') : t('Final')}</Pill>}>
            <div className="rf cx-card cx-tcard">
              <MetricTable full view={total} keys={viewKeys(total, model)} {...ctx} />
              {reachMonth > 0 && reachSumWeeks > 0 && Math.round(reachMonth) !== Math.round(reachSumWeeks) && (
                <p className="hint">{t('Reach of the month ({a}) is counted for the whole month, not summed from the weeks ({b}): the same person is seen in several weeks.', { a: fmtValue('reach', reachMonth, 'number', undefined, lang), b: fmtValue('reach', reachSumWeeks, 'number', undefined, lang) })}</p>
              )}
            </div>
          </Sec>
          {hasTexts && (
            <Sec id="notes" icon="note" title={t('Notes from your manager')} nav={t('Notes')} sub={t('What we did, what we concluded and what is next')}>
              <NotesGrid view={total} />
            </Sec>
          )}
          {total.creatives?.length > 0 && (
            <Sec id="creatives" icon="image" title={t('Most effective creatives')} nav={t('Creatives')} sub={t('Ranked by ROAS')}>
              <Creatives items={total.creatives} heading={false} large />
            </Sec>
          )}
        </LangProvider>
      ) : (
        <div className="emp">{t('The summary of {month} appears here once the first week is approved and the month totals are calculated.', { month: monthName })}</div>
      )}
    </LangProvider>
  );
}
