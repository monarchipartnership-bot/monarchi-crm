import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchProjectById } from '../../../lib/api/projects';
import { fetchProjectAccounts } from '../../../lib/api/projectAccounts';
import { fetchAgent } from '../../../lib/api/projectAgents';
import { fetchCampaignGroups, fetchCustomMetrics, fetchReportColumns, fetchReportLayout } from '../../../lib/api/projectReportStore';
import { normalizeTemplate } from '../../../lib/reportTemplate';
import { cleanColumns } from '../../../lib/platformColumns';
import { projectKind } from '../../../lib/reportMetrics';
import { accountsForTab, reportScope } from '../../../lib/reportScope';
import { groupsForPlatform } from '../../../lib/campaignGroups';
import { withFunnelTokens } from '../../../lib/googleFunnel';

// Everything a report screen needs about one project: the project row (its type
// decides the metric set), linked ad accounts, campaign groups and custom metrics. `tab` (a platform id or 'total') narrows `accounts`
// and `groups` to that tab; `allAccounts` / `allGroups` / `scope` (where its saved reports live) are there for the rest.
// `version` grows when something the screen depends on was changed elsewhere: everything is read again without clearing the screen.
export function useReportContext(projectId, tab = 'total', version = 0) {
  const [project, setProject] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [groups, setGroups] = useState([]);
  const [custom, setCustom] = useState([]);
  const [columns, setColumns] = useState({});
  const [layoutState, setLayoutState] = useState({ exists: false, layout: normalizeTemplate(null), loaded: false, tab: null });
  const [error, setError] = useState('');
  const [approvers, setApprovers] = useState([]); // who may confirm reports (settings of the agent); empty: anyone

  const loadBase = (isCancelled) => Promise.all([fetchProjectById(projectId), fetchProjectAccounts(projectId), fetchCampaignGroups(projectId), fetchCustomMetrics(projectId), fetchReportColumns(projectId), fetchAgent(projectId)])
    .then(([p, a, g, c, cols, ag]) => { if (!isCancelled()) { setProject(p); setAccounts(a); setGroups(g); setCustom(c); setColumns(cols); setApprovers((ag?.agent?.config?.approvers || []).map((e) => String(e).toLowerCase())); } })
    .catch((e) => { if (!isCancelled()) setError(e.message || 'Не вдалося завантажити проєкт.'); });
  useEffect(() => {
    let cancelled = false;
    setProject(null);
    setAccounts(null);
    setError('');
    loadBase(() => cancelled);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  const seenVersion = useRef(version);
  const baseVersion = useRef(version);
  useEffect(() => {
    if (baseVersion.current === version) return undefined;
    baseVersion.current = version;
    let cancelled = false;
    loadBase(() => cancelled);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // The layout of this platform tab (set up in the «Конструктор звіту»). «Разом» has none: it keeps the standard one.
  useEffect(() => {
    let cancelled = false;
    if (tab === 'total') { setLayoutState({ exists: false, layout: normalizeTemplate(null), loaded: true, tab }); return undefined; }
    const silent = seenVersion.current !== version; // only the version changed: the current layout stays on screen until the new one arrives
    seenVersion.current = version;
    if (!silent) setLayoutState((l) => ({ ...l, loaded: false }));
    fetchReportLayout(projectId, tab)
      .then((r) => { if (!cancelled) setLayoutState({ ...r, loaded: true, tab }); })
      .catch((e) => { if (!cancelled) { setError('Не вдалося завантажити макет звіту: ' + (e.message || 'помилка мережі') + '. Оновіть сторінку.'); setLayoutState((l) => ({ ...l, loaded: false })); } });
    return () => { cancelled = true; };
  }, [projectId, tab, version]);

  const reloadGroups = useCallback(async () => { const g = await fetchCampaignGroups(projectId); setGroups(g); return groupsForPlatform(g, tab); }, [projectId, tab]);
  const reloadCustom = useCallback(async () => setCustom(await fetchCustomMetrics(projectId)), [projectId]);

  // The extra columns picked for this tab's platform. «Разом» adds up several platforms, so it shows none (they are platform-specific).
  const extraKeys = tab === 'total' ? [] : cleanColumns(tab, columns[tab]);
  const fetchColumns = tab === 'total' ? {} : { [tab]: tab === 'google' ? withFunnelTokens(extraKeys, layoutState.layout.funnel) : extraKeys }; // what to ask the platform for (Google also: the funnel's chosen conversion actions)
  const reloadColumns = useCallback(async () => { const m = await fetchReportColumns(projectId); setColumns(m); return tab === 'total' ? {} : { [tab]: cleanColumns(tab, m[tab]) }; }, [projectId, tab]);
  const every = accounts || [];
  return {
    // ready only with the layout of THIS tab: right after a switch the previous tab's layout is not used
    ready: Boolean(project && accounts && layoutState.loaded && layoutState.tab === tab), error, project, accounts: accountsForTab(every, tab), allAccounts: every, groups: groupsForPlatform(groups, tab), allGroups: groups, scope: reportScope(tab, every), tab, custom, approvers,
    kind: layoutState.layout.kind || projectKind(project), layout: layoutState.layout, layoutSaved: layoutState.exists,
    // the campaigns the layout selected (per platform), for the fetch: without a saved layout the old bundles of all groups are used
    selections: tab !== 'total' && layoutState.exists ? { [tab]: layoutState.layout.campaignSel } : null,
    reloadGroups, reloadCustom, extraKeys, fetchColumns, reloadColumns,
  };
}
