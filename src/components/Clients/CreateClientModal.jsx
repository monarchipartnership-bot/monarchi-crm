import { useEffect, useState } from 'react';
import PlatformPicker from '../common/PlatformPicker';
import Select from '../common/Select';
import { upsertClientDirectoryEntry } from '../../lib/api/clients';
import { createDeal } from '../../lib/api/deals';
import { fetchPipelines } from '../../lib/api/pipelines';
import { fetchAllProfiles, profileLabel } from '../../lib/api/profile';
import { CLIENT_PLATFORMS } from '../../lib/reportConstants';
import { STATUSES } from '../../lib/clientStatus';
import { CONTACT_TYPES } from '../../lib/clientTypeAndSource';
import { COUNTRIES, flagClass } from '../../lib/countries';
import { useLeadChannels } from '../../lib/leadChannels';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';

const CONTACT_TYPE_OPTIONS = CONTACT_TYPES.map((t) => ({ value: t, label: t }));
const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.code, label: c.name, iconClassName: flagClass(c.code) }));

// Manual "Створити контакт" form for ClientsDirectory.jsx. Besides the core
// identity (ім'я, платформа, статус, менеджер) it takes the everyday contact
// fields (прізвище, телефон, email, країна, компанія, канал, тип контакту) so
// nothing has to be filled in afterwards on the profile page. With "Створити
// угоду" on, it also opens a deal in the pipeline named after the platform
// (the same platform → pipeline rule the report autosave uses, see
// reportClientSync.js), carrying over the manager and the channel.
export default function CreateClientModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [platform, setPlatform] = useState(CLIENT_PLATFORMS[0]);
  const [status, setStatus] = useState(STATUSES[0]);
  const [manager, setManager] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [company, setCompany] = useState('');
  const [source, setSource] = useState('');
  const [contactType, setContactType] = useState(CONTACT_TYPES[0]);
  const [createDealToo, setCreateDealToo] = useState(true);
  const [profiles, setProfiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { options: sourceOptions, addChannel } = useLeadChannels();

  useEffect(() => { fetchAllProfiles().then((rows) => setProfiles(rows.map(profileLabel))); }, []);

  async function handleSave() {
    const first = name.trim();
    if (!first) return;
    setSaving(true);
    setError('');
    try {
      const fullName = [first, lastName.trim()].filter(Boolean).join(' ');
      const client = await upsertClientDirectoryEntry({
        name: fullName, platform, status, manager,
        extra: { phone, email, country, company, source, contact_type: contactType },
      });
      if (!client) { setError('Не вдалося створити контакт.'); return; }
      if (createDealToo) {
        // Best effort: the contact already exists, so a missing pipeline or a
        // failed deal never blocks opening the new profile.
        try {
          const pipelines = await fetchPipelines();
          const pipeline = pipelines.find((p) => p.name === platform);
          if (pipeline) await createDeal({ clientId: client.id, manager, pipelineId: pipeline.id, source });
        } catch (e) { console.warn('auto deal for new contact failed', e); }
      }
      onCreated(client);
    } catch (e) {
      setError('Помилка створення контакту: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  }

  const field = (icon, label, control, wide) => (
    <div className={'wk-field-box' + (wide ? ' wk-field-box-wide' : '')}>
      <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: icon }} />
      <div className="wk-field-body">
        <label>{label}</label>
        {control}
      </div>
    </div>
  );

  return (
    <div className="tmodal-overlay contacts-design" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tmodal-box create-client-modal">
        <div className="tmodal-head">
          <h3>Створити контакт</h3>
          <button type="button" className="tmodal-close" onClick={onClose} aria-label="Закрити">&times;</button>
        </div>
        <div className="tmodal-body">
          <div className="task-detail-edit-fields">
            {field(FIELD_ICONS.assignee, "Ім'я", <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ім'я клієнта" autoFocus />)}
            {field(FIELD_ICONS.user, 'Прізвище', <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />)}
            {field(FIELD_ICONS.phone, 'Телефон', <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />)}
            {field(FIELD_ICONS.email, 'Email', <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} />)}
            {field(FIELD_ICONS.company, 'Компанія', <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} />)}
            {field(FIELD_ICONS.mapPin, 'Країна', <Select bare searchable value={country} onChange={setCountry} options={COUNTRY_OPTIONS} placeholder="Не вказано" />)}
            {field(FIELD_ICONS.briefcase, 'Платформа', <PlatformPicker value={platform} onChange={setPlatform} />, true)}
            {field(FIELD_ICONS.source, 'Канал (Source)', <Select bare searchable onCreate={addChannel} value={source} onChange={setSource} options={sourceOptions} placeholder="Не вказано" />)}
            {field(FIELD_ICONS.tag, 'Тип контакту', <Select bare value={contactType} onChange={setContactType} options={CONTACT_TYPE_OPTIONS} />)}
            {field(FIELD_ICONS.tag, 'Статус', <Select bare value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: s }))} />)}
            {field(FIELD_ICONS.owner, 'Менеджер', <Select bare value={manager} onChange={setManager} options={[{ value: '', label: 'Не призначено' }, ...profiles.map((p) => ({ value: p, label: p }))]} />)}
          </div>
          <label className="create-client-deal-toggle">
            <input type="checkbox" checked={createDealToo} onChange={(e) => setCreateDealToo(e.target.checked)} />
            <span>Одразу створити угоду в воронці «{platform}»</span>
          </label>
          {error && <p className="import-error">{error}</p>}
        </div>
        <div className="tmodal-foot">
          <button type="button" className="btn" onClick={onClose}>Скасувати</button>
          <button type="button" className="btn btn-p" onClick={handleSave} disabled={!name.trim() || saving}>{saving ? '...' : 'Створити'}</button>
        </div>
      </div>
    </div>
  );
}
