import { useCallback, useEffect, useState } from 'react';
import { fetchProjectById } from '../../../lib/api/projects';
import { fetchProjectAccounts } from '../../../lib/api/projectAccounts';
import { fetchCampaignGroups, fetchCustomMetrics } from '../../../lib/api/projectReportStore';
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
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setProject(null);
    setAccounts(null);
    setError('');
    Promise.all([fetchProjectById(projectId), fetchProjectAccounts(projectId), fetchCampaignGroups(projectId), fetchCustomMetrics(projectId)])
      .then(([p, a, g, c]) => { if (!cancelled) { setProject(p); setAccounts(a); setGroups(g); setCustom(c); } })
      .catch((e) => { if (!cancelled) setError(e.message || 'Не вдалося завантажити проєкт.'); });
    return () => { cancelled = true; };
  }, [projectId]);

  const reloadGroups = useCallback(async () => { const g = await fetchCampaignGroups(projectId); setGroups(g); return groupsForPlatform(g, tab); }, [projectId, tab]);
  const reloadCustom = useCallback(async () => setCustom(await fetchCustomMetrics(projectId)), [projectId]);

  const every = accounts || [];
  return {
    ready: Boolean(project && accounts), error, project, accounts: accountsForTab(every, tab), allAccounts: every, groups: groupsForPlatform(groups, tab), allGroups: groups, scope: reportScope(tab, every), tab, custom,
    kind: projectKind(project), reloadGroups, reloadCustom,
  };
}
