import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PeriodStats from './PeriodStats';
import PeriodReport from './PeriodReport';
import { useConfirm } from '../../common/ConfirmDialog';
import { fetchProjectAccounts } from '../../../lib/api/projectAccounts';
import { accountPlatforms, TOTAL_TAB } from '../../../lib/reportScope';
import { platformInfo } from '../../../lib/adAccounts';
import '../../../styles/projectReports.css';

// «Показники за період», «Тижневий звіт» and «Місячний звіт» are split by ad platform: a row of tabs, one per platform linked to the
// project (Meta, Google, later TikTok...), and always last «Разом». A tab is one platform's own periods, campaign groups and reports;
// «Разом» is the sum of them all. The chosen tab is kept in the address (`?platform=`) so it stays when moving between the three sections.
// mode: 'period' | 'weekly' | 'monthly'.
export default function PlatformReports({ projectId, mode }) {
  const [params, setParams] = useSearchParams();
  const [accounts, setAccounts] = useState(null);
  const [confirm, confirmDialog] = useConfirm();
  const unsaved = useRef(false); // set by the report screen while it holds changes that are not saved
  const tabRefs = useRef({});

  useEffect(() => {
    let off = false;
    setAccounts(null);
    fetchProjectAccounts(projectId).then((a) => { if (!off) setAccounts(a); }).catch(() => { if (!off) setAccounts([]); });
    return () => { off = true; };
  }, [projectId]);

  if (accounts === null) return <div className="empty-hint">Завантаження...</div>;

  const platforms = accountPlatforms(accounts);
  const tabs = [...platforms.map((p) => ({ key: p, label: platformInfo(p).label })), { key: TOTAL_TAB, label: 'Разом' }];
  const wanted = params.get('platform');
  const tab = tabs.some((t) => t.key === wanted) ? wanted : tabs[0].key;

  async function pick(key) {
    if (key === tab) return;
    if (unsaved.current && !(await confirm({ title: 'Незбережені зміни', body: 'Є незбережені зміни в цьому звіті. Перейти на іншу вкладку без збереження?', confirmLabel: 'Перейти без збереження', cancelLabel: 'Залишитись' }))) return;
    unsaved.current = false;
    const next = new URLSearchParams(params);
    next.set('platform', key);
    setParams(next, { replace: true });
  }

  // Arrow keys / Home / End move between the tabs, like the project's own tabs.
  function onKey(e) {
    const keys = tabs.map((t) => t.key);
    const i = keys.indexOf(tab);
    const next = e.key === 'ArrowRight' ? keys[(i + 1) % keys.length] : e.key === 'ArrowLeft' ? keys[(i - 1 + keys.length) % keys.length] : e.key === 'Home' ? keys[0] : e.key === 'End' ? keys[keys.length - 1] : null;
    if (!next) return;
    e.preventDefault();
    pick(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <>
      {accounts.length > 0 && (
        <>
          <div className="prep-seg" role="tablist" aria-label="Рекламні кабінети проєкту" onKeyDown={onKey}>
            {tabs.map((t) => (
              <button
                key={t.key} ref={(n) => { tabRefs.current[t.key] = n; }} type="button" role="tab" aria-selected={t.key === tab} tabIndex={t.key === tab ? 0 : -1}
                className={'prep-seg-tab' + (t.key === tab ? ' on' : '')} onClick={() => pick(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === TOTAL_TAB && <div className="pacc-hint prep-platforms-hint">{platforms.length > 1 ? 'Сума по всіх кампаніях усіх платформ за обраний період.' : 'У проєкті одна платформа, тож тут її ж цифри.'}</div>}
        </>
      )}
      {mode === 'period'
        ? <PeriodStats projectId={projectId} platform={tab} />
        : <PeriodReport projectId={projectId} periodType={mode} platform={tab} unsavedRef={unsaved} />}
      {confirmDialog}
    </>
  );
}
