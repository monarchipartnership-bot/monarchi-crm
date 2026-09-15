import AutoResizeTextarea from './AutoResizeTextarea';
import { CLIENT_PLATFORMS, CLIENT_TYPES } from '../../lib/reportConstants';

const FIELD_ICONS = {
  platform: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/></svg>',
  leadType: '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5-4.7-4.6 6.5-.9z"/></svg>',
  name: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>',
  text: '<svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
};

// Editable "Клієнти" rows: platform + lead type dropdowns, name + free-text
// fields. `iconBoxed` (Sales Daily Report only) swaps the plain label+input
// `.cf` layout for icon-badged `.wk-field-box` fields — Monthly's own usage
// leaves it unset and renders exactly as before.
export default function EditableClientList({ items, onChange, onAdd, onRemove, capturing, iconBoxed = false }) {
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
                  <select value={item.platform} onChange={(e) => setField(item.id, 'platform', e.target.value)}>
                    {CLIENT_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
              </ClientField>
              <ClientField iconBoxed={iconBoxed} icon={FIELD_ICONS.leadType} label="Тип клієнта">
                {capturing ? (
                  <div className="capture-text">{item.leadType}</div>
                ) : (
                  <select value={item.leadType} onChange={(e) => setField(item.id, 'leadType', e.target.value)}>
                    {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}
              </ClientField>
              <ClientField iconBoxed={iconBoxed} icon={FIELD_ICONS.name} label="Ім&#39;я клієнта">
                <AutoResizeTextarea
                  value={item.name}
                  onChange={(v) => setField(item.id, 'name', v)}
                  placeholder="напр. Acme Inc."
                  capturing={capturing}
                />
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
