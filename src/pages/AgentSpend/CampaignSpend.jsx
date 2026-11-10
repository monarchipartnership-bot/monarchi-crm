import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCampaignSpend } from '../../lib/api/campaignSpend';
import { saveCampaignMoney } from '../../lib/api/campaignControl';
import { fetchProjects } from '../../lib/api/projects';
import { CAMPAIGN_STATUS, PERIODS, buildCampaignSpend, monthlySpend } from '../../lib/agents/campaignSpend';
import { money } from '../../lib/aiUsageStats';

const fmtDay = (d) => d.split('-').reverse().slice(0, 2).join('.');

// «Гроші операцій» on the page «Витрати»: what every campaign cost (Claude + Higgsfield) in the chosen period, how close it is to its cap, and the cap itself can be changed here.
//   projectId: only the operations of this project (the section «Витрати» of the project card)
//   campaignId: only this operation (the section «Витрати» of an operation)
export default function CampaignSpend({ onOpenCampaign, projectId = null, campaignId = null }) {
  const [data, setData] = useState(null);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('month');
  const [edit, setEdit] = useState(null); // { id, cap, step }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [d, p] = await Promise.all([fetchCampaignSpend(), fetchProjects().catch(() => [])]);
      setData(d); setProjects(p);
    } catch (e) { setError(e.message || 'Не вдалося завантажити витрати операцій.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // one project: its operations and only the money spent in them
  const scoped = useMemo(() => {
    if (!data || (projectId == null && campaignId == null)) return data;
    const ids = new Set(data.campaigns.filter((c) => (campaignId != null ? c.id === campaignId : c.project_id === projectId)).map((c) => c.id));
    return { campaigns: data.campaigns.filter((c) => ids.has(c.id)), tasks: data.tasks.filter((x) => ids.has(x.campaign_id)), spends: data.spends.filter((x) => ids.has(x.campaign_id)) };
  }, [data, projectId, campaignId]);
  const view = useMemo(() => (scoped ? buildCampaignSpend({ ...scoped, projects, period, keepAll: projectId != null || campaignId != null }) : null), [scoped, projects, period, projectId, campaignId]);
  const maxDay = view ? Math.max(0.0001, ...view.days.map((d) => d.claude + d.higgsfield)) : 1;
  const months = useMemo(() => (scoped ? monthlySpend({ tasks: scoped.tasks, spends: scoped.spends }) : []), [scoped]);
  const maxMonth = Math.max(0.0001, ...months.map((m) => m.total));

  async function save() {
    setBusy(true); setMsg('');
    try { await saveCampaignMoney(edit.id, { capUsd: edit.cap, stepUsd: edit.step }); setEdit(null); setMsg('Збережено.'); await load(); } catch (e) { setMsg(e.message || 'Не вдалося зберегти.'); } finally { setBusy(false); }
  }

  return (
    <div className="analytics-section">
      <div className="sys-top">
        <h2 className="analytics-section-title">{campaignId != null ? 'Витрати операції' : projectId != null ? 'Витрати проєкту за операціями' : 'Гроші операцій'}</h2>
        <div className="cs-periods" role="tablist" aria-label="Період">
          {PERIODS.map((p) => <button key={p.key} type="button" role="tab" aria-selected={period === p.key} className={'cs-period' + (period === p.key ? ' on' : '')} onClick={() => setPeriod(p.key)}>{p.label}</button>)}
        </div>
      </div>
      {error && <div className="ai-section-empty cs-bad" role="alert">{error}</div>}
      {!view && !error && <div className="ai-section-empty">Завантаження…</div>}
      {view && (
        <>
          <div className="analytics-stats">
            <div className="analytics-stat"><span className="analytics-stat-value">{money(view.total.total)}</span><span className="analytics-stat-label">Разом за період</span></div>
            <div className="analytics-stat"><span className="analytics-stat-value">{money(view.total.claude)}</span><span className="analytics-stat-label">Claude (агенти)</span></div>
            <div className="analytics-stat"><span className="analytics-stat-value">{money(view.total.higgsfield)}</span><span className="analytics-stat-label">Higgsfield (картинки)</span></div>
          </div>

          {!view.rows.length && <div className="ai-section-empty">Операцій із витратами ще немає.</div>}
          {view.rows.length > 0 && (
            <div className="spend-table-wrap">
              <table className="spend-table cs-table">
                <thead><tr><th>Операція</th><th>Claude</th><th>Higgsfield</th><th>Разом</th><th>Ліміт (за весь час)</th></tr></thead>
                <tbody>
                  {view.rows.map((r) => {
                    const editing = edit && edit.id === r.id && r.id != null;
                    return (
                      <tr key={r.id ?? 'none'}>
                        <td>
                          <div className="cs-name">
                            {r.id != null && onOpenCampaign ? <button type="button" className="cs-link" onClick={() => onOpenCampaign(r.id)}>{r.name}</button> : <b>{r.name}</b>}
                            <span>{[r.project, r.status && CAMPAIGN_STATUS[r.status]].filter(Boolean).join(' · ')}</span>
                          </div>
                        </td>
                        <td>{money(r.claude, 3)}</td><td>{money(r.higgsfield, 2)}</td><td><b>{money(r.total, 2)}</b></td>
                        <td>
                          {editing ? (
                            <div className="cs-edit">
                              <label>Ліміт $<input type="text" inputMode="decimal" value={edit.cap} onChange={(e) => setEdit({ ...edit, cap: e.target.value })} placeholder="без ліміту" aria-label="Ліміт операції" /></label>
                              <label>Сповіщення кожні $<input type="text" inputMode="decimal" value={edit.step} onChange={(e) => setEdit({ ...edit, step: e.target.value })} aria-label="Крок сповіщень" /></label>
                              <div className="cs-edit-btns"><button type="button" className="ai-section-btn ai-section-btn-primary" onClick={save} disabled={busy}>{busy ? '…' : 'Зберегти'}</button><button type="button" className="ai-section-btn" onClick={() => setEdit(null)} disabled={busy}>Скасувати</button></div>
                            </div>
                          ) : (
                            <div className="cs-cap">
                              {r.cap != null ? (
                                <>
                                  <div className="spend-limit-top"><span>{money(r.allTime)} з {money(r.cap)}</span></div>
                                  <div className="spend-bar"><span className={'spend-bar-fill' + (r.hot ? ' hot' : '')} style={{ width: (r.pct || 0) * 100 + '%' }} /></div>
                                </>
                              ) : <span className="cs-muted">{r.id != null ? `без ліміту · витрачено ${money(r.allTime)}` : `витрачено ${money(r.allTime)}`}</span>}
                              {r.id != null && <button type="button" className="cs-link cs-small" onClick={() => { setMsg(''); setEdit({ id: r.id, cap: r.cap == null ? '' : String(r.cap), step: String(r.step ?? 2) }); }}>Змінити ліміт</button>}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {msg && <p className="spend-message" role="status">{msg}</p>}
          <p className="analytics-note">Гроші операції — це Claude (кроки агентів) і Higgsfield (зображення). Коли операція досягає ліміту, нові запуски зупиняються й приходить сповіщення. Крок сповіщень 0 вимикає повідомлення про кожні витрачені N доларів.</p>

          <h3 className="sys-sub">Щодня (30 днів), Claude і Higgsfield</h3>
          <div className="spend-days" role="img" aria-label="Витрати операцій по днях">
            {view.days.map((d) => {
              const total = d.claude + d.higgsfield;
              return (
                <div className="spend-day" key={d.date} title={`${fmtDay(d.date)}: ${money(total, 3)} (Claude ${money(d.claude, 3)}, Higgsfield ${money(d.higgsfield, 3)})`}>
                  <span className="cs-stack" style={{ height: Math.max(2, (total / maxDay) * 100) + '%' }}>
                    {d.higgsfield > 0 && <span className="cs-hf" style={{ flex: d.higgsfield }} />}
                    {d.claude > 0 && <span className="cs-cl" style={{ flex: d.claude }} />}
                  </span>
                  <span className="spend-day-label">{Number(d.date.slice(8)) % 5 === 0 || d.date === view.days[view.days.length - 1].date ? fmtDay(d.date) : ''}</span>
                </div>
              );
            })}
          </div>
          <p className="analytics-note cs-legend"><i className="cs-sw cs-cl" /> Claude <i className="cs-sw cs-hf" /> Higgsfield</p>

          <h3 className="sys-sub">Місяці поруч (останні 6)</h3>
          <div className="spend-table-wrap">
            <table className="spend-table cs-months">
              <thead><tr><th>Місяць</th><th>Claude</th><th>Higgsfield</th><th>Разом</th><th>Проти попереднього</th></tr></thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month}>
                    <td><div className="spend-agent">{m.label}<span className="spend-agent-bar"><span style={{ width: (m.total / maxMonth) * 100 + '%' }} /></span></div></td>
                    <td>{money(m.claude, 2)}</td><td>{money(m.higgsfield, 2)}</td><td><b>{money(m.total, 2)}</b></td>
                    <td className={m.delta > 0 ? 'cs-up' : m.delta < 0 ? 'cs-down' : ''}>{m.delta == null ? '—' : m.delta === 0 ? 'без змін' : `${m.delta > 0 ? '+' : '−'}${money(Math.abs(m.delta), 2)}${m.pct != null ? ` (${m.pct > 0 ? '+' : ''}${m.pct}%)` : ''}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
