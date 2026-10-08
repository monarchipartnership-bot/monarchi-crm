import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProjectsForClient } from '../../lib/api/projects';
import { STATUS_LABEL, fmtIsoDate } from '../../lib/projectConstants';
import { platformInfo, statusInfo, formatAccountId } from '../../lib/adAccounts';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import '../../styles/projectAccounts.css';

const PROJECT_STATUS_TONE = { active: 'ok', paused: 'warn', completed: 'muted' };

// "Проекти" tab on a contact card: the projects linked to this contact
// (projects.client_id), as a list with the selected project's details beside
// it — the same shape as the "Угоди" tab. Opening a project goes to its own page.
export default function ClientProjectsTab({ clientId }) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchProjectsForClient(clientId).then((rows) => {
      if (cancelled) return;
      setProjects(rows);
      setSelectedId((cur) => (rows.some((p) => p.id === cur) ? cur : rows[0]?.id ?? null));
    });
    return () => { cancelled = true; };
  }, [clientId]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (projects || []).filter((p) => !q || (p.name || '').toLowerCase().includes(q) || (p.manager || '').toLowerCase().includes(q));
  }, [projects, search]);

  if (projects == null) return <div className="client-profile-info"><p className="client-history-empty">Завантаження…</p></div>;

  if (!projects.length) {
    return (
      <div className="client-profile-info">
        <p className="client-history-empty">Проєктів у цього контакту ще немає.</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button type="button" className="btn btn-p" onClick={() => navigate('/projects', { state: { newForClient: clientId } })}>Створити проект</button>
          <button type="button" className="btn" onClick={() => navigate('/projects')}>Усі проекти</button>
        </div>
      </div>
    );
  }

  const selected = projects.find((p) => p.id === selectedId) || null;

  return (
    <div className="client-profile-deals-layout">
      <div className="client-profile-deals-list-card">
        <div className="client-profile-deals-list-head">
          <h3>Проєкти ({projects.length})</h3>
          <button type="button" className="btn" onClick={() => navigate('/projects', { state: { newForClient: clientId } })}>+ Новий</button>
        </div>
        <div className="client-profile-deals-search">
          <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.search }} />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук серед проєктів..." />
        </div>
        <div className="client-profile-deals-list">
          {shown.map((p) => (
            <button type="button" key={p.id} className={'client-profile-deal-row' + (p.id === selectedId ? ' active' : '')} onClick={() => setSelectedId(p.id)}>
              <span className="client-profile-mini-row-ic" style={{ background: 'linear-gradient(135deg, #A78BFA, #6D28D9)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.briefcase }} />
              <div className="client-profile-deal-row-body">
                <div className="client-profile-deal-row-top">
                  <div className="client-profile-deal-row-title">{p.name}</div>
                  <span className={'pacc-pill pacc-pill--' + (PROJECT_STATUS_TONE[p.status] || 'muted')}>{STATUS_LABEL[p.status] || p.status}</span>
                </div>
                <div className="client-profile-deal-row-meta">
                  {(p.project_ad_accounts || []).map((a) => <span key={a.platform}>{platformInfo(a.platform).label}</span>)}
                  {p.manager && <span>{p.manager}</span>}
                </div>
              </div>
              <span className="client-profile-deal-row-chevron" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.externalLink }} />
            </button>
          ))}
          {!shown.length && <p className="client-history-empty">Нічого не знайдено.</p>}
        </div>
      </div>

      <div className="client-profile-deal-detail-card">
        {!selected ? (
          <p className="client-history-empty">Оберіть проєкт зі списку.</p>
        ) : (
          <>
            <div className="client-profile-deal-detail-top">
              <span className={'pacc-pill pacc-pill--' + (PROJECT_STATUS_TONE[selected.status] || 'muted')}>{STATUS_LABEL[selected.status] || selected.status}</span>
              <div className="client-profile-deal-detail-top-actions">
                <button type="button" className="btn btn-p" onClick={() => navigate('/projects/' + selected.id)}>
                  <span className="client-profile-action-ic client-profile-action-ic--ghost" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.externalLink }} />
                  Відкрити проєкт
                </button>
              </div>
            </div>

            <h2 className="client-profile-deal-detail-title">{selected.name}</h2>

            <div className="client-profile-deal-detail-stats">
              <div>
                <div className="client-profile-deal-detail-stat-label">Період співпраці</div>
                <div className="client-profile-deal-detail-stat-value client-profile-deal-detail-stat-value--sm">
                  {fmtIsoDate(selected.start_date) || '—'} – {fmtIsoDate(selected.end_date) || '—'}
                </div>
              </div>
              <div>
                <div className="client-profile-deal-detail-stat-label">Продакт</div>
                <div className="client-profile-deal-detail-stat-value client-profile-deal-detail-stat-value--sm">{selected.manager || '—'}</div>
              </div>
              <div>
                <div className="client-profile-deal-detail-stat-label">Послуги</div>
                <div className="client-profile-deal-detail-stat-value client-profile-deal-detail-stat-value--sm">{selected.services?.length ? selected.services.join(', ') : '—'}</div>
              </div>
            </div>

            <div className="pacc-client-accounts">
              <div className="client-profile-deal-detail-stat-label">Рекламні кабінети</div>
              {(selected.project_ad_accounts || []).length ? (selected.project_ad_accounts || []).map((a) => {
                const info = platformInfo(a.platform);
                return (
                  <div className="pacc-found" key={a.platform}>
                    <span className="pacc-badge pacc-badge--sm" style={{ background: info.gradient }}>{info.mark}</span>
                    <div className="pacc-found-body">
                      <div className="pacc-found-name">{a.account_name || 'Без назви'}</div>
                      <div className="pacc-found-meta">{info.label} · {formatAccountId(a.platform, a.account_id)}</div>
                    </div>
                    <span className={'pacc-pill pacc-pill--' + statusInfo(a.account_status).tone}>{statusInfo(a.account_status).label}</span>
                  </div>
                );
              }) : <p className="client-history-empty">Кабінет не підключено.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
