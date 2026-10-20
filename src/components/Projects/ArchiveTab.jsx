import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useConfirm } from '../common/ConfirmDialog';
import { HubTitle, RibbonMark } from './hubIcons';
import ArchiveReportModal, { reportPeriodText, reportPlatformLabel } from './ArchiveReportModal';
import { deleteProjectReport, fetchCustomMetrics, fetchProjectReports, fetchReportColumns } from '../../lib/api/projectReportStore';
import { fetchProjectDecks } from '../../lib/api/projectDecks';
import { fetchProjectById } from '../../lib/api/projects';
import { fetchProjectAccounts } from '../../lib/api/projectAccounts';
import { STYLES } from '../../lib/presentation/deckModel';
import { accountPlatforms, TOTAL_TAB } from '../../lib/reportScope';
import { cleanColumns, missingColumns } from '../../lib/platformColumns';
import { platformInfo } from '../../lib/adAccounts';
import '../../styles/projectReports.css';

const TYPE_LABEL = { weekly: 'Тижневий', monthly: 'Місячний', custom: 'Довільний' };
const STATUS = { draft: 'Чернетка', reviewed: 'Перевірено', final: 'Фінал' };
const stamp = (iso) => new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// «Архів звітів» of a project: every saved report, split by ad platform (the same tabs as the report pages, «Разом» last),
// newest first. A row opens as a full-screen table window.
export default function ArchiveTab({ projectId }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [confirm, confirmDialog] = useConfirm();
  const [rows, setRows] = useState(null);
  const [decks, setDecks] = useState([]);
  const [info, setInfo] = useState({ project: null, accounts: [], custom: [], columns: {} });
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [r, d] = await Promise.all([fetchProjectReports(projectId), fetchProjectDecks(projectId)]);
    setRows(r);
    setDecks(d);
  }, [projectId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let off = false;
    Promise.all([fetchProjectById(projectId), fetchProjectAccounts(projectId), fetchCustomMetrics(projectId), fetchReportColumns(projectId)])
      .then(([project, accounts, custom, columns]) => { if (!off) setInfo({ project, accounts, custom, columns }); })
      .catch(() => {});
    return () => { off = true; };
  }, [projectId]);

  // tabs: the platforms of the project (and of any report that is left from a removed account), «Разом» last
  const platforms = useMemo(() => [...new Set([...accountPlatforms(info.accounts), ...(rows || []).map((r) => r.platform).filter((p) => p && p !== 'all')])], [info.accounts, rows]);
  const scopeOf = (tab) => (tab !== TOTAL_TAB ? tab : platforms.length === 1 ? platforms[0] : 'all'); // one platform: «Разом» is that platform's own list
  const tabs = [...platforms.map((p) => ({ key: p, label: platformInfo(p).label })), { key: TOTAL_TAB, label: 'Разом' }];
  const wanted = params.get('platform');
  const tab = tabs.some((t) => t.key === wanted) ? wanted : tabs[0].key;
  const countOf = (t) => (rows || []).filter((r) => (r.platform || 'all') === scopeOf(t)).length;
  const list = (rows || []).filter((r) => (r.platform || 'all') === scopeOf(tab)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const styleOf = (r) => {
    const d = decks.find((x) => x.period_type === r.period_type && x.period_start === r.period_start && (r.platform === 'all' || x.platform === r.platform));
    return d ? STYLES.find((s) => s.id === d.style)?.name || d.style : '—';
  };

  const open = list.find((r) => r.id === openId) || null;

  async function remove(r) {
    if (!(await confirm({ title: 'Видалити звіт?', body: 'Видалити збережений звіт з архіву? Дію не можна скасувати. Презентація, зроблена з нього, залишиться.', confirmLabel: 'Видалити звіт', danger: true }))) return;
    try { await deleteProjectReport(r.id); setOpenId(null); await load(); } catch (e) { setError(e.message || 'Не вдалося видалити.'); }
  }
  const presentation = (r, platform) => navigate(`/clients?project=${projectId}&type=${r.period_type}&start=${r.period_start}&platform=${platform}`);

  function pick(key) {
    const next = new URLSearchParams(params);
    next.set('platform', key);
    setParams(next, { replace: true });
  }

  return (
    <section className="report-section">
      <HubTitle icon="file" className="prep-box-title">Архів звітів</HubTitle>
      <div className="prep-seg" role="tablist" aria-label="Платформи">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === tab} className={'prep-seg-tab' + (t.key === tab ? ' on' : '')} onClick={() => pick(t.key)}>
            <RibbonMark platform={t.key === TOTAL_TAB ? null : t.key} />{t.label}{rows ? <span className="rg-n">{countOf(t.key)}</span> : null}
          </button>
        ))}
      </div>
      {error && <div className="pacc-err">{error}</div>}
      {rows == null && <div className="empty-hint">Завантаження...</div>}
      {rows && list.length === 0 && (
        <div className="empty-hint">
          У цьому розділі звітів ще немає. Збережіть Тижневий або Місячний звіт, або натисніть «Зберегти в архів» у «Показниках за період».
        </div>
      )}
      {rows && list.length > 0 && (
        <div className="prep-scroll">
          <table className="prep-table prep-saved arc-table">
            <thead>
              <tr><th>Сформовано</th><th>Тип</th><th>Платформа</th><th>Стиль</th><th>Статус</th><th>Оновлено</th><th /></tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{stamp(r.created_at)}</td>
                  <td className="lbl">{TYPE_LABEL[r.period_type] || r.period_type}<small className="arc-period">{reportPeriodText(r)}{r.data?.label ? ` · ${r.data.label}` : ''}</small></td>
                  <td>{reportPlatformLabel(r.platform)}</td>
                  <td>{styleOf(r)}</td>
                  <td>{STATUS[r.status] || r.status}{r.source === 'agent' ? ' · AI-агент' : ''}</td>
                  <td className="muted">{stamp(r.updated_at)}</td>
                  <td>
                    <div className="arc-row-actions">
                      <button type="button" className="pacc-link" onClick={() => setOpenId(r.id)}>Відкрити</button>
                      <button type="button" className="pacc-link pacc-link--danger" onClick={() => remove(r)}>Видалити</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <ArchiveReportModal
          row={open} projectName={info.project?.name || ''} custom={info.custom}
          extraKeys={open.platform === 'all' ? [] : cleanColumns(open.platform, info.columns[open.platform]).filter((k) => !missingColumns(open.platform, [k], open.data?.platforms?.[open.platform]?.total).length)}
          onClose={() => setOpenId(null)} onDelete={remove} onPresentation={presentation}
        />
      )}
      {confirmDialog}
    </section>
  );
}
