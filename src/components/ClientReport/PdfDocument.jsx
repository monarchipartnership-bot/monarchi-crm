import { HBars, Medallion, PALETTE, SpendRank, DeltaPill } from './kit';
import { Creatives, MetricTable, MonarchiLogo, TextCard } from './parts';
import FunnelBox from './Funnel';
import { LangProvider } from './langContext';
import { computeMetric } from '../../lib/reportMetrics';
import { dmy, fmtValue, kpiCards, prevName, rangeText, roasBars, spendSlices, viewKeys } from '../../lib/clientReport';
import { trFor } from '../../lib/clientLang';
import '../../styles/clientReportHub.css';
import '../../styles/clientReportDark.css';
import '../../styles/pdfReport.css';

// The downloaded PDF of a report (owner's picks 2026-11-18, decision 59): dark plum A4 pages built from the same parts as the client's page. The pages are drawn here and
// photographed one by one by lib/reportPdf.js. Order: the overview (a band on top, six tiles, the spend and ROAS of the groups), the funnel (only when the report has one),
// the table with every group on a landscape page, the creatives, the manager's notes. A page that has nothing to show is left empty and the exporter drops it.
const BLOCK_ICONS = { whatWasDone: 'note', conclusion: 'check', plans: 'arrow' };
const EXTRA_ICONS = ['layers', 'spark', 'stat', 'alert'];

function PSec({ icon, title, sub }) {
  return (
    <div className="cx-sh pdf-sh">
      <Medallion icon={icon} cls="sm" />
      <div><h2>{title}</h2>{sub && <small>{sub}</small>}</div>
    </div>
  );
}

// One of the six numbers: the value, the change against the previous period and two small bars (before / now) when there is something to compare with.
function Tile({ k, view, t }) {
  const cur = computeMetric(k.key, view.total);
  const prev = view.prev ? computeMetric(k.key, view.prev.total) : null;
  const mx = Math.max(Number(cur) || 0, Number(prev) || 0, 1);
  const has = view.prev && Number.isFinite(Number(cur)) && Number.isFinite(Number(prev));
  return (
    <div className="pdf-tile">
      <span className="lb">{k.label}</span>
      <b className="v">{k.value}</b>
      {k.change ? <span className="dd"><DeltaPill change={k.change} /><span>{t('vs')} {prevName(view)}</span></span> : <span className="dd" />}
      {has && (
        <span className="cmp" aria-hidden="true">
          <i className="was" style={{ width: `${Math.max(4, (Number(prev) / mx) * 100)}%` }} />
          <i className="now" style={{ width: `${Math.max(4, (Number(cur) / mx) * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

export default function PdfDocument({ view, projectName, platformLabel, custom = [], columns = [], kind }) {
  const lang = view.lang;
  const t = trFor(lang);
  const model = { kind: kind || view.kind, columns, custom };
  const ctx = { custom, platformLabel: platformLabel === 'Meta Ads' ? 'Meta' : platformLabel === 'Google Ads' ? 'Google' : '' };
  const range = rangeText(view.start, view.end);
  const typeLabel = t(view.type === 'monthly' ? 'Monthly report' : view.type === 'weekly' ? 'Weekly report' : 'Custom period');
  const lead = view.kind === 'leadgen';
  const showRoas = !lead;
  const cards = kpiCards(view, { all: true });
  const slices = spendSlices(view).map((s, i) => ({ ...s, g: PALETTE[i % PALETTE.length] }));
  const bars = showRoas ? roasBars(view).map((b, i) => ({ label: b.label, short: b.short, stage: b.stage, full: b.full, value: b.value, text: fmtValue('roas', b.value, 'ratio', undefined, lang), g: PALETTE[i % PALETTE.length] })) : [];
  const spent = slices.reduce((a, s) => a + s.value, 0);
  const money = (v) => fmtValue('spend', v, 'money', view.currency, lang);
  let extra = 0;
  const notes = view.blocks.filter((b) => String(view.sections?.[b.key] || '').trim()).map((b) => {
    const icon = BLOCK_ICONS[b.key] || EXTRA_ICONS[extra++ % EXTRA_ICONS.length];
    return <TextCard key={b.key} icon={icon} title={b.title} text={view.sections[b.key]} />;
  });
  const asOf = view.updatedAt ? dmy(String(view.updatedAt).slice(0, 10)) : dmy(view.end);

  const Header = ({ title }) => (
    <div className="pdf-hdr">
      <div className="nm">
        <b>{title || projectName}</b>
        <small>{title ? `${projectName} · ${range}` : `${t('Advertising report')} · ${typeLabel} · ${range}`}</small>
      </div>
      <span className="plb">{platformLabel}</span>
      <span className="grow" />
      <MonarchiLogo />
    </div>
  );
  const Footer = () => (
    <div className="pdf-ft">
      <span>{projectName} · {platformLabel} · {range}</span>
      <span>{t('Data as of')} {asOf} · <b className="pdf-pn" data-t={t('Page {n} of {N}')} /></span>
    </div>
  );

  return (
    <LangProvider lang={lang}>
      <div className="crh crp pdfd">
        <section className="pdfp" data-pdf-page>
          <Header />
          <PSec icon="spark" title={t('Overview')} sub={`${t('The result of the period at a glance')}${view.prev ? ` · ${t('vs')} ${prevName(view)}` : ''}`} />
          <div className="pdf-tiles">{cards.map((k) => <Tile key={k.key} k={k} view={view} t={t} />)}</div>
          {(slices.length > 0 || bars.length > 0) && (
            <>
              <PSec icon="pie" title={t('Spend & ROAS')} sub={t('Where the budget went and what it returned')} />
              <div className="pdf-two">
                {slices.length > 0 && <div className="rf pdf-card"><p className="ct">{t('Spend by campaign group')} · {money(spent)}</p><SpendRank slices={slices} fmt={money} /></div>}
                {bars.length > 0 && <div className="rf pdf-card"><p className="ct">{t('ROAS by campaign group')}</p><HBars items={bars} /></div>}
              </div>
            </>
          )}
          <Footer />
        </section>

        <section className="pdfp" data-pdf-page data-pdf-optional>
          <Header title={t('Funnel')} />
          <FunnelBox view={view} custom={custom} />
          <Footer />
        </section>

        <section className="pdfp land" data-pdf-page>
          <Header title={t('Every metric, group by group')} />
          <div className="rf pdf-card pdf-table"><MetricTable full view={view} keys={viewKeys(view, model, { all: true })} {...ctx} /></div>
          <Footer />
        </section>

        <section className="pdfp" data-pdf-page data-pdf-optional data-pdf-kind="creatives" data-pdf-merged-title={t('Creatives and notes')}>
          <Header title={t('Most effective creatives')} />
          {view.creatives?.length > 0 && (
            <>
              <PSec icon="image" title={t('Most effective creatives')} sub={t('Ranked by ROAS')} />
              <Creatives items={view.creatives} heading={false} large />
            </>
          )}
          <Footer />
        </section>

        <section className="pdfp" data-pdf-page data-pdf-optional data-pdf-kind="notes">
          <Header title={t('Notes from your manager')} />
          {notes.length > 0 && (
            <>
              <PSec icon="note" title={t('Notes from your manager')} sub={t('What we did, what we concluded and what is next')} />
              <div className="pdf-notes">{notes}</div>
            </>
          )}
          <Footer />
        </section>
      </div>
    </LangProvider>
  );
}
