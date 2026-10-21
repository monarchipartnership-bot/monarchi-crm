import { useCallback, useEffect, useState } from 'react';
import { fetchProjectById } from '../../../lib/api/projects';
import { fetchProjectAccounts } from '../../../lib/api/projectAccounts';
import { fetchCampaignGroups, fetchCustomMetrics, fetchReportColumns, fetchReportTemplate } from '../../../lib/api/projectReportStore';
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
  const [template, setTemplate] = useState(() => normalizeTemplate(null));
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setProject(null);
    setAccounts(null);
    setError('');
    Promise.all([fetchProjectById(projectId), fetchProjectAccounts(projectId), fetchCampaignGroups(projectId), fetchCustomMetrics(projectId), fetchReportColumns(projectId), fetchReportTemplate(projectId)])
      .then(([p, a, g, c, cols, t]) => { if (!cancelled) { setProject(p); setAccounts(a); setGroups(g); setCustom(c); setColumns(cols); setTemplate(t); } })
      .catch((e) => { if (!cancelled) setError(e.message || 'Не вдалося завантажити проєкт.'); });
    return () => { cancelled = true; };
  }, [projectId]);

  const reloadGroups = useCallback(async () => { const g = await fetchCampaignGroups(projectId); setGroups(g); return groupsForPlatform(g, tab); }, [projectId, tab]);
  const reloadCustom = useCallback(async () => setCustom(await fetchCustomMetrics(projectId)), [projectId]);

  // The extra columns picked for this tab's platform. «Разом» adds up several platforms, so it shows none (they are platform-specific).
  const extraKeys = tab === 'total' ? [] : cleanColumns(tab, columns[tab]);
  const fetchColumns = tab === 'total' ? {} : { [tab]: extraKeys }; // what to ask the platform for
  const reloadColumns = useCallback(async () => { const m = await fetchReportColumns(projectId); setColumns(m); return tab === 'total' ? {} : { [tab]: cleanColumns(tab, m[tab]) }; }, [projectId, tab]);
  const every = accounts || [];
  return {
    ready: Boolean(project && accounts), error, project, accounts: accountsForTab(every, tab), allAccounts: every, groups: groupsForPlatform(groups, tab), allGroups: groups, scope: reportScope(tab, every), tab, custom, template,
    kind: projectKind(project), reloadGroups, reloadCustom, extraKeys, fetchColumns, reloadColumns,
  };
}
