import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useConfirm } from '../../common/ConfirmDialog';
import { RibbonMark } from '../hubIcons';
import CampaignGroupsModal from '../Reports/CampaignGroupsModal';
import CustomMetricModal from '../Reports/CustomMetricModal';
import { Box, Pill } from '../../ClientReport/kit';
import { Creatives, MetricTable, ReportTexts } from '../../ClientReport/parts';
import { Kpis } from '../../ClientReport/MonthView';
import { BlocksPanel, CreativesPanel, GroupsPanel, KindPanel, MetricsPanel, PanelContext } from './BuilderSettings';
import '../../../styles/builderHub.css';
import { loadReportContext } from '../../../lib/projectReportContext';
import { fetchCampaignGroups, fetchReportLayout, saveReportLayout } from '../../../lib/api/projectReportStore';
import { accountPlatforms, accountsForTab } from '../../../lib/reportScope';
import { groupsForPlatform } from '../../../lib/campaignGroups';
import { builderView, viewKeys } from '../../../lib/clientReport';
import { normalizeTemplate } from '../../../lib/reportTemplate';
import { cleanColumns } from '../../../lib/platformColumns';
import { platformInfo } from '../../../lib/adAccounts';
import { projectKind } from '../../../lib/reportMetrics';
import { comparisonPeriod, dueReportPeriod, pullReportData } from '../../../lib/reportEngine';
import { todayIso } from '../../../lib/dateHelpers';
import '../../../styles/clientReportHub.css';
import '../../../styles/projectReports.css';
import '../../../styles/projectHistory.css';

// «Конструктор звіту»: the report of a project is set up here, once per ad platform. The layout is shown the way the client will see it (without numbers,
// or with the numbers of the last week) and changes while you set it up; «Зберегти макет» makes it the base of every report of that platform: the manual
// pages, the AI agent and the client's page. A platform without a saved layout is not reported by the agent.
export default function ReportBuilder({ projectId }) {
  const { email } = useAuth();
  const [params, setParams] = useSearchParams();
  const [confirm, confirmDialog] = useConfirm();
  const [ctx, setCtx] = useState(null);
  const [state, setState] = useState(null); // { saved, draft, exists } of the chosen platform
  const [periodType, setPeriodType] = useState('weekly');
  const [real, setReal] = useState({ data: null, period: null, busy: false, error: '' });
  const [modal, setModal] = useState(null); // 'groups' | 'metric'
  const [groupEdit, setGroupEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [openPanel, setOpenPanel] = useState('blocks'); // the settings panels are an accordion: one open at a time

  const reload = useCallback(async () => {
    const [c, groups] = await Promise.all([loadReportContext(projectId), fetchCampaignGroups(projectId)]);
    setCtx({ ...c, groups });
  }, [projectId]);
  useEffect(() => { reload().catch(() => setCtx({ project: null, accounts: [], custom: [], columns: {}, groups: [] })); }, [reload]);

  const platforms = useMemo(() => (ctx ? accountPlatforms(ctx.accounts) : []), [ctx]);
  const wanted = params.get('platform');
  const platform = platforms.includes(wanted) ? wanted : platforms[0] || null;

  useEffect(() => {
    if (!platform) return undefined;
    let off = false;
    setState(null);
    setReal({ data: null, period: null, busy: false, error: '' });
    setMessage('');
    fetchReportLayout(projectId, platform).then((r) => { if (!off) setState({ saved: r.layout, draft: r.layout, exists: r.exists }); });
    return () => { off = true; };
  }, [projectId, platform]);

  const draft = state?.draft;
  const dirty = Boolean(state) && JSON.stringify(normalizeTemplate(state.draft)) !== JSON.stringify(state.saved);
  const set = (patch) => { setState((s) => ({ ...s, draft: { ...s.draft, ...patch } })); setMessage(''); };

  const kind = draft ? draft.kind || projectKind(ctx?.project) : 'ecom';
  const platformAccounts = useMemo(() => (ctx ? accountsForTab(ctx.accounts, platform) : []), [ctx, platform]);
  const platformGroups = useMemo(() => (ctx ? groupsForPlatform(ctx.groups, platform) : []), [ctx, platform]);
  const extraKeys = useMemo(() => (ctx && platform ? cleanColumns(platform, ctx.columns?.[platform]) : []), [ctx, platform]);
  const model = useMemo(() => ({ kind, columns: extraKeys, custom: ctx?.custom || [] }), [kind, extraKeys, ctx]);

  const view = useMemo(() => (draft ? builderView({ layout: draft, periodType, kind, groupNames: platformGroups.map((g) => g.name), data: real.data, period: real.period }) : null), [draft, periodType, kind, platformGroups, real.data, real.period]);
  const keys = useMemo(() => (view ? viewKeys(view, model, { all: true }) : []), [view, model]);

  async function pick(next) {
    if (next === platform) return;
    if (dirty && !(await confirm({ title: 'Незбережені зміни', body: 'У макеті цієї платформи є незбережені зміни. Перейти без збереження?', confirmLabel: 'Перейти без збереження', cancelLabel: 'Залишитись' }))) return;
    const nextParams = new URLSearchParams(params);
    nextParams.set('platform', next);
    setParams(nextParams, { replace: true });
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const t = await saveReportLayout(projectId, platform, draft, email);
      setState({ saved: t, draft: t, exists: true });
      setMessage('Макет збережено. Він діє у ручних звітах, в агента й на сторінці клієнта; створені раніше звіти не змінюються.');
    } catch (e) { setError(e.message || 'Не вдалося зберегти макет.'); } finally { setSaving(false); }
  }

  async function loadReal() {
    setReal((r) => ({ ...r, busy: true, error: '' }));
    try {
      const due = dueReportPeriod(periodType, todayIso());
      const prev = comparisonPeriod(periodType, due.picker, due.period, { mode: 'calendar' });
      const { data, errors } = await pullReportData({ accounts: platformAccounts, kind, groups: platformGroups, period: due.period, prev, columns: { [platform]: extraKeys } });
      if (!data.platforms[platform]) throw new Error(Object.values(errors)[0] || 'Кабінет не повернув даних за цей період.');
      setReal({ data, period: due.period, busy: false, error: '' });
    } catch (e) { setReal({ data: null, period: null, busy: false, error: (e.message || 'Не вдалося отримати дані.') + ' Цифри підтягуються лише на робочому сайті.' }); }
  }
  useEffect(() => { setReal({ data: null, period: null, busy: false, error: '' }); }, [periodType, kind]);

  if (!ctx) return <div className="empty-hint">Завантаження...</div>;
  if (!platforms.length) return <div className="empty-hint">Конструктор зʼявиться, коли до проєкту підключено рекламний кабінет (Meta або Google) на вкладці «Огляд».</div>;
  if (!state || !draft) return <div className="empty-hint">Завантаження...</div>;

  const label = platformInfo(platform).label;
  const toggleMetric = (key) => set({ hiddenMetrics: draft.hiddenMetrics.includes(key) ? draft.hiddenMetrics.filter((k) => k !== key) : [...draft.hiddenMetrics, key] });
  const toggleBlock = (key) => set({ blocks: draft.blocks.map((b) => (b.key === key ? { ...b, client: b.client === false } : b)) });
  const creativeCount = draft.creatives[periodType];
  const placeholders = Array.from({ length: creativeCount }, (_, i) => ({ caption: `Креатив ${i + 1} з оголошень Meta`, imageUrl: null }));
  const platformLabel = platform === 'meta' ? 'Meta' : platform === 'google' ? 'Google' : '';

  return (
    <section className="report-section bld">
      <div className="prep-seg" role="tablist" aria-label="Платформи проєкту">
        {platforms.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={p === platform} className={'prep-seg-tab' + (p === platform ? ' on' : '')} onClick={() => pick(p)}>
            <RibbonMark platform={p} />{platformInfo(p).label}
          </button>
        ))}
      </div>

      <div className="bld-bar">
        <span className="bld-md bld-md--lg"><span className="bld-mi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg></span></span>
        <div className="bld-bar-title"><b>Конструктор звіту · {label}</b><small>Так бачитиме звіт клієнт; команда завжди бачить повний</small></div>
        <span className={'bld-state ' + (dirty || !state.exists ? 'dirty' : 'saved')}><i />{dirty ? 'Є незбережені зміни' : state.exists ? 'Макет збережено' : 'Макет не збережено'}</span>
        <div className="prep-seg bld-seg" role="group" aria-label="Тип звіту для перегляду">
          <button type="button" className={'prep-seg-tab' + (periodType === 'weekly' ? ' on' : '')} aria-pressed={periodType === 'weekly'} onClick={() => setPeriodType('weekly')}>Тижневий</button>
          <button type="button" className={'prep-seg-tab' + (periodType === 'monthly' ? ' on' : '')} aria-pressed={periodType === 'monthly'} onClick={() => setPeriodType('monthly')}>Місячний</button>
        </div>
        <button type="button" className="btn" disabled={real.busy} onClick={real.data ? () => setReal({ data: null, period: null, busy: false, error: '' }) : loadReal}>
          {real.busy ? 'Завантажуємо…' : real.data ? 'Показати без цифр' : 'Показати з даними'}
        </button>
        <button type="button" className="btn bld-save" disabled={saving || (!dirty && state.exists)} onClick={save}>{saving ? 'Зберігаємо…' : 'Зберегти макет'}</button>
      </div>

      {!state.exists && <div className="prep-internal-note" role="note"><b>Макет {label} ще не збережено.</b> Нижче стандартний вигляд і те, що вже налаштовано в проєкті (групи, додаткові метрики). Натисніть «Зберегти макет»: поки його немає, AI-агент для цієї платформи не складає звіти.</div>}
      {message && <div className="pacc-hint" role="status">{message}</div>}
      {error && <div className="pacc-err">{error}</div>}
      {real.error && <div className="pacc-err">{real.error}</div>}
      <div className="pacc-hint">Так бачитиме звіт клієнт. Око біля метрики чи тексту вмикає або вимикає її для клієнта; команда завжди бачить повний звіт.</div>

      <div className="crh crh-embed bld-preview">
        {periodType === 'monthly' && <Kpis view={view} all />}
        <Box icon="cal" title={periodType === 'monthly' ? `${real.period ? 'Month' : 'Month'} summary` : 'Week'} sub={real.period ? `${real.period.start.split('-').reverse().join('.')} – ${real.period.end.split('-').reverse().join('.')}` : 'макет'} right={<Pill tone="wa">{real.data ? 'З даними' : 'Макет'}</Pill>}>
          <div className="split">
            <div className="l"><MetricTable view={view} keys={keys} custom={model.custom} platformLabel={platformLabel} builder={{ hidden: draft.hiddenMetrics, onToggle: toggleMetric }} /></div>
            <div className="r">
              <ReportTexts view={view} builder={{ placeholder: 'Тут буде текст блоку', onToggle: toggleBlock }} />
              <Creatives items={placeholders} />
            </div>
          </div>
        </Box>
      </div>

      <PanelContext.Provider value={{ open: openPanel, toggle: (id) => setOpenPanel((cur) => (cur === id ? '' : id)) }}>
      <div className="bld-panels">
        <KindPanel draft={draft} set={set} projectKind={projectKind(ctx.project)} />
        <MetricsPanel projectId={projectId} platform={platform} kind={kind} extraKeys={extraKeys} custom={ctx.custom} onOpen={() => setModal('metric')} onChanged={reload} />
        <GroupsPanel
          projectId={projectId} platform={platform} kind={kind} accounts={platformAccounts} groups={platformGroups}
          onEdit={(id) => { setGroupEdit(id); setModal('groups'); }} onCreate={() => { setGroupEdit('new'); setModal('groups'); }} onChanged={reload}
        />
        <BlocksPanel draft={draft} set={set} />
        <CreativesPanel draft={draft} set={set} />
      </div>
      </PanelContext.Provider>
      <div className="bld-actions bld-actions--end">
        <button type="button" className="btn bld-save" disabled={saving || (!dirty && state.exists)} onClick={save}>{saving ? 'Зберігаємо…' : 'Зберегти макет'}</button>
        <button type="button" className="btn bld-undo" disabled={saving || !dirty} onClick={() => { setState((s) => ({ ...s, draft: s.saved })); setMessage(''); }}>Скасувати зміни</button>
      </div>

      {modal === 'groups' && (
        <CampaignGroupsModal
          projectId={projectId} platform={platform} groups={platformGroups} accounts={platformAccounts} kind={kind} knownCampaigns={[]} startEdit={groupEdit}
          onClose={() => { setModal(null); setGroupEdit(null); }} onChanged={reload}
        />
      )}
      {modal === 'metric' && (
        <CustomMetricModal projectId={projectId} platform={platform} columnKeys={extraKeys} custom={ctx.custom} onClose={() => setModal(null)} onChanged={reload} onColumnsSaved={reload} sample={null} />
      )}
      {confirmDialog}
    </section>
  );
}
