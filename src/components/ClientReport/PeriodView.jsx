import { Box, HBars, Pill, PALETTE, Donut, Sec } from './kit';
import { Creatives, MetricTable, NotesGrid } from './parts';
import FunnelBox from './Funnel';
import { Kpis } from './MonthView';
import { LangProvider } from './langContext';
import { fmtValue, rangeText, roasBars, spendSlices, viewKeys } from '../../lib/clientReport';
import { trFor } from '../../lib/clientLang';

// The page of ONE custom report (a link made for it, /r/<token>): the result at a glance, the spend and ROAS by group, the funnel, the table with every metric (the whole width,
// no sideways scroll), the manager's notes and the creatives of the chosen dates. The period and the status are in the header of the page. Everything comes from the saved
// report; what the team hid with the eye is not in it.
export default function PeriodView({ view, model }) {
  const t = trFor(view.lang);
  const ctx = { custom: model.custom, platformLabel: model.platform === 'meta' ? 'Meta' : model.platform === 'google' ? 'Google' : '' };
  const hide = (key) => (view.hiddenMetrics || []).includes(key);
  const showRoas = view.kind !== 'leadgen' && !hide('roas');
  const slices = spendSlices(view).map((s, i) => ({ ...s, g: PALETTE[i % PALETTE.length] }));
  const bars = showRoas ? roasBars(view).map((b, i) => ({ label: b.label, short: b.short, stage: b.stage, full: b.full, value: b.value, text: fmtValue('roas', b.value, 'ratio', undefined, view.lang), g: PALETTE[i % PALETTE.length] })) : [];
  const spent = slices.reduce((a, s) => a + s.value, 0);
  const hasTexts = view.blocks.some((b) => String(view.sections?.[b.key] || '').trim());
  return (
    <LangProvider lang={view.lang}>
      <Sec id="overview" icon="spark" title={t('Overview')} sub={t('The result of the period at a glance')}>
        <Kpis view={view} />
      </Sec>
      {(slices.length > 0 || bars.length > 0) && (
        <Sec id="spend" icon="pie" title={t('Spend & ROAS')} sub={t('Where the budget went and what it returned')}>
          <div className="g2">
            {slices.length > 0 && <Box icon="pie" title={t('Spend by campaign group')}><div className="gx"><Donut slices={slices} center={fmtValue('spend', spent, 'money', view.currency, view.lang)} caption={t('ad spend')} fmt={(v) => fmtValue('spend', v, 'money', view.currency, view.lang)} /></div></Box>}
            {bars.length > 0 && <Box icon="bars" title={t('ROAS by campaign group')}><div className="gx"><HBars items={bars} /></div></Box>}
          </div>
        </Sec>
      )}
      <FunnelBox view={view} custom={model.custom} section />
      <Sec id="details" icon="file" title={t('Details')} nav={t('Details')} sub={`${t('Every metric by campaign group')} · ${rangeText(view.start, view.end)}`} right={<Pill tone="ok">{t('Final')}</Pill>}>
        <div className="rf cx-card cx-tcard"><MetricTable full view={view} keys={viewKeys(view, model)} {...ctx} /></div>
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
