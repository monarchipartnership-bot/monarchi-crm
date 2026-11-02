import { useState } from 'react';
import { Box, DeltaPill, GB, GP, HBars, Icon, Legend, Medallion, Pill, PALETTE, Wave, Donut, Sec } from './kit';
import { Creatives, MetricTable, NotesGrid } from './parts';
import FunnelBox from './Funnel';
import { LangProvider } from './langContext';
import { fmtValue, kpiCards, prevName, rangeText, roasBars, spendSlices, viewKeys } from '../../lib/clientReport';
import { monthNameIn, normLang, trFor } from '../../lib/clientLang';
import { computeMetric } from '../../lib/reportMetrics';

// The six numbers of a report: the main one on a plum card (revenue, for lead projects the leads) with the two that explain it, the rest in tiles. `all`: the team's view (nothing hidden).
export function Kpis({ view, all = false }) {
  const t = trFor(view.lang);
  const vs = prevName(view);
  const cards = kpiCards(view, { all });
  if (!cards.length) return null;
  const lead = view.kind === 'leadgen';
  const hero = cards.find((k) => k.key === (lead ? 'leads' : 'revenue')) || cards[0];
  const subs = (lead ? ['cpl', 'clicks'] : ['roas', 'purchases']).map((key) => cards.find((c) => c.key === key && c !== hero)).filter(Boolean);
  const rest = cards.filter((c) => c !== hero && !subs.includes(c));
  return (
    <div className={'cx-hero' + (rest.length ? '' : ' alone')}>
      <div className="cx-big">
        <small>{hero.label}</small>
        <b className="v">{hero.value}</b>
        {hero.change && <div className="cx-bd"><DeltaPill change={hero.change} /><span>{t('vs')} {vs}</span></div>}
        {subs.length > 0 && (
          <div className="cx-sub">
            {subs.map((k) => (
              <div key={k.key}><b>{k.value}</b><span>{k.label}{k.change ? ` ${k.change.arrow} ${k.change.pct}` : ''}</span></div>
            ))}
          </div>
        )}
      </div>
      {rest.length > 0 && (
        <div className="cx-tiles">
          {rest.map((k) => (
            <div className="rf mc" key={k.key}>
              <div className="mch"><Medallion icon={k.icon} cls="sm" /><div className="mct"><small>{k.label}</small><b className="v">{k.value}</b></div></div>
              <div className="mcf">{k.change && <><DeltaPill change={k.change} /><span className="sub">{t('vs')} {vs}</span></>}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// One approved week: a row that opens. It is drawn in its own report's language. The latest week is open.
function Week({ week, ctx, model, open: initial }) {
  const [open, setOpen] = useState(initial);
  const v = week.view;
  const t = trFor(v.lang);
  const hide = (key) => (v.hiddenMetrics || []).includes(key);
  const lead = v.kind === 'leadgen';
  const figs = (lead ? ['spend', 'leads', 'cpl'] : ['spend', 'roas', 'purchases']).filter((k) => !hide(k)).map((k) => {
    const val = computeMetric(k, v.total);
    return val == null ? null : { key: k, label: k === 'purchases' ? t('Sales') : k === 'spend' ? t('Spent') : k === 'roas' ? 'ROAS' : k === 'leads' ? t('Leads') : 'CPL', value: fmtValue(k, val, k === 'roas' ? 'ratio' : k === 'purchases' || k === 'leads' ? 'number' : 'money', v.currency, v.lang) };
  }).filter(Boolean);
  const hasTexts = v.blocks.some((b) => String(v.sections?.[b.key] || '').trim());
  return (
    <LangProvider lang={v.lang}>
      <section className={'rf cx-wk' + (open ? ' op' : '')}>
        <button type="button" className="cx-wkh" aria-expanded={open} aria-controls={`wk-${week.n}`} onClick={() => setOpen((o) => !o)}>
          <Medallion icon="cal" cls="sm" />
          <span className="cx-wkt"><b>{t('Week {n}', { n: week.n })}</b><small>{week.label}</small></span>
          <span className="cx-grow" />
          <span className="cx-figs">{figs.map((f) => <span className="cx-fg" key={f.key}><em>{f.label}</em><b>{f.value}</b></span>)}</span>
          <Pill tone="ok">{t('Approved')}</Pill>
          <span className="cx-chv"><Icon name="down" /></span>
        </button>
        {open && (
          <div className="cx-wkb" id={`wk-${week.n}`}>
            <MetricTable full view={v} keys={viewKeys(v, model)} {...ctx} />
            <FunnelBox view={v} custom={model.custom} />
            {hasTexts && <NotesGrid view={v} />}
            <Creatives items={v.creatives} large />
          </div>
        )}
      </section>
    </LangProvider>
  );
}

// A month: the six numbers, the charts, the weeks (each one opens) and the summary of the month with its notes and creatives.
export default function MonthView({ month, model }) {
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
          <Kpis view={total} />
        </Sec>
      )}
      {total && (wave || slices.length > 0) && (
        <Sec id="spend" icon="pie" title={t('Spend & ROAS')} sub={t('Where the budget went and what it returned')}>
          <div className={wave ? 'g3' : 'g2'}>
            {wave}
            {slices.length > 0 && <Box icon="pie" title={t('Spend by campaign group')}><div className="gx"><Donut slices={slices} center={fmtValue('spend', spent, 'money', total.currency, lang)} caption={t('ad spend')} fmt={(v) => fmtValue('spend', v, 'money', total.currency, lang)} /></div></Box>}
            {bars.length > 0 && <Box icon="bars" title={t('ROAS by campaign group')}><div className="gx"><HBars items={bars} /></div></Box>}
          </div>
        </Sec>
      )}
      {total && <FunnelBox view={total} custom={model.custom} section />}
      {month.weeks.length > 0 && (
        <Sec id="weeks" icon="cal" title={t('Weeks of {month}', { month: monthName })} nav={t('Weeks')} sub={t('Each approved week with its own numbers')}>
          <div className="cx-weeks">
            {month.weeks.map((w, i) => <Week key={w.n} week={w} ctx={ctx} model={model} open={i === month.weeks.length - 1 && !total} />)}
          </div>
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
