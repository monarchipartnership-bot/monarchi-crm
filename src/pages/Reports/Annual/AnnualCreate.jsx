import { useEffect, useRef, useState } from 'react';
import MonthlyChannelBlock from '../../../components/Reports/Monthly/MonthlyChannelBlock';
import MonthlyFinanceSection from '../../../components/Reports/Monthly/MonthlyFinanceSection';
import MonthGrid from '../../../components/Reports/Annual/MonthGrid';
import MonthDetailModal from '../../../components/Reports/Annual/MonthDetailModal';
import TrendBlock from '../../../components/Reports/Annual/TrendBlock';
import LineChart from '../../../components/Reports/Annual/LineChart';
import FunnelChart from '../../../components/Reports/Annual/FunnelChart';
import ChannelEfficiencyCard from '../../../components/Reports/Annual/ChannelEfficiencyCard';
import ChannelDetailTable from '../../../components/Reports/Annual/ChannelDetailTable';
import BarChart from '../../../components/Reports/Weekly/BarChart';
import DonutChart from '../../../components/Automation/DonutChart';
import Sparkline from '../../../components/Automation/Sparkline';
import DeltaBadge from '../../../components/Automation/DeltaBadge';
import { fetchMonthsForYear, saveAnnualReport } from '../../../lib/api/annualReports';
import {
  computeAnnualSums, monthSumVal, monthRatioVal, monthFinVal, monthCostLineVal, monthValuesFor,
  channelList, outreachId, qualifiedId, contractsId, leadsId, outreachChannels, computeClientTypeBreakdown,
} from '../../../lib/annualLogic';
import { CHANNELS, LI_CHANNEL, COST_ITEMS, INCOME_FIELDS, pct, moneyFmt } from '../../../lib/weeklyLogic';
import { CLIENT_PLATFORMS } from '../../../lib/reportConstants';
import { exportPDF, exportJPEG } from '../../../lib/exportHelpers';
import { SECTION_ICONS, CHANNEL_ICONS, metricIcon } from '../../../lib/reportIcons';
import fiverrLogo from '../../../assets/logos/fiverr.png';
import linkedinLogo from '../../../assets/logos/linkedin.png';
import facebookLogo from '../../../assets/logos/facebook.png';
import instagramLogo from '../../../assets/logos/instagram.png';
import redditLogo from '../../../assets/logos/reddit.png';
import '../../../styles/reportPage.css';
import '../../../styles/comparePage.css';
import '../../../styles/annualPage.css';
import '../../../styles/automationDashboard.css';
import '../../../styles/automationTasksPage.css';

const WALLET_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M3 10h18"/><circle cx="16" cy="14" r="1.2"/></svg>';
const SHIELD_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6z"/></svg>';
const DONUT_COLORS = ['#6B2FA0', '#1E9E5D', '#B8860B', '#2F6FED', '#D14343'];

// Same "Upwork" (CHANNELS) / "Інші платформи" tab split already used in
// Weekly/Monthly Report — only LinkedIn has a real data model wired up so
// far, the rest show a stub.
const OTHER_PLATFORMS = CLIENT_PLATFORMS.filter((p) => p !== 'Upwork');
const OTHER_PLATFORM_LOGOS = { Fiverr: fiverrLogo, LinkedIn: linkedinLogo, Facebook: facebookLogo, Instagram: instagramLogo, Reddit: redditLogo };
const GENERIC_PLATFORM_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>';

// Дохід/Витрати/Підсумок trend blocks, tab-switched the same way as the
// channel blocks above instead of stacked one after another.
const FINANCE_TRENDS = [
  { key: 'income', label: 'Дохід', icon: WALLET_ICON },
  { key: 'profiles', label: 'Профілі Upwork', icon: SECTION_ICONS.Upwork },
  { key: 'mb', label: 'Manual Bidding', icon: CHANNEL_ICONS.mb },
  { key: 'gm', label: 'GetMany', icon: CHANNEL_ICONS.gm },
  { key: 'li', label: 'LinkedIn', icon: CHANNEL_ICONS.li },
  { key: 'summary', label: 'Підсумок', icon: SECTION_ICONS.Фінанси },
];

function initialYear() {
  return new Date().getFullYear();
}

function relPctDelta(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

function ppDelta(cur, prev) {
  if (cur === null || prev === null) return null;
  return Math.round((cur - prev) * 10) / 10;
}

export default function AnnualCreate() {
  const pageRef = useRef(null);

  const [year, setYear] = useState(initialYear);
  const [monthsByIndex, setMonthsByIndex] = useState({});
  const [prevMonthsByIndex, setPrevMonthsByIndex] = useState({});
  const [statusLabel, setStatusLabel] = useState('—');
  const [modalMonth, setModalMonth] = useState(null);
  const [activeEffChannel, setActiveEffChannel] = useState(CHANNELS[0].key);
  const [activeEffPlatform, setActiveEffPlatform] = useState('LinkedIn');
  const [activeSummaryChannel, setActiveSummaryChannel] = useState(CHANNELS[0].key);
  const [activeSummaryPlatform, setActiveSummaryPlatform] = useState('LinkedIn');
  const [activeTrendChannel, setActiveTrendChannel] = useState(CHANNELS[0].key);
  const [activeTrendPlatform, setActiveTrendPlatform] = useState('LinkedIn');
  const [activeFinanceTrend, setActiveFinanceTrend] = useState('income');
  const [capturing, setCapturing] = useState(false);
  const [exportingJPEG, setExportingJPEG] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Annual has no manually-edited fields — everything is derived from the
  // year's monthly reports, so "autosave" just means re-snapshotting
  // whenever the underlying months change (no debounce needed, no typing).
  // Last year is also fetched here (read-only, never saved) purely to
  // compute the YoY badges on the overview cards.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatusLabel('Завантаження…');
      const [byMonth, prevByMonth] = await Promise.all([fetchMonthsForYear(year), fetchMonthsForYear(year - 1)]);
      if (cancelled) return;
      setMonthsByIndex(byMonth);
      setPrevMonthsByIndex(prevByMonth);

      const { sums, ratioPct, fin } = computeAnnualSums(byMonth);
      const monthsFound = Object.keys(byMonth).length;
      const monthsPresent = Object.keys(byMonth).map(Number).sort((a, b) => a - b);
      try {
        setStatusLabel('Зберігається...');
        const data = {
          _type: 'monarchi_annual_report',
          _version: 1,
          sums, ratioPct, finance: fin,
          months_found: monthsFound, months_total: 12, months_present: monthsPresent,
        };
        await saveAnnualReport({ year, monthsFound, data });
        if (cancelled) return;
        setStatusLabel('Збережено ' + new Date().toLocaleString('uk-UA'));
      } catch (e) {
        if (cancelled) return;
        console.warn('autosave failed', e);
        setStatusLabel('Помилка збереження');
      }
    })();
    return () => { cancelled = true; };
  }, [year]);

  const { sums, ratioPct, fin } = computeAnnualSums(monthsByIndex);
  const { sums: prevSums, fin: prevFin } = computeAnnualSums(prevMonthsByIndex);
  const monthsFound = Object.keys(monthsByIndex).length;

  const channels = channelList();
  const outreachCh = outreachChannels();
  const totalOutreach = outreachCh.reduce((s, c) => s + (sums[outreachId(c)] || 0), 0);
  const totalLeads = channels.reduce((s, c) => s + (sums[leadsId(c)] || 0), 0);
  const totalQualified = channels.reduce((s, c) => s + (sums[qualifiedId(c)] || 0), 0);
  const totalContracts = channels.reduce((s, c) => s + (sums[contractsId(c)] || 0), 0);
  const conversion = pct(totalContracts, totalLeads);

  const prevTotalOutreach = outreachCh.reduce((s, c) => s + (prevSums[outreachId(c)] || 0), 0);
  const prevTotalLeads = channels.reduce((s, c) => s + (prevSums[leadsId(c)] || 0), 0);
  const prevTotalQualified = channels.reduce((s, c) => s + (prevSums[qualifiedId(c)] || 0), 0);
  const prevTotalContracts = channels.reduce((s, c) => s + (prevSums[contractsId(c)] || 0), 0);
  const prevConversion = pct(prevTotalContracts, prevTotalLeads);

  const clientTypes = computeClientTypeBreakdown(monthsByIndex);

  async function handleExportJPEG() {
    await exportJPEG(pageRef.current, `annual_report_${year}.jpg`, {
      onStart: () => { setExportingJPEG(true); setCapturing(true); },
      onEnd: () => { setExportingJPEG(false); setCapturing(false); },
    });
  }

  const costGroupTrend = (items) => items.map((it) => ({ label: it.label, values: monthValuesFor(monthsByIndex, (mi, m) => monthCostLineVal(mi, m, it)) }));

  const leadsPerMonth = monthValuesFor(monthsByIndex, (mi, m) => channels.reduce((s, c) => s + (monthSumVal(mi, m, leadsId(c)) || 0), 0));
  const contractsPerMonth = monthValuesFor(monthsByIndex, (mi, m) => channels.reduce((s, c) => s + (monthSumVal(mi, m, contractsId(c)) || 0), 0));

  return (
    <div className="report-page annual-report-page" ref={pageRef}>
      <section className="rpt-hero">
        <div className="rpt-hero-top-row">
          <div className="rpt-hero-heading">
            <span className="rpt-hero-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Річні підсумки'] }} />
            <h1>Annual Report</h1>
          </div>
          <div className="week-period-picker">
            <div className="wk-field-box">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Місяці'] }} />
              <div className="wk-field-body">
                <label>Рік</label>
                <select value={year} onChange={(e) => setYear(+e.target.value)}>
                  {[year - 3, year - 2, year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="week-toolbar-row">
        <div className="week-toolbar-left">
          <div className="wk-field-box">
            <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Місяці'] }} />
            <div className="wk-field-body">
              <label>Місяців знайдено</label>
              <div className="weeks-badge">{monthsFound} з 12</div>
            </div>
          </div>
        </div>
        <div className="week-toolbar-right">
          <div className="save-state">{statusLabel}</div>
          {!capturing && (
            <div className="export-menu-wrap">
              <button type="button" className="btn" onClick={() => setExportMenuOpen((o) => !o)}>&#8595; Експорт</button>
              {exportMenuOpen && (
                <div className="export-menu">
                  <button type="button" onClick={() => { setExportMenuOpen(false); exportPDF(); }}>Завантажити PDF</button>
                  <button type="button" disabled={exportingJPEG} onClick={() => { setExportMenuOpen(false); handleExportJPEG(); }}>
                    {exportingJPEG ? '...' : 'Завантажити JPEG'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="dash-kpi-row">
        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: metricIcon('Cover Letter') }} />
            <div className="dash-kpi-label">Cover Letters</div>
          </div>
          <div className="dash-kpi-value">{totalOutreach}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(totalOutreach, prevTotalOutreach)} suffix="%" /> vs {year - 1}</div>
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: metricIcon('Answers') }} />
            <div className="dash-kpi-label">Ліди</div>
          </div>
          <div className="dash-kpi-value">{totalLeads}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(totalLeads, prevTotalLeads)} suffix="%" /> vs {year - 1}</div>
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Виконано за день'] }} />
            <div className="dash-kpi-label">Кваліфіковані ліди</div>
          </div>
          <div className="dash-kpi-value">{totalQualified}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(totalQualified, prevTotalQualified)} suffix="%" /> vs {year - 1}</div>
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS.Upwork }} />
            <div className="dash-kpi-label">Договори</div>
          </div>
          <div className="dash-kpi-value">{totalContracts}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(totalContracts, prevTotalContracts)} suffix="%" /> vs {year - 1}</div>
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS.Фінанси }} />
            <div className="dash-kpi-label">Виручка</div>
          </div>
          <div className="dash-kpi-value">{moneyFmt(fin.total_inc)}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(fin.total_inc, prevFin.total_inc)} suffix="%" /> vs {year - 1}</div>
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Тренди за місяцями'] }} />
            <div className="dash-kpi-label">Прибуток</div>
          </div>
          <div className="dash-kpi-value">{fin.profit >= 0 ? '+' : ''}{moneyFmt(fin.profit)}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(fin.profit, prevFin.profit)} suffix="%" /> vs {year - 1}</div>
        </div>
        <div className="dash-kpi">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Плани на завтра'] }} />
            <div className="dash-kpi-label">Конверсія в угоди</div>
          </div>
          <div className="dash-kpi-value">{conversion === null ? '—' : conversion.toFixed(1) + '%'}</div>
          <div className="dash-kpi-sub"><DeltaBadge diff={ppDelta(conversion, prevConversion)} suffix="%" /> vs {year - 1}</div>
        </div>
      </div>

      <section className="report-section">
        <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Місяці'] }} />Місяці</div>
        <MonthGrid monthsByIndex={monthsByIndex} onOpenMonth={setModalMonth} />
      </section>

      <section className="report-section">
        <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS.Upwork }} />Ефективність каналів</div>

        <div className="chan-tabs">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={'chan-tab' + (c.key === activeEffChannel ? ' active' : '')}
              onClick={() => setActiveEffChannel(c.key)}
            >
              <span dangerouslySetInnerHTML={{ __html: CHANNEL_ICONS[c.key] }} />
              {c.title}
            </button>
          ))}
        </div>
        <ChannelEfficiencyCard channel={CHANNELS.find((c) => c.key === activeEffChannel) || CHANNELS[0]} sums={sums} />

        <div className="chan-tabs eff-platform-tabs">
          {OTHER_PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              className={'chan-tab' + (p === activeEffPlatform ? ' active' : '')}
              onClick={() => setActiveEffPlatform(p)}
            >
              {OTHER_PLATFORM_LOGOS[p] ? (
                <img src={OTHER_PLATFORM_LOGOS[p]} alt="" className="chan-tab-logo" />
              ) : (
                <span dangerouslySetInnerHTML={{ __html: GENERIC_PLATFORM_ICON }} />
              )}
              {p}
            </button>
          ))}
        </div>
        {activeEffPlatform === 'LinkedIn' ? (
          <ChannelEfficiencyCard channel={LI_CHANNEL} sums={sums} />
        ) : (
          <div className="empty-state">
            <p>Розділ «{activeEffPlatform}» у розробці — показники для цієї платформи буде додано пізніше.</p>
          </div>
        )}
      </section>

      <section className="report-section">
        <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS.Upwork }} />Upwork</div>
        <div className="chan-tabs">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={'chan-tab' + (c.key === activeSummaryChannel ? ' active' : '')}
              onClick={() => setActiveSummaryChannel(c.key)}
            >
              <span dangerouslySetInnerHTML={{ __html: CHANNEL_ICONS[c.key] }} />
              {c.title}
            </button>
          ))}
        </div>
        <MonthlyChannelBlock channel={CHANNELS.find((c) => c.key === activeSummaryChannel) || CHANNELS[0]} sums={sums} ratioPct={ratioPct} />
      </section>

      <section className="report-section">
        <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS.LinkedIn }} />Інші платформи</div>
        <div className="chan-tabs">
          {OTHER_PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              className={'chan-tab' + (p === activeSummaryPlatform ? ' active' : '')}
              onClick={() => setActiveSummaryPlatform(p)}
            >
              {OTHER_PLATFORM_LOGOS[p] ? (
                <img src={OTHER_PLATFORM_LOGOS[p]} alt="" className="chan-tab-logo" />
              ) : (
                <span dangerouslySetInnerHTML={{ __html: GENERIC_PLATFORM_ICON }} />
              )}
              {p}
            </button>
          ))}
        </div>
        {activeSummaryPlatform === 'LinkedIn' ? (
          <MonthlyChannelBlock channel={LI_CHANNEL} sums={sums} ratioPct={ratioPct} />
        ) : (
          <div className="empty-state">
            <p>Розділ «{activeSummaryPlatform}» у розробці — показники для цієї платформи буде додано пізніше.</p>
          </div>
        )}
      </section>

      <section className="report-section">
        <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS.Фінанси }} />Фінанси</div>

        <div className="dash-kpi-row fin-kpi-row">
          <div className="dash-kpi">
            <div className="dash-kpi-head">
              <span className="dash-kpi-icon fin-kpi-icon green" dangerouslySetInnerHTML={{ __html: WALLET_ICON }} />
              <div className="dash-kpi-label">Доходи</div>
            </div>
            <div className="dash-kpi-value">{moneyFmt(fin.total_inc)}</div>
            <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(fin.total_inc, prevFin.total_inc)} suffix="%" /> vs {year - 1}</div>
            <Sparkline values={monthValuesFor(monthsByIndex, monthFinVal, 'total_inc')} color="var(--ok)" />
          </div>
          <div className="dash-kpi">
            <div className="dash-kpi-head">
              <span className="dash-kpi-icon fin-kpi-icon red" dangerouslySetInnerHTML={{ __html: SHIELD_ICON }} />
              <div className="dash-kpi-label">Витрати</div>
            </div>
            <div className="dash-kpi-value">{moneyFmt(Math.abs(fin.all_total))}</div>
            <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(Math.abs(fin.all_total), Math.abs(prevFin.all_total))} suffix="%" /> vs {year - 1}</div>
            <Sparkline values={monthValuesFor(monthsByIndex, monthFinVal, 'all_total').map((v) => (v === null ? null : Math.abs(v)))} color="var(--bad)" />
          </div>
          <div className="dash-kpi">
            <div className="dash-kpi-head">
              <span className="dash-kpi-icon fin-kpi-icon purple" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Тренди за місяцями'] }} />
              <div className="dash-kpi-label">Прибуток</div>
            </div>
            <div className="dash-kpi-value">{fin.profit >= 0 ? '+' : ''}{moneyFmt(fin.profit)}</div>
            <div className="dash-kpi-sub"><DeltaBadge diff={relPctDelta(fin.profit, prevFin.profit)} suffix="%" /> vs {year - 1}</div>
            <Sparkline values={monthValuesFor(monthsByIndex, monthFinVal, 'profit')} color="var(--purple)" />
          </div>
        </div>

        <MonthlyFinanceSection sums={sums} fin={fin} />
      </section>

      <section className="report-section">
        <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Тренди за місяцями'] }} />Огляд</div>
        <div className="annual-chart-grid">
          <div className="cmp-block">
            <div className="cmp-block-head"><span>Тренд лідів помісячно</span></div>
            <div className="cmp-block-body"><LineChart series={[{ label: 'Ліди', values: leadsPerMonth }]} /></div>
          </div>
          <div className="cmp-block">
            <div className="cmp-block-head"><span>Тренд договорів помісячно</span></div>
            <div className="cmp-block-body"><LineChart series={[{ label: 'Договори', values: contractsPerMonth }]} /></div>
          </div>
          <div className="cmp-block">
            <div className="cmp-block-head"><span>Порівняння каналів за лідами</span></div>
            <div className="cmp-block-body">
              <BarChart labels={channels.map((c) => c.title)} series={[{ label: 'Ліди', data: channels.map((c) => sums[leadsId(c)] || 0) }]} />
            </div>
          </div>
          <div className="cmp-block">
            <div className="cmp-block-head"><span>Конверсія по каналах</span></div>
            <div className="cmp-block-body">
              <BarChart labels={channels.map((c) => c.title)} series={[{ label: 'Конверсія %', data: channels.map((c) => pct(sums[contractsId(c)] || 0, sums[leadsId(c)] || 0) || 0) }]} />
            </div>
          </div>
          <div className="cmp-block">
            <div className="cmp-block-head"><span>Конверсія по воронці</span></div>
            <div className="cmp-block-body">
              <FunnelChart stages={[{ label: 'Ліди', value: totalLeads }, { label: 'Кваліфіковано', value: totalQualified }, { label: 'Договори', value: totalContracts }]} />
            </div>
          </div>
          <div className="cmp-block">
            <div className="cmp-block-head"><span>Типи клієнтів</span></div>
            <div className="cmp-block-body">
              <DonutChart slices={[
                ...Object.entries(clientTypes.counts).map(([label, value], i) => ({ label, value, color: DONUT_COLORS[i % DONUT_COLORS.length] })),
                ...(clientTypes.other > 0 ? [{ label: 'Інше', value: clientTypes.other, color: '#8B8094' }] : []),
              ]} />
            </div>
          </div>
          <div className="cmp-block">
            <div className="cmp-block-head"><span>Дохід за каналами</span></div>
            <div className="cmp-block-body">
              <DonutChart slices={INCOME_FIELDS.map((f, i) => ({ label: f.label, value: sums[f.id] || 0, color: DONUT_COLORS[i % DONUT_COLORS.length] }))} />
            </div>
          </div>
          <div className="cmp-block">
            <div className="cmp-block-head"><span>Фінансовий тренд</span></div>
            <div className="cmp-block-body">
              <LineChart series={[
                { label: 'Дохід', values: monthValuesFor(monthsByIndex, monthFinVal, 'total_inc') },
                { label: 'Витрати', values: monthValuesFor(monthsByIndex, monthFinVal, 'all_total').map((v) => (v === null ? null : Math.abs(v))) },
                { label: 'Прибуток', values: monthValuesFor(monthsByIndex, monthFinVal, 'profit') },
              ]} />
            </div>
          </div>
        </div>
      </section>

      <section className="report-section">
        <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Тренди за місяцями'] }} />Тренди за місяцями</div>

        <div className="chan-tabs">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={'chan-tab' + (c.key === activeTrendChannel ? ' active' : '')}
              onClick={() => setActiveTrendChannel(c.key)}
            >
              <span dangerouslySetInnerHTML={{ __html: CHANNEL_ICONS[c.key] }} />
              {c.title}
            </button>
          ))}
        </div>
        {(() => {
          const c = CHANNELS.find((c) => c.key === activeTrendChannel) || CHANNELS[0];
          return (
            <div>
              <TrendBlock
                title={`${c.title} — Показники за місяцями`}
                series={c.metrics.map((m) => ({ label: m.label, values: monthValuesFor(monthsByIndex, monthSumVal, m.id) }))}
                unit="count"
              />
              <TrendBlock
                title={`${c.title} — Конверсія за місяцями`}
                series={c.ratios.map((r) => ({ label: r.label, values: monthValuesFor(monthsByIndex, monthRatioVal, r.pp.replace('pp_', '')) }))}
                unit="pct"
              />
            </div>
          );
        })()}

        <div className="chan-tabs eff-platform-tabs">
          {OTHER_PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              className={'chan-tab' + (p === activeTrendPlatform ? ' active' : '')}
              onClick={() => setActiveTrendPlatform(p)}
            >
              {OTHER_PLATFORM_LOGOS[p] ? (
                <img src={OTHER_PLATFORM_LOGOS[p]} alt="" className="chan-tab-logo" />
              ) : (
                <span dangerouslySetInnerHTML={{ __html: GENERIC_PLATFORM_ICON }} />
              )}
              {p}
            </button>
          ))}
        </div>
        {activeTrendPlatform === 'LinkedIn' ? (
          <>
            <TrendBlock
              title="LinkedIn — Показники за місяцями"
              series={LI_CHANNEL.metrics.map((m) => ({ label: m.label, values: monthValuesFor(monthsByIndex, monthSumVal, m.id) }))}
              unit="count"
            />
            <TrendBlock
              title="LinkedIn — Конверсія за місяцями"
              series={LI_CHANNEL.ratios.map((r) => ({ label: r.label, values: monthValuesFor(monthsByIndex, monthRatioVal, r.pp.replace('pp_', '')) }))}
              unit="pct"
            />
          </>
        ) : (
          <div className="empty-state">
            <p>Розділ «{activeTrendPlatform}» у розробці — показники для цієї платформи буде додано пізніше.</p>
          </div>
        )}

        <div className="chan-tabs eff-platform-tabs">
          {FINANCE_TRENDS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={'chan-tab' + (f.key === activeFinanceTrend ? ' active' : '')}
              onClick={() => setActiveFinanceTrend(f.key)}
            >
              <span dangerouslySetInnerHTML={{ __html: f.icon }} />
              {f.label}
            </button>
          ))}
        </div>
        {activeFinanceTrend === 'income' && (
          <TrendBlock
            title="Дохід за місяцями"
            series={[
              { label: 'Manual Bidding Income', values: monthValuesFor(monthsByIndex, monthFinVal, 'mb_income') },
              { label: 'Organic Leads Income', values: monthValuesFor(monthsByIndex, monthFinVal, 'ol_income') },
              { label: 'GetMany Income', values: monthValuesFor(monthsByIndex, monthFinVal, 'gm_income') },
              { label: 'LinkedIn Income', values: monthValuesFor(monthsByIndex, monthFinVal, 'li_income') },
              { label: 'Total Income', values: monthValuesFor(monthsByIndex, monthFinVal, 'total_inc') },
            ]}
            unit="money"
          />
        )}
        {activeFinanceTrend === 'profiles' && <TrendBlock title="Витрати — профілі Upwork за місяцями" series={costGroupTrend(COST_ITEMS.profiles)} unit="money" />}
        {activeFinanceTrend === 'mb' && <TrendBlock title="Витрати — Manual Bidding за місяцями" series={costGroupTrend(COST_ITEMS.mb)} unit="money" />}
        {activeFinanceTrend === 'gm' && <TrendBlock title="Витрати — GetMany за місяцями" series={costGroupTrend(COST_ITEMS.gm)} unit="money" />}
        {activeFinanceTrend === 'li' && <TrendBlock title="Витрати — LinkedIn за місяцями" series={costGroupTrend(COST_ITEMS.li)} unit="money" />}
        {activeFinanceTrend === 'summary' && (
          <TrendBlock
            title="Підсумок за місяцями"
            series={[
              { label: 'Витрати Профілі', values: monthValuesFor(monthsByIndex, monthFinVal, 'profiles_total') },
              { label: 'Витрати MB', values: monthValuesFor(monthsByIndex, monthFinVal, 'mb_total') },
              { label: 'Витрати GM', values: monthValuesFor(monthsByIndex, monthFinVal, 'gm_total') },
              { label: 'Витрати LI', values: monthValuesFor(monthsByIndex, monthFinVal, 'li_total') },
              { label: 'Total Витрати', values: monthValuesFor(monthsByIndex, monthFinVal, 'all_total') },
              { label: 'Total Income', values: monthValuesFor(monthsByIndex, monthFinVal, 'total_inc') },
              { label: 'Прибуток', values: monthValuesFor(monthsByIndex, monthFinVal, 'profit') },
            ]}
            unit="money"
          />
        )}
      </section>

      <section className="report-section">
        <div className="stitle"><span className="stitle-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Річні підсумки'] }} />Деталізація по каналам</div>
        <ChannelDetailTable monthsByIndex={monthsByIndex} />
      </section>

      {modalMonth !== null && (
        <MonthDetailModal month={modalMonth} year={year} row={monthsByIndex[modalMonth]} onClose={() => setModalMonth(null)} />
      )}
    </div>
  );
}
