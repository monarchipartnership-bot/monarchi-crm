import { useCallback, useEffect, useState } from 'react';
import { fetchProjectById } from '../../../lib/api/projects';
import { fetchProjectAccounts } from '../../../lib/api/projectAccounts';
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
  const [layoutState, setLayoutState] = useState({ exists: false, layout: normalizeTemplate(null) });
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setProject(null);
    setAccounts(null);
    setError('');
    Promise.all([fetchProjectById(projectId), fetchProjectAccounts(projectId), fetchCampaignGroups(projectId), fetchCustomMetrics(projectId), fetchReportColumns(projectId)])
      .then(([p, a, g, c, cols]) => { if (!cancelled) { setProject(p); setAccounts(a); setGroups(g); setCustom(c); setColumns(cols); } })
      .catch((e) => { if (!cancelled) setError(e.message || 'Не вдалося завантажити проєкт.'); });
    return () => { cancelled = true; };
  }, [projectId]);

  // The layout of this platform tab (set up in the «Конструктор звіту»). «Разом» has none: it keeps the standard one.
  useEffect(() => {
    let cancelled = false;
    if (tab === 'total') { setLayoutState({ exists: false, layout: normalizeTemplate(null) }); return undefined; }
    fetchReportLayout(projectId, tab).then((r) => { if (!cancelled) setLayoutState(r); });
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
    ready: Boolean(project && accounts), error, project, accounts: accountsForTab(every, tab), allAccounts: every, groups: groupsForPlatform(groups, tab), allGroups: groups, scope: reportScope(tab, every), tab, custom,
    kind: layoutState.layout.kind || projectKind(project), layout: layoutState.layout, layoutSaved: layoutState.exists, reloadGroups, reloadCustom, extraKeys, fetchColumns, reloadColumns,
  };
}
