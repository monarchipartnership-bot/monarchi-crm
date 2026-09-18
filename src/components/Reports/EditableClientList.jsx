import { useEffect, useState } from 'react';
import AutoResizeTextarea from './AutoResizeTextarea';
import ClientNameField from './ClientNameField';
import { STATUSES } from '../../lib/clientStatus';
import { fetchClientDirectory } from '../../lib/api/clients';
import { clientFullName } from '../../lib/clientName';
import PlatformPicker from '../common/PlatformPicker';

const FIELD_ICONS = {
  platform: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/></svg>',
  leadType: '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5-4.7-4.6 6.5-.9z"/></svg>',
  name: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>',
  title: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  text: '<svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
};

// Editable "Клієнти" rows: platform + status dropdowns, name + free-text
// fields. `iconBoxed` (Sales Daily Report only) swaps the plain label+input
// `.cf` layout for icon-badged `.wk-field-box` fields — Monthly's own usage
// leaves it unset and renders exactly as before.
//
// The name field searches the real client directory live as you type
// (same directory ClientPicker.jsx searches) — picking a match links this
// row to that client (`item.clientId`) and pulls their real platform/status
// in, instead of leaving them as whatever this row's dropdowns happened to
// default to. Typing a name with no match just keeps `clientId` unset, so
// saving the report creates a brand-new client (via
// reportClientSync.js's syncReportClientsToDirectory, matched by normalized
// name) exactly as it already did before this search existed.
//
// `title` (e.g. an Upwork post's own title) becomes that new deal's title
// at creation time; `text` ("Інформація") gets logged onto the deal as a
// dated, manager-attributed note instead of just sitting invisibly inside
// this one report — see reportClientSync.js.
export default function EditableClientList({ items, onChange, onAdd, onRemove, capturing, iconBoxed = false }) {
  const [directory, setDirectory] = useState([]);

  useEffect(() => { fetchClientDirectory().then(setDirectory); }, []);

  const setField = (id, field, value) => {
    onChange(id, { ...items.find((it) => it.id === id), [field]: value });
  };

  return (
    <>
      <div className="items">
        {items.map((item) => (
          <div className="item-box" key={item.id}>
            {!capturing && (
              <button type="button" className="del-btn" title="Видалити" onClick={() => onRemove(item.id)}>&times;</button>
            )}
            {item.fromDaily && <span className="cf-daily-tag">&#8634; Із Daily Report</span>}
            <div className={iconBoxed ? 'client-fields client-fields-boxed' : 'client-fields'}>
              <ClientField iconBoxed={iconBoxed} icon={FIELD_ICONS.platform} label="Платформа">
                {capturing ? (
                  <div className="capture-text">{item.platform}</div>
                ) : (
                  <PlatformPicker value={item.platform} onChange={(v) => setField(item.id, 'platform', v)} />
                )}
              </ClientField>
              <ClientField iconBoxed={iconBoxed} icon={FIELD_ICONS.leadType} label="Статус">
                {capturing ? (
                  <div className="capture-text">{item.leadType}</div>
                ) : (
                  <select value={item.leadType} onChange={(e) => setField(item.id, 'leadType', e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </ClientField>
              <ClientField iconBoxed={iconBoxed} icon={FIELD_ICONS.name} label="Ім&#39;я клієнта">
                <ClientNameField
                  value={item.name}
                  clientId={item.clientId}
                  directory={directory}
                  capturing={capturing}
                  onTextChange={(v) => onChange(item.id, { ...item, name: v, clientId: null })}
                  onPick={(c) => onChange(item.id, {
                    ...item,
                    name: clientFullName(c),
                    clientId: c.id,
                    platform: c.platform || item.platform,
                    leadType: c.status || item.leadType,
                  })}
                />
              </ClientField>
              <ClientField iconBoxed={iconBoxed} icon={FIELD_ICONS.title} label="Назва">
                {capturing ? (
                  <div className="capture-text">{item.title}</div>
                ) : (
                  <input
                    type="text"
                    value={item.title || ''}
                    onChange={(e) => setField(item.id, 'title', e.target.value)}
                    placeholder="напр. назва посту на Upwork"
                  />
                )}
              </ClientField>
              <ClientField iconBoxed={iconBoxed} icon={FIELD_ICONS.text} label="Інформація" wide>
                <AutoResizeTextarea
                  value={item.text}
                  onChange={(v) => setField(item.id, 'text', v)}
                  placeholder="Опишіть дію..."
                  capturing={capturing}
                />
              </ClientField>
            </div>
          </div>
        ))}
      </div>
      {!items.length && <div className="empty-hint">Немає клієнтів &mdash; додайте першого нижче</div>}
      {!capturing && (
        <button type="button" className="add-btn" onClick={onAdd}>+ Додати клієнта</button>
      )}
    </>
  );
}

function ClientField({ iconBoxed, icon, label, wide, children }) {
  if (!iconBoxed) {
    return (
      <div className={wide ? 'cf cf-wide' : 'cf'}>
        <label>{label}</label>
        {children}
      </div>
    );
  }
  return (
    <div className={wide ? 'wk-field-box wk-field-box-wide' : 'wk-field-box'}>
      <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: icon }} />
      <div className="wk-field-body">
        <label>{label}</label>
        {children}
      </div>
    </div>
  );
}
