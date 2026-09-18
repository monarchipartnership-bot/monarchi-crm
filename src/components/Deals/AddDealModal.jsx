import { useEffect, useState } from 'react';
import ClientPicker from '../Clients/ClientPicker';
import Select from '../common/Select';
import DatePicker from '../common/DatePicker';
import { createDeal } from '../../lib/api/deals';
import { updateClientDirectoryEntry } from '../../lib/api/clients';
import { fetchDealStages } from '../../lib/api/dealStages';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';

// `defaultPipelineId` seeds the form's own Pipeline field from whatever
// pipeline the board is currently showing — but the form's Pipeline can be
// changed independently (e.g. adding a LinkedIn deal while browsing the
// Upwork board), which reloads this form's own stage options to match.
// `defaultStageId` additionally preselects a stage when opened from a
// specific Kanban column (only meaningful while the form's pipeline still
// matches the board's). `presetClient` pre-selects the contact (and its
// company) when the form is opened from that client's own card — the picker
// still shows it as changeable via "Змінити", nothing is locked.
export default function AddDealModal({ pipelines, defaultPipelineId, defaultStageId, presetClient, profiles, onClose, onCreated }) {
  const [pipelineId, setPipelineId] = useState(defaultPipelineId || pipelines[0]?.id || '');
  const [stages, setStages] = useState([]);
  const [stageId, setStageId] = useState(defaultStageId || '');
  const [client, setClient] = useState(presetClient || null);
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [chatLink, setChatLink] = useState('');
  const [company, setCompany] = useState(presetClient?.company || '');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [manager, setManager] = useState('');
  const [expectedClose, setExpectedClose] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!pipelineId) return;
    fetchDealStages(pipelineId).then((rows) => {
      setStages(rows);
      setStageId((cur) => (rows.some((s) => String(s.id) === String(cur)) ? cur : (rows[0]?.id || '')));
    });
  }, [pipelineId]);

  function handleClientChange(c) {
    setClient(c);
    setCompany(c?.company || '');
  }

  const activePipeline = pipelines.find((p) => String(p.id) === String(pipelineId));

  async function handleSave() {
    if (!client || !pipelineId) return;
    setSaving(true);
    try {
      const deal = await createDeal({
        clientId: client.id, manager, stageId, pipelineId, title, source, chatLink,
        amount: amount === '' ? null : Number(amount), currency,
        expectedCloseDate: expectedClose || null,
      });
      if (deal) {
        if (company.trim() !== (client.company || '')) {
          updateClientDirectoryEntry(client.id, { company: company.trim() || null }, client).catch(() => {});
        }
        onCreated(deal);
      }
      onClose();
    } catch (e) {
      alert('Помилка створення угоди: ' + (e.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tmodal-box">
        <div className="tmodal-head">
          <h3>Додати угоду</h3>
          <button type="button" className="tmodal-close" onClick={onClose} aria-label="Закрити">&times;</button>
        </div>
        <div className="tmodal-body">
          <div className="task-detail-edit-fields">
            <div className="wk-field-box wk-field-box-wide">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.title }} />
              <div className="wk-field-body">
                <label>Title (необов'язково)</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="напр. Ребрендинг сайту" />
              </div>
            </div>

            <div className="wk-field-box wk-field-box-wide">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.pipeline }} />
              <div className="wk-field-body">
                <label>Pipeline</label>
                <Select
                  bare value={pipelineId} onChange={(v) => setPipelineId(Number(v))}
                  options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
                />
              </div>
            </div>

            <div className="wk-field-box wk-field-box-wide">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.assignee }} />
              <div className="wk-field-body">
                <label>Contact</label>
                <ClientPicker value={client?.id} onChange={handleClientChange} placeholder="Пошук клієнта..." defaultPlatform={activePipeline?.name} manager={manager} />
              </div>
            </div>

            <div className="wk-field-box wk-field-box-wide">
              <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.amount }} />
              <div className="wk-field-body">
                <label>Сума</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>

            {expanded && (
              <>
                <div className="wk-field-box wk-field-box-wide">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.source }} />
                  <div className="wk-field-body">
                    <label>Source</label>
                    <input type="text" value={source} onChange={(e) => setSource(e.target.value)} placeholder="напр. Реферал, холодний лист..." />
                  </div>
                </div>

                <div className="wk-field-box wk-field-box-wide">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.chatLink }} />
                  <div className="wk-field-body">
                    <label>Chat link</label>
                    <input type="text" value={chatLink} onChange={(e) => setChatLink(e.target.value)} placeholder="Посилання на переписку" />
                  </div>
                </div>

                <div className="wk-field-box wk-field-box-wide">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.company }} />
                  <div className="wk-field-body">
                    <label>Company (необов'язково)</label>
                    <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Назва компанії" />
                  </div>
                </div>

                <div className="wk-field-box wk-field-box-wide">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.status }} />
                  <div className="wk-field-body">
                    <label>Стадія</label>
                    <Select
                      bare value={stageId} onChange={setStageId}
                      options={stages.map((s) => ({ value: s.id, label: s.label }))}
                    />
                  </div>
                </div>

                <div className="wk-field-box wk-field-box-wide">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.currency }} />
                  <div className="wk-field-body">
                    <label>Валюта</label>
                    <Select
                      bare value={currency} onChange={setCurrency}
                      options={[{ value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }, { value: 'UAH', label: 'UAH' }]}
                    />
                  </div>
                </div>

                <div className="wk-field-box wk-field-box-wide">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.owner }} />
                  <div className="wk-field-body">
                    <label>Owner</label>
                    <Select
                      bare value={manager} onChange={setManager}
                      options={[{ value: '', label: 'Не призначено' }, ...profiles.map((p) => ({ value: p.label, label: p.label }))]}
                    />
                  </div>
                </div>

                <div className="wk-field-box wk-field-box-wide">
                  <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />
                  <div className="wk-field-body">
                    <label>Очікуване закриття</label>
                    <DatePicker bare value={expectedClose} onChange={setExpectedClose} />
                  </div>
                </div>
              </>
            )}
          </div>

          <button type="button" className="deal-expand-toggle" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Сховати додаткові поля ▴' : 'Показати всі поля ▾'}
          </button>
        </div>
        <div className="tmodal-foot">
          <button type="button" className="btn" onClick={onClose}>Скасувати</button>
          <button type="button" className="btn btn-p" onClick={handleSave} disabled={!client || !pipelineId || saving}>{saving ? '...' : 'Створити угоду'}</button>
        </div>
      </div>
    </div>
  );
}
