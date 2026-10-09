import { useCallback, useEffect, useMemo, useState } from 'react';
import { findAgentByKey } from '../../data/aiAgentsData';
import { fetchAiCalls, fetchBudgets, saveBudget } from '../../lib/api/aiUsage';
import { fetchProjects } from '../../lib/api/projects';
import { CALLER_LABELS, money, summarize, tokens, windows } from '../../lib/aiUsageStats';
import { useAuth } from '../../contexts/AuthContext';
import '../../styles/aiAgentsSection.css';
import '../../styles/agentAnalyticsPage.css';
import '../../styles/agentSpendPage.css';

const SPEND_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.4 0-2.5.7-2.5 1.8 0 2.5 5 1.2 5 3.7 0 1.1-1.1 1.8-2.5 1.8-1.2 0-2.2-.5-2.7-1.4M12 6.5V8m0 8v1.5"/></svg>';
const STATUS_LABEL = { ok: 'Успішно', empty: 'Порожня відповідь', error: 'Помилка', budget_stopped: 'Зупинено лімітом' };
const LIMITS = [{ scope: 'global', period: 'day', label: 'Ліміт на день' }, { scope: 'global', period: 'month', label: 'Ліміт на місяць' }];

const nameOf = (key) => CALLER_LABELS[key] || findAgentByKey(key)?.name || key;
const fmtWhen = (iso) => new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtDay = (d) => d.split('-').reverse().slice(0, 2).join('.');

// «Витрати» — what the AI agents spend: tokens (exact), dollars (an estimate from the price table), retries and
// failures, by agent / project / day, and the spending limits that stop a run before it costs more.
export default function AgentSpend() {
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

  return (
    <div className="ai-section spend-page">
      <div className="ai-section-head">
        <span className="ai-section-icon" dangerouslySetInnerHTML={{ __html: SPEND_ICON }} />
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
            <div className="analytics-stat"><span className="analytics-stat-value">{money(stats.total.month.cost)}</span><span className="analytics-stat-label">Цей місяць · {stats.total.month.calls} запитів</span></div>
            <div className="analytics-stat"><span className="analytics-stat-value">{stats.total.month.retries}</span><span className="analytics-stat-label">Повторів за місяць</span></div>
            <div className="analytics-stat"><span className="analytics-stat-value">{stats.total.month.failed}</span><span className="analytics-stat-label">Невдалих за місяць</span></div>
          </div>

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
                    <div className="spend-limit-top"><b>{label}</b><span>{money(spent)} з {lim ? money(lim.limit_usd) : 'без ліміту'}</span></div>
                    <div className="spend-bar"><span className={'spend-bar-fill' + (pct >= 0.9 ? ' hot' : '')} style={{ width: pct * 100 + '%' }} /></div>
                    <div className="spend-limit-edit">
                      <label>$ <input type="text" inputMode="decimal" value={drafts[key] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))} aria-label={label} /></label>
                      <button type="button" className="ai-section-btn ai-section-btn-primary" onClick={() => saveLimit(scope, period)} disabled={saving === key}>{saving === key ? '…' : 'Зберегти'}</button>
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
              <div className="spend-table-wrap">
                <table className="spend-table">
                  <thead><tr><th>Агент</th><th>Запитів</th><th>Токени (вх. / вих.)</th><th>Вартість</th><th>Сер. час</th><th>Повторів</th><th>Невдалих</th></tr></thead>
                  <tbody>
                    {stats.byAgent.map((a) => (
                      <tr key={a.key}>
                        <td><div className="spend-agent">{a.name}<span className="spend-agent-bar"><span style={{ width: (a.cost / maxAgent) * 100 + '%' }} /></span></div></td>
                        <td>{a.calls}</td><td>{tokens(a.inTokens)} / {tokens(a.outTokens)}</td><td>{money(a.cost, 3)}</td>
                        <td>{(a.avgMs / 1000).toFixed(1)} с</td><td>{a.retries}</td><td className={a.failed ? 'spend-bad' : ''}>{a.failed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {stats.byProject.length > 0 && (
            <div className="analytics-section">
              <h2 className="analytics-section-title">По проєктах (цей місяць)</h2>
              <div className="spend-table-wrap">
                <table className="spend-table">
                  <thead><tr><th>Проєкт</th><th>Запитів</th><th>Вартість</th></tr></thead>
                  <tbody>{stats.byProject.slice(0, 15).map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.calls}</td><td>{money(p.cost, 3)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}

          <div className="analytics-section">
            <h2 className="analytics-section-title">Останні проблеми</h2>
            {!stats.problems.length && <div className="ai-section-empty">Проблем немає: усі запити виконано.</div>}
            {stats.problems.length > 0 && (
              <div className="spend-table-wrap">
                <table className="spend-table">
                  <thead><tr><th>Коли</th><th>Агент</th><th>Що сталося</th><th>Повторів</th></tr></thead>
                  <tbody>
                    {stats.problems.map((c) => (
                      <tr key={c.id}><td>{fmtWhen(c.created_at)}</td><td>{nameOf(c.agent_key)}</td><td><b>{STATUS_LABEL[c.status] || c.status}.</b> {c.error}</td><td>{c.retries}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="analytics-note">Токени точні: їх повертає кожна відповідь моделі. Вартість — оцінка за таблицею цін, тому може трохи відрізнятися від рахунку; точні суми дивіться в <a href="https://platform.claude.com/usage" target="_blank" rel="noreferrer">консолі Anthropic</a>. Журнал веде спільний клієнт моделі, тож сюди потрапляють усі запити агентів, що йдуть через сервер.</p>
        </>
      )}
    </div>
  );
}
