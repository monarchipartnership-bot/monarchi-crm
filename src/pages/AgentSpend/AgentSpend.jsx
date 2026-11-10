import { useCallback, useEffect, useMemo, useState } from 'react';
import { findAgentByKey } from '../../data/aiAgentsData';
import { fetchAiCalls, fetchBudgets, saveBudget } from '../../lib/api/aiUsage';
import { fetchProjects } from '../../lib/api/projects';
import { CALLER_LABELS, money, summarize, tokens, windows } from '../../lib/aiUsageStats';
import { useAuth } from '../../contexts/AuthContext';
import CampaignSpend from './CampaignSpend';
import '../Tools/aiMap/SystemState.css'; // the shared .sys-top / .sys-sub of the AI section pages
import '../../styles/aiAgentsSection.css';
import '../../styles/agentAnalyticsPage.css';
import '../../styles/agentSpendPage.css';

const STATUS_LABEL = { ok: 'Успішно', empty: 'Порожня відповідь', error: 'Помилка', budget_stopped: 'Зупинено лімітом' };
const LIMITS = [{ scope: 'global', period: 'day', label: 'Ліміт на день' }, { scope: 'global', period: 'month', label: 'Ліміт на місяць' }];

const nameOf = (key) => CALLER_LABELS[key] || findAgentByKey(key)?.name || key;
const fmtWhen = (iso) => new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtDay = (d) => d.split('-').reverse().slice(0, 2).join('.');

// the ring of a figure (owner's pick 2026-11-10): `pct` 0..1 is drawn round the content; `hot` turns it amber
function SpendRing({ pct = 0, hot = false, size = 78, w = 6, children }) {
  const r = (size - w) / 2, C = 2 * Math.PI * r, m = size / 2, v = Math.max(0, Math.min(1, pct));
  return (
    <span className={'spend-ring' + (hot ? ' is-hot' : '')} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={m} cy={m} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={w} />
        <circle cx={m} cy={m} r={r} fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeDasharray={`${C * v} ${C}`} transform={`rotate(-90 ${m} ${m})`} />
      </svg>
      {children}
    </span>
  );
}

// «Витрати» — what the AI agents spend: tokens (exact), dollars (an estimate from the price table), retries and
// failures, by agent / project / day, and the spending limits that stop a run before it costs more.
export default function AgentSpend({ onOpenCampaign }) {
  const { email } = useAuth();
  const [calls, setCalls] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [projects, setProjects] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const w = windows();
    const since = new Date(Math.min(w.month.getTime(), new Date(w.todayDate + 'T00:00:00Z').getTime() - 30 * 86400000)).toISOString();
    const [rows, lim, projs] = await Promise.all([fetchAiCalls(since), fetchBudgets(), fetchProjects().catch(() => [])]);
    setCalls(rows);
    setBudgets(lim);
    setProjects(projs);
    setDrafts(Object.fromEntries(lim.map((b) => [`${b.scope}|${b.period}`, String(b.limit_usd)])));
  }, []);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => (calls ? summarize(calls, { nameOf, projectNameOf: (id) => projects.find((p) => p.id === id)?.name || `Проєкт ${id}` }) : null), [calls, projects]);
  const limitOf = (scope, period) => budgets.find((b) => b.scope === scope && b.period === period);

  async function saveLimit(scope, period) {
    const raw = drafts[`${scope}|${period}`];
    const value = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) { setMessage('Вкажіть суму в доларах, наприклад 50.'); return; }
    setSaving(`${scope}|${period}`);
    setMessage('');
    try { await saveBudget({ scope, period, limitUsd: value, enabled: true, email }); await load(); setMessage('Ліміт збережено.'); } catch (e) { setMessage(e.message || 'Не вдалося зберегти.'); } finally { setSaving(''); }
  }

  const maxDay = stats ? Math.max(0.0001, ...stats.byDay.map((d) => d.cost)) : 1;
  const maxAgent = stats?.byAgent.length ? Math.max(0.0001, stats.byAgent[0].cost) : 1;
  const monthLimit = limitOf('global', 'month');
  const monthHot = !!(stats && monthLimit && Number(monthLimit.limit_usd) > 0 && stats.spent.month / Number(monthLimit.limit_usd) >= 0.9);
  const monthTotal = stats ? Math.max(0.0001, stats.total.month.cost) : 1;

  return (
    <div className="ai-section spend-page">
      <div className="ai-section-head">
        <div>
          <div className="ai-section-kicker">AI AGENTS</div>
          <h1>Витрати</h1>
          <p>Скільки AI-агенти витрачають на модель: токени, орієнтовна вартість, повтори й помилки — по агентах, проєктах і днях, та ліміти, які зупиняють запуск до перевитрати.</p>
        </div>
      </div>

      {calls === null && <div className="ai-section-empty">Завантаження…</div>}
      {stats && (
        <>
          <div className="analytics-stats">
            <div className="analytics-stat"><span className="analytics-stat-value">{money(stats.total.today.cost)}</span><span className="analytics-stat-label">Сьогодні · {stats.total.today.calls} запитів</span></div>
            <div className="analytics-stat"><span className="analytics-stat-value">{money(stats.total.week.cost)}</span><span className="analytics-stat-label">7 днів · {stats.total.week.calls} запитів</span></div>
            <div className={'analytics-stat' + (monthHot ? ' is-warn' : '')}><span className="analytics-stat-value">{money(stats.total.month.cost)}</span><span className="analytics-stat-label">Цей місяць · {stats.total.month.calls} запитів</span></div>
            <div className="analytics-stat"><span className="analytics-stat-value">{stats.total.month.retries}</span><span className="analytics-stat-label">Повторів за місяць</span></div>
            <div className={'analytics-stat' + (stats.total.month.failed > 0 ? ' is-bad' : '')}><span className="analytics-stat-value">{stats.total.month.failed}</span><span className="analytics-stat-label">Невдалих за місяць</span></div>
          </div>

          <CampaignSpend onOpenCampaign={onOpenCampaign} />

          <div className="analytics-section">
            <h2 className="analytics-section-title">Ліміти витрат</h2>
            <div className="spend-limits">
              {LIMITS.map(({ scope, period, label }) => {
                const lim = limitOf(scope, period);
                const spent = period === 'day' ? stats.spent.day : stats.spent.month;
                const pct = lim && Number(lim.limit_usd) > 0 ? Math.min(1, spent / Number(lim.limit_usd)) : 0;
                const key = `${scope}|${period}`;
                return (
                  <div className="spend-limit" key={key}>
                    <SpendRing pct={pct} hot={pct >= 0.9}><b>{Math.round(pct * 100)}%</b></SpendRing>
                    <div className="spend-limit-body">
                      <div className="spend-limit-top"><b>{label}</b><span>{money(spent)} з {lim ? money(lim.limit_usd) : 'без ліміту'}</span></div>
                      <div className="spend-limit-edit">
                        <label>$ <input type="text" inputMode="decimal" value={drafts[key] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))} aria-label={label} /></label>
                        <button type="button" className="ai-section-btn ai-section-btn-primary" onClick={() => saveLimit(scope, period)} disabled={saving === key}>{saving === key ? '…' : 'Зберегти'}</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="analytics-note">Коли ліміт вичерпано, нові запити до моделі не виконуються, поки не настане новий день або місяць (за Києвом) чи не піднято ліміт. Ліміт стосується всіх агентів разом. Окремо кожен запит не може коштувати понад $0.50.</p>
            {message && <p className="spend-message" role="status">{message}</p>}
          </div>

          <div className="analytics-section">
            <h2 className="analytics-section-title">Витрати по днях (30 днів)</h2>
            <div className="spend-days" role="img" aria-label="Витрати по днях">
              {stats.byDay.map((d) => (
                <div className="spend-day" key={d.date} title={`${fmtDay(d.date)}: ${money(d.cost, 3)}`}>
                  <span className="spend-day-bar" style={{ height: Math.max(2, (d.cost / maxDay) * 100) + '%' }} />
                  <span className="spend-day-label">{Number(d.date.slice(8)) % 5 === 0 || d.date === stats.byDay[stats.byDay.length - 1].date ? fmtDay(d.date) : ''}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="analytics-section">
            <h2 className="analytics-section-title">По агентах (цей місяць)</h2>
            {!stats.byAgent.length && <div className="ai-section-empty">Цього місяця запитів ще не було.</div>}
            {stats.byAgent.length > 0 && (
              <div className="spend-cards">
                {stats.byAgent.map((a) => (
                  <div className="spend-card" key={a.key}>
                    <SpendRing pct={a.cost / monthTotal} size={58} w={5}><b>{money(a.cost, 2)}</b></SpendRing>
                    <div className="spend-card-body">
                      <b>{a.name}</b>
                      <span>{a.calls} запитів · {(a.avgMs / 1000).toFixed(1)} с</span>
                      <span>{tokens(a.inTokens)} / {tokens(a.outTokens)} токенів</span>
                      {(a.retries > 0 || a.failed > 0) && (
                        <span className="spend-card-chips">
                          {a.retries > 0 && <i className="spend-chip">{a.retries} повторів</i>}
                          {a.failed > 0 && <i className="spend-chip is-bad">{a.failed} невдалих</i>}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {stats.byProject.length > 0 && (
            <div className="analytics-section">
              <h2 className="analytics-section-title">По проєктах (цей місяць)</h2>
              <div className="spend-cards">
                {stats.byProject.slice(0, 15).map((p) => (
                  <div className="spend-card" key={p.id}>
                    <SpendRing pct={p.cost / monthTotal} size={58} w={5}><b>{money(p.cost, 2)}</b></SpendRing>
                    <div className="spend-card-body"><b>{p.name}</b><span>{p.calls} запитів</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="analytics-section">
            <h2 className="analytics-section-title">Останні проблеми</h2>
            {!stats.problems.length && <div className="ai-section-empty">Проблем немає: усі запити виконано.</div>}
            {stats.problems.length > 0 && (
              <div className="spend-probs">
                {stats.problems.map((c) => (
                  <div className="spend-prob" key={c.id}>
                    <span className="spend-prob-ic" aria-hidden="true">!</span>
                    <span className="spend-prob-t"><b>{STATUS_LABEL[c.status] || c.status}.</b> {c.error}</span>
                    <small>{nameOf(c.agent_key)} · {fmtWhen(c.created_at)}{c.retries ? ` · ${c.retries} повторів` : ''}</small>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="analytics-note">Токени точні: їх повертає кожна відповідь моделі. Вартість — оцінка за таблицею цін, тому може трохи відрізнятися від рахунку; точні суми дивіться в <a href="https://platform.claude.com/usage" target="_blank" rel="noreferrer">консолі Anthropic</a>. Журнал веде спільний клієнт моделі, тож сюди потрапляють усі запити агентів, що йдуть через сервер.</p>
        </>
      )}
    </div>
  );
}
