import { useEffect, useRef, useState } from 'react';
import ActionIcon from '../common/ActionIcon';
import PlatformPicker from '../common/PlatformPicker';
import Select from '../common/Select';
import ClientNameField from './ClientNameField';
import AutoResizeTextarea from './AutoResizeTextarea';
import { fetchClientDirectory } from '../../lib/api/clients';
import { clientFullName } from '../../lib/clientName';
import { STATUSES } from '../../lib/clientStatus';
import { LeadChannelSelect, UpworkChannelSelect } from './LeadChannelFields';
import { needsUpworkChannel } from '../../lib/upworkChannels';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import { SECTION_ICONS } from '../../lib/reportIcons';

// Popup form for Daily Report's "Клієнти" section — same field set as
// EditableClientList's inline row (Платформа/Статус/Ім'я/Назва/Інформація),
// just collected in one modal instead of five always-open boxes, now that
// the section itself renders as a compact list (see DailyCreate.jsx). Saving
// does NOT call the client-directory API directly — it hands the filled-in
// fields back to the parent, which pushes/updates a row in the report's own
// `clients` array exactly as the inline fields used to. That array is still
// the one true source the report's debounced autosave syncs to the real
// client/deal/note tables (reportClientSync.js) — this modal only changes
// how the fields get filled in, not who owns the data afterward.
//
// `initial` (nullable) switches between "add" (blank form) and "edit"
// (pre-filled, editing an existing row in place) — same modal either way.
//
// Field layout is `.modal-field` (icon+label+description header, then the
// control full-width below), not `.wk-field-box` (icon beside a compact
// control) — this popup has room to breathe and explains what each field is
// for, unlike a report's own always-open inline row.
export default function AddClientModal({ initial, defaultPlatform, defaultStatus, onClose, onSave }) {
  const [platform, setPlatform] = useState(initial?.platform || defaultPlatform);
  const [leadType, setLeadType] = useState(initial?.leadType || defaultStatus);
  const [name, setName] = useState(initial?.name || '');
  const [clientId, setClientId] = useState(initial?.clientId || null);
  const [title, setTitle] = useState(initial?.title || '');
  const [text, setText] = useState(initial?.text || '');
  const [channel, setChannel] = useState(initial?.channel || '');
  const [upworkChannel, setUpworkChannel] = useState(initial?.upworkChannel || '');
  const [directory, setDirectory] = useState([]);
  const boxRef = useRef(null);

  useEffect(() => { fetchClientDirectory().then(setDirectory); }, []);

  // Keyboard + focus: Escape closes, Tab stays inside the dialog, focus goes
  // back to whatever opened it, and the page underneath doesn't scroll.
  useEffect(() => {
    const opener = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e) {
      if (e.key === 'Escape') {
        // A open dropdown (Select / PlatformPicker) closes first; its own handler runs on the same key.
        if (document.querySelector('.ui-select-menu, .platform-picker-menu:not(.closing)')) return;
        e.stopPropagation(); onClose(); return;
      }
      if (e.key !== 'Tab' || !boxRef.current) return;
      const f = [...boxRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = prevOverflow; opener?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || needsUpworkChannel({ platform, upworkChannel })) return;
    onSave({ platform, leadType, name: trimmed, clientId, title: title.trim(), text, channel, upworkChannel: platform === 'Upwork' ? upworkChannel : '' });
  }

  const missingUpworkChannel = needsUpworkChannel({ platform, upworkChannel });

  return (
    <div className="tmodal-overlay daily-report-design" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tmodal-box" ref={boxRef} role="dialog" aria-modal="true" aria-labelledby="add-client-title">
        <div className="tmodal-head">
          <div className="tmodal-head-left">
            <span className="tmodal-head-icon" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }} dangerouslySetInnerHTML={{ __html: SECTION_ICONS['Клієнти'] }} />
            <div className="tmodal-head-text">
              <h3 id="add-client-title">{initial ? 'Редагувати клієнта' : 'Додати клієнта'}</h3>
              <p>{initial ? 'Оновіть інформацію про клієнта' : 'Додайте нового клієнта, щоб почати роботу'}</p>
            </div>
          </div>
          <button type="button" className="tmodal-close" onClick={onClose} aria-label="Закрити"><ActionIcon name="close" size={20} /></button>
        </div>
        <div className="tmodal-body">
          <div className="modal-field">
            <div className="modal-field-head">
              <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #60A5FA, #2563EB)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.briefcase }} />
              <div>
                <label>Платформа</label>
                <p>Оберіть платформу, звідки прийшов клієнт</p>
              </div>
            </div>
            <div className="modal-field-control">
              <PlatformPicker value={platform} onChange={setPlatform} />
            </div>
          </div>

          {platform === 'Upwork' && (
            <div className="modal-field">
              <div className="modal-field-head">
                <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #60A5FA, #2563EB)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.source }} />
                <div>
                  <label>Канал Upwork *</label>
                  <p>Обов'язково для лідів з Upwork — за ним рахуються тижневі та місячні цифри</p>
                </div>
              </div>
              <div className="modal-field-control">
                <UpworkChannelSelect value={upworkChannel} onChange={setUpworkChannel} />
              </div>
            </div>
          )}

          <div className="modal-field">
            <div className="modal-field-head">
              <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.source }} />
              <div>
                <label>Канал (Source)</label>
                <p>Звідки прийшов лід; потрібного каналу немає — додайте його в списку</p>
              </div>
            </div>
            <div className="modal-field-control">
              <LeadChannelSelect value={channel} onChange={setChannel} />
            </div>
          </div>

          <div className="modal-field">
            <div className="modal-field-head">
              <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #2DD4BF, #0D9488)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.tag }} />
              <div>
                <label>Статус</label>
                <p>Встановіть поточний статус клієнта</p>
              </div>
            </div>
            <div className="modal-field-control">
              <Select value={leadType} onChange={setLeadType} options={STATUSES.map((s) => ({ value: s, label: s }))} />
            </div>
          </div>

          <div className="modal-field">
            <div className="modal-field-head">
              <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.assignee }} />
              <div>
                <label>Ім'я клієнта</label>
                <p>Назва компанії або ім'я замовника</p>
              </div>
            </div>
            <div className="modal-field-control">
              <ClientNameField
                value={name}
                clientId={clientId}
                directory={directory}
                onTextChange={(v) => { setName(v); setClientId(null); }}
                onPick={(c) => {
                  setName(clientFullName(c));
                  setClientId(c.id);
                  if (c.platform) setPlatform(c.platform);
                  if (c.status) setLeadType(c.status);
                }}
              />
            </div>
          </div>

          <div className="modal-field">
            <div className="modal-field-head">
              <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #F472B6, #DB2777)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.title }} />
              <div>
                <label>Назва</label>
                <p>Назва посту або проєкту</p>
              </div>
            </div>
            <div className="modal-field-control">
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="напр. назва посту на Upwork" />
            </div>
          </div>

          <div className="modal-field">
            <div className="modal-field-head">
              <span className="modal-field-icon" style={{ background: 'linear-gradient(135deg, #94A3B8, #475569)' }} dangerouslySetInnerHTML={{ __html: FIELD_ICONS.document }} />
              <div>
                <label>Інформація</label>
                <p>Додайте деталі або наступну дію</p>
              </div>
            </div>
            <div className="modal-field-control">
              <AutoResizeTextarea value={text} onChange={setText} placeholder="Опишіть дію..." />
            </div>
          </div>
        </div>
        <div className="tmodal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button type="button" className="btn btn-p" onClick={handleSave} disabled={!name.trim() || missingUpworkChannel} title={missingUpworkChannel ? 'Оберіть канал Upwork' : undefined}>
            {initial ? <ActionIcon name="save" size={18} /> : <ActionIcon name="create" size={18} />} {initial ? 'Зберегти' : 'Додати'}
          </button>
        </div>
      </div>
    </div>
  );
}
