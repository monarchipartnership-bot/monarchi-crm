import { useMemo, useRef, useState } from 'react';
import { ReportMetricsTable, GroupsTable, metricsToExport, groupsToExport } from './ReportTables';
import ExportMenu from './ExportMenu';
import { combinePlatforms, metricRows, visibleKeys } from '../../../lib/periodReport';
import { METRIC_SETS, computeMetric, formatMetric, metricMeta } from '../../../lib/reportMetrics';
import { platformInfo } from '../../../lib/adAccounts';

// A fetched period shown as tables: a switcher (each platform + the sum of them
// when they share a currency), the metrics table with the comparison, the
// campaign-group columns (or the plain campaign list when no groups are set up)
// and the download menu. `data` = { platforms: {meta|google: { currency, total, campaigns, groups }}, previous?: { platforms } }.
// campaignMode: 'all' (analysis screen: every campaign is shown) or 'selected' (report
// builder: only the campaigns ticked in the picker go into the report and its downloads).
export const campaignKey = (platform, name) => `${platform}|${name}`;

export default function ResultView({ data, kind, custom, title, subtitle, fileBase, prevLabel, curLabel, children, campaignMode = 'all', selection = [], onSelectionChange }) {
  const platformKeys = Object.keys(data.platforms);
  const combined = useMemo(() => combinePlatforms(data.platforms), [data]);
  const prevCombined = useMemo(() => (data.previous ? combinePlatforms(data.previous.platforms) : null), [data]);
  const tabs = [...platformKeys.map((k) => ({ key: k, label: platformInfo(k).label })), ...(combined ? [{ key: 'total', label: 'Разом' }] : [])];
  const [tab, setTab] = useState(tabs[0]?.key);
  const active = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key;
  const captureRef = useRef(null);

  const keys = useMemo(() => visibleKeys(METRIC_SETS[kind], custom), [kind, custom]);

  if (!tabs.length) return null;

  const isTotal = active === 'total';
  const cur = isTotal ? combined : data.platforms[active];
  const prevSrc = isTotal ? prevCombined : data.previous?.platforms?.[active];
  const currency = cur.currency;
  const rows = metricRows(keys, cur.total, prevSrc?.total, custom, currency);
  const showPrev = Boolean(data.previous);
  const groups = isTotal ? [] : cur.groups || [];
  const campaigns = isTotal ? [] : [...(cur.campaigns || [])].sort((a, b) => (b.spend || 0) - (a.spend || 0));
  const shownCampaigns = campaignMode === 'all' ? campaigns : campaigns.filter((c) => selection.includes(campaignKey(active, c.name)));

  const metricsExport = metricsToExport(rows, showPrev);
  const sheets = [{ name: 'Показники', ...metricsExport }];
  if (groups.length) sheets.push({ name: 'Групи кампаній', ...groupsToExport(keys, cur.total, groups, custom, currency) });
  if (shownCampaigns.length) sheets.push({ name: 'Кампанії', ...campaignExport(shownCampaigns, kind, custom, currency) });
  const tabLabel = tabs.find((t) => t.key === active)?.label;

  return (
    <div className="prep-result">
      <div className="prep-result-bar">
        <div className="pacc-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={t.key === active} className={'pacc-tab' + (t.key === active ? ' on' : '')} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
        <div className="prep-result-actions">
          {children}
          <ExportMenu model={{ title, sheets }} targetRef={captureRef} fileBase={`${fileBase}_${tabLabel}`} />
        </div>
      </div>

      <div className="prep-capture" ref={captureRef}>
        <div className="prep-capture-head">
          <div className="prep-capture-title">{title}</div>
          <div className="prep-capture-sub">{subtitle} · {tabLabel}{cur.accountName ? ` · ${cur.accountName}` : ''}</div>
        </div>
        <ReportMetricsTable rows={rows} showPrev={showPrev} curLabel={curLabel} prevLabel={prevLabel} />
        {isTotal && <div className="pacc-hint">Сума платформ в одній валюті. Охоплення складається простою сумою, тож люди, яких побачили обидві платформи, враховані двічі.</div>}
        {groups.length > 0 && (
          <>
            <div className="prep-subtitle">По групах кампаній</div>
            <GroupsTable keys={keys} total={cur.total} groups={groups} custom={custom} currency={currency} />
          </>
        )}
        {shownCampaigns.length > 0 && (
          <>
            <div className="prep-subtitle">Кампанії</div>
            <CampaignsTable campaigns={shownCampaigns} kind={kind} custom={custom} currency={currency} />
          </>
        )}
      </div>

      {campaignMode === 'selected' && campaigns.length > 0 && (
        <CampaignPicker
          campaigns={campaigns} platform={active} selection={selection} onChange={onSelectionChange}
          kind={kind} custom={custom} currency={currency}
        />
      )}
    </div>
  );
}

const CAMPAIGN_KEYS = { ecom: ['spend', 'impressions', 'clicks', 'ctr', 'cpc', 'purchases', 'revenue', 'roas'], leadgen: ['spend', 'impressions', 'clicks', 'ctr', 'cpc', 'leads', 'cpl'] };

function CampaignsTable({ campaigns, kind, custom, currency }) {
  const keys = CAMPAIGN_KEYS[kind];
  const sorted = [...campaigns].sort((a, b) => (b.spend || 0) - (a.spend || 0));
  return (
    <div className="prep-scroll">
      <table className="prep-table">
        <thead>
          <tr><th>Кампанія</th>{keys.map((k) => <th key={k} className="num">{metricMeta(k, custom).label}</th>)}</tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.name}>
              <td className="lbl">{c.name}</td>
              {keys.map((k) => { const m = metricMeta(k, custom); return <td key={k} className="num">{formatMetric(computeMetric(k, c, custom), m.format, currency)}</td>; })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function campaignExport(campaigns, kind, custom, currency) {
  const keys = CAMPAIGN_KEYS[kind];
  return {
    columns: ['Кампанія', ...keys.map((k) => metricMeta(k, custom).label)],
    rows: [...campaigns].sort((a, b) => (b.spend || 0) - (a.spend || 0)).map((c) => [c.name, ...keys.map((k) => { const m = metricMeta(k, custom); return formatMetric(computeMetric(k, c, custom), m.format, currency); })]),
  };
}

// Which campaigns go into the report: tick any, all, or none. Lives outside the
// captured area, so it never ends up in a download.
function CampaignPicker({ campaigns, platform, selection, onChange, kind, custom, currency }) {
  // Open on its own state: tying `open` to the number ticked would fold the list the moment the first box is ticked.
  const [open, setOpen] = useState(true);
  const keys = campaigns.map((c) => campaignKey(platform, c.name));
  const picked = keys.filter((k) => selection.includes(k)).length;
  const others = selection.filter((k) => !keys.includes(k));
  const resultKey = kind === 'leadgen' ? 'leads' : 'purchases';
  const resultMeta = metricMeta(resultKey, custom);

  function toggle(key) {
    onChange(selection.includes(key) ? selection.filter((k) => k !== key) : [...selection, key]);
  }

  return (
    <details className="prep-picker" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Кампанії у звіті: обрано {picked} з {campaigns.length}</summary>
      <div className="prep-picker-bar">
        <button type="button" className="pacc-link" onClick={() => onChange([...others, ...keys])}>Усі</button>
        <button type="button" className="pacc-link" onClick={() => onChange(others)}>Жодної</button>
        <span className="pacc-hint">Обрані кампанії зʼявляться окремою таблицею у звіті та у файлах.</span>
      </div>
      <ul className="prep-picker-list">
        {campaigns.map((c) => {
          const key = campaignKey(platform, c.name);
          return (
            <li key={key}>
              <label>
                <input type="checkbox" checked={selection.includes(key)} onChange={() => toggle(key)} />
                <span className="prep-picker-name">{c.name}</span>
                <span className="prep-picker-meta">{formatMetric(computeMetric('spend', c, custom), 'money', currency)} · {resultMeta.label}: {formatMetric(computeMetric(resultKey, c, custom), 'number', currency)}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
