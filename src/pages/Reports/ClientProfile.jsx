import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchClientById, updateClientDirectoryEntry } from '../../lib/api/clients';
import { fetchCustomTags, saveCustomTag } from '../../lib/api/customTags';
import { fetchDealsForClient } from '../../lib/api/deals';
import { fetchPipelines } from '../../lib/api/pipelines';
import { fetchAllProfiles, profileLabel } from '../../lib/api/profile';
import { CLIENT_PLATFORMS, CLIENT_TYPES } from '../../lib/reportConstants';
import { useAuth } from '../../contexts/AuthContext';
import ClientAvatar from '../../components/Clients/ClientAvatar';
import ClientActivityTab from '../../components/Clients/ClientActivityTab';
import ClientNotesTab from '../../components/Clients/ClientNotesTab';
import ClientFilesTab from '../../components/Clients/ClientFilesTab';
import TagInput from '../../components/Automation/TagInput';
import AddDealModal from '../../components/Deals/AddDealModal';
import { SECTION_ICONS } from '../../lib/reportIcons';
import '../../styles/reportPage.css';
import '../../styles/automationTasksPage.css';
import '../../styles/comparePage.css';
import '../../styles/clientsDirectory.css';
import '../../styles/clientProfile.css';
import '../../styles/dealsBoard.css';

const CLIENT_TAG_SUGGESTIONS = ['VIP', 'Пріоритетний', 'Ризик відтоку'];
const TAG_CONTEXT = 'client_tags';

const TABS = [
  { key: 'info', label: 'Основна інформація' },
  { key: 'activity', label: 'Активність' },
  { key: 'notes', label: 'Нотатки' },
  { key: 'files', label: 'Файли' },
];

export default function ClientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { email } = useAuth();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');
  const [tagSuggestions, setTagSuggestions] = useState(CLIENT_TAG_SUGGESTIONS);
  const [deals, setDeals] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [addDealOpen, setAddDealOpen] = useState(false);

  function reloadDeals() {
    fetchDealsForClient(id).then(setDeals);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchClientById(id).then((row) => { if (!cancelled) { setClient(row); setLoading(false); } });
    fetchCustomTags(TAG_CONTEXT).then((saved) => {
      if (saved.length) setTagSuggestions((prev) => [...new Set([...prev, ...saved])]);
    });
    fetchDealsForClient(id).then((rows) => { if (!cancelled) setDeals(rows); });
    fetchPipelines().then((rows) => { if (!cancelled) setPipelines(rows); });
    fetchAllProfiles().then((rows) => { if (!cancelled) setProfiles(rows.map((p) => ({ email: p.email, label: profileLabel(p) }))); });
    return () => { cancelled = true; };
  }, [id]);

  function handleNewTag(tag) {
    setTagSuggestions((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    saveCustomTag(TAG_CONTEXT, tag);
  }

  function patch(fields) {
    const before = client;
    setClient((c) => ({ ...c, ...fields }));
    updateClientDirectoryEntry(before.id, fields, before, email);
  }

  if (loading) return <div className="report-page"><div className="placeholder"><p>Завантаження…</p></div></div>;
  if (!client) return <div className="report-page"><div className="placeholder"><p>Клієнта не знайдено.</p></div></div>;

  return (
    <div className="report-page">
      <button type="button" className="btn client-profile-back" onClick={() => navigate('/reports/clients-directory')}>&larr; Назад до бази клієнтів</button>

      <section className="rpt-hero client-profile-hero">
        <ClientAvatar name={client.name} size={64} />
        <div>
          <div className="rpt-hero-heading">
            <span className="rpt-hero-icon" dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Клієнти'] }} />
            <h1>{client.name}</h1>
          </div>
          <p className="sub">{client.company || 'Компанія не вказана'}</p>
        </div>
      </section>

      <div className="client-panel-tabs client-profile-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={'client-panel-tab' + (activeTab === t.key ? ' active' : '')} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <section className="report-section client-profile-section">
        {activeTab === 'info' && (
          <div className="client-profile-info">
            <div className="task-filter-row">
              <label>Ім'я</label>
              <input type="text" value={client.name || ''} onChange={(e) => patch({ name: e.target.value })} />
            </div>
            <div className="task-filter-row">
              <label>Компанія</label>
              <input type="text" value={client.company || ''} onChange={(e) => patch({ company: e.target.value })} />
            </div>
            <div className="task-filter-row">
              <label>Платформа</label>
              <select value={client.platform || ''} onChange={(e) => patch({ platform: e.target.value })}>
                {CLIENT_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="task-filter-row">
              <label>Тип клієнта</label>
              <select value={client.lead_type || ''} onChange={(e) => patch({ lead_type: e.target.value })}>
                {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="client-profile-tags-label">Теги</div>
            <TagInput
              tags={client.tags || []}
              onChange={(tags) => patch({ tags })}
              suggestions={tagSuggestions}
              onNewTag={handleNewTag}
            />

            <div className="client-profile-tags-label">Угоди клієнта</div>
            {deals.length === 0 ? (
              <p className="client-history-empty">Угод ще немає.</p>
            ) : (
              <div className="client-history-list">
                {deals.map((d) => (
                  <div className="client-history-item" key={d.id}>
                    <div className="client-history-week">{d.pipelines?.name ? `${d.pipelines.name} · ` : ''}{d.deal_stages?.label}{d.amount ? ` · ${Number(d.amount).toLocaleString('uk-UA')} ${d.currency}` : ''}</div>
                    {d.manager && <div className="client-history-text">{d.manager}</div>}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" className="btn btn-p" onClick={() => setAddDealOpen(true)}>+ Створити угоду</button>
              <button type="button" className="btn" onClick={() => navigate('/reports/deals')}>Переглянути в Угодах</button>
            </div>
          </div>
        )}
        {activeTab === 'activity' && <ClientActivityTab clientId={client.id} name={client.name} />}
        {activeTab === 'notes' && <ClientNotesTab notes={client.notes} onSave={(notes) => patch({ notes })} />}
        {activeTab === 'files' && <ClientFilesTab clientId={client.id} uploadedBy={email} />}
      </section>

      {addDealOpen && pipelines.length > 0 && (
        <AddDealModal
          pipelines={pipelines}
          defaultPipelineId={pipelines.find((p) => p.name === client.platform)?.id || pipelines[0]?.id}
          presetClient={client}
          profiles={profiles}
          onClose={() => setAddDealOpen(false)}
          onCreated={reloadDeals}
        />
      )}
    </div>
  );
}
