import { useCallback, useEffect, useState } from 'react';
import { fetchProjectById } from '../../../lib/api/projects';
import { fetchProjectAccounts } from '../../../lib/api/projectAccounts';
import { fetchAgent } from '../../../lib/api/projectAgents';
import { fetchCampaignGroups, fetchCustomMetrics, fetchReportColumns, fetchReportLayout } from '../../../lib/api/projectReportStore';
import { normalizeTemplate } from '../../../lib/reportTemplate';
import { cleanColumns } from '../../../lib/platformColumns';
import { projectKind } from '../../../lib/reportMetrics';
import { accountsForTab, reportScope } from '../../../lib/reportScope';
import { groupsForPlatform } from '../../../lib/campaignGroups';

// Everything a report screen needs about one project: the project row (its type
// decides the metric set), linked ad accounts, campaign groups and custom metrics. `tab` (a platform id or 'total') narrows `accounts`
// and `groups` to that tab; `allAccounts` / `allGroups` / `scope` (where its saved reports live) are there for the rest.
export function useReportContext(projectId, tab = 'total') {
  const [project, setProject] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [groups, setGroups] = useState([]);
  const [custom, setCustom] = useState([]);
  const [columns, setColumns] = useState({});
  const [layoutState, setLayoutState] = useState({ exists: false, layout: normalizeTemplate(null), loaded: false });
  const [error, setError] = useState('');
  const [approvers, setApprovers] = useState([]); // who may confirm reports (settings of the agent); empty: anyone

  useEffect(() => {
    let cancelled = false;
    setProject(null);
    setAccounts(null);
    setError('');
    Promise.all([fetchProjectById(projectId), fetchProjectAccounts(projectId), fetchCampaignGroups(projectId), fetchCustomMetrics(projectId), fetchReportColumns(projectId), fetchAgent(projectId)])
      .then(([p, a, g, c, cols, ag]) => { if (!cancelled) { setProject(p); setAccounts(a); setGroups(g); setCustom(c); setColumns(cols); setApprovers((ag?.agent?.config?.approvers || []).map((e) => String(e).toLowerCase())); } })
      .catch((e) => { if (!cancelled) setError(e.message || 'Не вдалося завантажити проєкт.'); });
    return () => { cancelled = true; };
  }, [projectId]);

  // The layout of this platform tab (set up in the «Конструктор звіту»). «Разом» has none: it keeps the standard one.
  useEffect(() => {
    let cancelled = false;
    if (tab === 'total') { setLayoutState({ exists: false, layout: normalizeTemplate(null), loaded: true }); return undefined; }
    setLayoutState((l) => ({ ...l, loaded: false }));
    fetchReportLayout(projectId, tab).then((r) => { if (!cancelled) setLayoutState({ ...r, loaded: true }); });
    return () => { cancelled = true; };
  }, [projectId, tab]);

  const reloadGroups = useCallback(async () => { const g = await fetchCampaignGroups(projectId); setGroups(g); return groupsForPlatform(g, tab); }, [projectId, tab]);
  const reloadCustom = useCallback(async () => setCustom(await fetchCustomMetrics(projectId)), [projectId]);

  // The extra columns picked for this tab's platform. «Разом» adds up several platforms, so it shows none (they are platform-specific).
  const extraKeys = tab === 'total' ? [] : cleanColumns(tab, columns[tab]);
  const fetchColumns = tab === 'total' ? {} : { [tab]: extraKeys }; // what to ask the platform for
  const reloadColumns = useCallback(async () => { const m = await fetchReportColumns(projectId); setColumns(m); return tab === 'total' ? {} : { [tab]: cleanColumns(tab, m[tab]) }; }, [projectId, tab]);
  const every = accounts || [];
  return {
    ready: Boolean(project && accounts && layoutState.loaded), error, project, accounts: accountsForTab(every, tab), allAccounts: every, groups: groupsForPlatform(groups, tab), allGroups: groups, scope: reportScope(tab, every), tab, custom, approvers,
    kind: layoutState.layout.kind || projectKind(project), layout: layoutState.layout, layoutSaved: layoutState.exists,
    // the campaigns the layout selected (per platform), for the fetch: without a saved layout the old bundles of all groups are used
    selections: tab !== 'total' && layoutState.exists ? { [tab]: layoutState.layout.campaignSel } : null,
    reloadGroups, reloadCustom, extraKeys, fetchColumns, reloadColumns,
  };
}
