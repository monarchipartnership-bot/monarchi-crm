import { useState } from 'react';
import Papa from 'papaparse';
import Select from '../common/Select';
import { fetchClientDirectory, createClientDirectoryEntry } from '../../lib/api/clients';
import { createDeal, updateDealFields, fetchAllDeals } from '../../lib/api/deals';
import { fetchDealStages } from '../../lib/api/dealStages';
import { fetchServiceTags } from '../../lib/api/dealServiceTags';
import { normText } from '../../lib/monthlyAggregation';
import { STATUSES } from '../../lib/clientStatus';
import { COUNTRIES } from '../../lib/countries';

// NetHunt "Leads" (Deals) CSV importer — same upload → map → preview →
// import flow as ImportContactsModal.jsx/ImportDealsModal.jsx, but
// dedicated to NetHunt's own export shape rather than a generic mapper:
// unlike ImportDealsModal.jsx (which always targets ONE pipeline chosen up
// front), each row here picks its own pipeline from its "Source" column,
// since a real NetHunt export mixes Upwork/Facebook ads/Website/etc. leads
// in one file. Matches contacts primarily by `nethunt_id` (Contact person
// [ID] ↔ clients.nethunt_id, verified to line up exactly with the already-
// imported Contacts.csv), falling back to name.
const TARGET_FIELDS = [
  { value: 'ignore', label: 'Ігнорувати' },
  { value: 'nethuntId', label: 'Зовнішній ID угоди (NetHunt Record ID)' },
  { value: 'contactNethuntId', label: 'ID контакту (NetHunt) — зв\'язок з клієнтом' },
  { value: 'name', label: 'Назва угоди' },
  { value: 'contactName', label: "Ім'я контакту" },
  { value: 'stage', label: 'Етап (текст)' },
  { value: 'status', label: 'Статус (Won/Lost)' },
  { value: 'leadWarmth', label: 'Прогрів ліда' },
  { value: 'source', label: 'Джерело' },
  { value: 'services', label: 'Послуги (через ;)' },
  { value: 'onHold', label: 'На паузі' },
  { value: 'chatLink', label: 'Посилання на чат' },
  { value: 'website', label: 'Вебсайт клієнта' },
  { value: 'niche', label: 'Ніша бізнесу (вільний текст → нотатка)' },
  { value: 'country', label: 'Країна (код, напр. US)' },
  { value: 'amount', label: 'Сума' },
  { value: 'qualification', label: 'MQL чи SQL' },
  { value: 'description', label: 'Опис (→ нотатка)' },
  { value: 'lostReason', label: 'Причина відмови' },
  { value: 'closedAt', label: 'Дата завершення' },
];

const GUESS_RULES = [
  { field: 'contactNethuntId', re: /contact person\s*\[id\]/i },
  { field: 'nethuntId', re: /record ?id/i },
  { field: 'name', re: /^name$/i },
  { field: 'contactName', re: /contact person/i },
  { field: 'stage', re: /^stage$/i },
  { field: 'status', re: /статус/i },
  { field: 'leadWarmth', re: /прогрів/i },
  { field: 'source', re: /^source$/i },
  { field: 'services', re: /^services$/i },
  { field: 'onHold', re: /on ?hold/i },
  { field: 'chatLink', re: /chat/i },
  { field: 'website', re: /^website$/i },
  { field: 'niche', re: /ніша/i },
  { field: 'country', re: /^country$/i },
  { field: 'amount', re: /amount/i },
  { field: 'qualification', re: /mql|sql/i },
  { field: 'description', re: /^description$/i },
  { field: 'lostReason', re: /причина/i },
  { field: 'closedAt', re: /завершення/i },
];

function guessField(header) {
  return GUESS_RULES.find((r) => r.re.test(header))?.field || 'ignore';
}

// NetHunt's non-terminal Stage text → our own pipeline's 4 open stages
// (confirmed with the user): reads as the natural funnel order.
const STAGE_TEXT_MAP = {
  New: 'Новий лід',
  Presentation: 'Комунікація',
  'Commercial offer': 'Пропозиція',
  Negotiating: 'Переговори',
};

// Source → pipeline name, for the sources that have one; anything else
// (Freelancehunt, Recommendation, Крео, blank) falls back to "Other"
// (confirmed with the user) while the raw Source text is still saved on
// the deal itself.
const SOURCE_TO_PIPELINE = { Upwork: 'Upwork', 'Facebook ads': 'Facebook', Website: 'Website' };

function resolvePipeline(sourceText, pipelines) {
  const mappedName = SOURCE_TO_PIPELINE[sourceText];
  const byMapped = mappedName && pipelines.find((p) => p.name === mappedName);
  if (byMapped) return byMapped;
  const byExact = pipelines.find((p) => p.name.toLowerCase() === (sourceText || '').toLowerCase());
  if (byExact) return byExact;
  return pipelines.find((p) => p.name === 'Other') || null;
}

function resolveStage(statusText, stageText, stages) {
  if (!stages?.length) return null;
  if (statusText === 'Won') return stages.find((s) => s.is_won) || stages[0];
  if (statusText === 'Lost') return stages.find((s) => s.is_lost) || stages[0];
  const mappedLabel = STAGE_TEXT_MAP[stageText];
  return (mappedLabel && stages.find((s) => s.label === mappedLabel)) || stages[0];
}

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
function parseMDY(raw) {
  const m = DATE_RE.exec((raw || '').trim());
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const d = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function ImportNetHuntDealsModal({ pipelines, onClose, onImported }) {
  const [step, setStep] = useState('upload'); // upload | map | preview | importing | done
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [stagesByPipelineId, setStagesByPipelineId] = useState({});
  const [tagsCatalog, setTagsCatalog] = useState([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = Papa.parse(String(reader.result), { header: true, skipEmptyLines: true });
      const cols = parsed.meta?.fields || [];
      if (!cols.length || !parsed.data.length) {
        setError('Не вдалося розпізнати рядки в цьому файлі.');
        return;
      }
      const map = {};
      cols.forEach((h) => { map[h] = guessField(h); });
      setFileName(file.name);
      setHeaders(cols);
      setRows(parsed.data);
      setColumnMap(map);
      setStep('map');
    };
    reader.readAsText(file);
  }

  function valueFor(row, field) {
    const header = headers.find((h) => columnMap[h] === field);
    return header ? String(row[header] ?? '').trim() : '';
  }

  function resolveRow(row) {
    const dealNethuntId = valueFor(row, 'nethuntId') || null;
    const contactNethuntId = valueFor(row, 'contactNethuntId') || null;
    const contactName = valueFor(row, 'contactName');
    const nameRaw = valueFor(row, 'name');
    const displayContactName = contactName || nameRaw;
    const title = nameRaw || contactName || null;

    const sourceText = valueFor(row, 'source');
    const pipeline = resolvePipeline(sourceText, pipelines);
    const stages = pipeline ? stagesByPipelineId[pipeline.id] : null;
    const statusText = valueFor(row, 'status');
    const stage = resolveStage(statusText, valueFor(row, 'stage'), stages);

    const leadWarmthRaw = valueFor(row, 'leadWarmth');
    const leadWarmth = leadWarmthRaw === 'Теплий' ? 'warm' : leadWarmthRaw === 'Холодний' ? 'cold' : null;

    const qualRaw = valueFor(row, 'qualification');
    const qualification = /^sql$/i.test(qualRaw) ? 'SQL' : /^mql$/i.test(qualRaw) ? 'MQL' : /unqualified/i.test(qualRaw) ? 'unqualified' : null;

    const countryRaw = valueFor(row, 'country').toUpperCase();
    const country = COUNTRIES.some((c) => c.code === countryRaw) ? countryRaw : null;

    const amountRaw = valueFor(row, 'amount');
    const amount = amountRaw ? Number(amountRaw) || null : null;

    const servicesText = valueFor(row, 'services');
    const serviceTagIds = servicesText
      ? servicesText.split(';').map((s) => s.trim()).filter(Boolean)
        .map((s) => tagsCatalog.find((t) => t.label.toLowerCase() === s.toLowerCase())?.id)
        .filter(Boolean)
      : [];

    const onHold = /on ?hold/i.test(valueFor(row, 'onHold'));
    const nicheRaw = valueFor(row, 'niche');
    const description = valueFor(row, 'description');
    // deals.niche is a fixed Ukrainian-labeled picker (BUSINESS_NICHES) —
    // NetHunt's free-text niche would never match it, so it goes into the
    // note instead, same gotcha/fix as the Contacts importer's own niche_raw.
    const notes = [
      onHold ? 'На паузі (NetHunt: On Hold)' : '',
      description,
      nicheRaw ? `Ніша бізнесу (з NetHunt, вільний текст): ${nicheRaw}` : '',
    ].filter(Boolean).join('\n\n') || null;

    const closedAt = (stage?.is_won || stage?.is_lost) ? parseMDY(valueFor(row, 'closedAt')) : null;
    const lostReason = stage?.is_lost ? (valueFor(row, 'lostReason') || null) : null;

    return {
      dealNethuntId, contactNethuntId, displayContactName, nameKey: normText(displayContactName),
      title, pipeline, stage, source: sourceText || null,
      chatLink: valueFor(row, 'chatLink') || null, website: valueFor(row, 'website') || null,
      country, amount, qualification, leadWarmth, serviceTagIds, lostReason, closedAt, notes,
      valid: !!displayContactName && !!pipeline && !!stage,
    };
  }

  const mappedRows = rows.map(resolveRow);
  const validCount = mappedRows.filter((r) => r.valid).length;

  async function goToPreview() {
    if (!Object.values(columnMap).some((v) => v === 'contactName' || v === 'name')) {
      setError("Зіставте хоча б одну колонку з полем «Ім'я контакту» або «Назва угоди».");
      return;
    }
    setError('');
    const [stageLists, tags] = await Promise.all([
      Promise.all(pipelines.map((p) => fetchDealStages(p.id).then((s) => [p.id, s]))),
      fetchServiceTags(),
    ]);
    setStagesByPipelineId(Object.fromEntries(stageLists));
    setTagsCatalog(tags);
    setStep('preview');
  }

  async function handleImport() {
    setStep('importing');
    setProgress({ done: 0, total: validCount });
    const [directory, existingDeals] = await Promise.all([fetchClientDirectory(), fetchAllDeals()]);
    const existingNethuntIds = new Set(existingDeals.map((d) => d.nethunt_id).filter(Boolean));
    let createdDeals = 0, createdClients = 0, duplicates = 0;
    const skipped = [];

    for (const row of mappedRows) {
      if (!row.valid) {
        skipped.push({ reason: !row.displayContactName ? 'Немає імені контакту' : !row.pipeline ? 'Не визначено pipeline' : 'Не визначено етап' });
        continue;
      }
      if (row.dealNethuntId && existingNethuntIds.has(row.dealNethuntId)) {
        duplicates++;
        setProgress((p) => ({ ...p, done: p.done + 1 }));
        continue;
      }
      try {
        let client = directory.find((c) => (row.contactNethuntId && c.nethunt_id === row.contactNethuntId) || c.name_key === row.nameKey);
        if (!client) {
          client = await createClientDirectoryEntry({
            name: row.displayContactName, name_key: row.nameKey,
            platform: row.pipeline.name, status: STATUSES[0], nethunt_id: row.contactNethuntId || null,
          });
          directory.push(client);
          createdClients++;
        }
        const deal = await createDeal({
          clientId: client.id, stageId: row.stage.id, pipelineId: row.pipeline.id,
          amount: row.amount, currency: 'USD', title: row.title, source: row.source, chatLink: row.chatLink,
        });
        if (!deal) { skipped.push({ reason: 'Помилка створення угоди' }); continue; }
        await updateDealFields(deal.id, {
          nethunt_id: row.dealNethuntId, website: row.website, country: row.country,
          qualification: row.qualification, lead_warmth: row.leadWarmth, service_tag_ids: row.serviceTagIds,
          lost_reason: row.lostReason, closed_at: row.closedAt, notes: row.notes,
          archived: !!row.stage.is_lost, archived_at: row.stage.is_lost ? new Date().toISOString() : null,
        });
        createdDeals++;
      } catch (e) {
        skipped.push({ reason: e.message || 'Помилка створення угоди' });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setResult({ createdDeals, createdClients, duplicates, skipped });
    setStep('done');
    onImported?.();
  }

  return (
    <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget && step !== 'importing') onClose(); }}>
      <div className="tmodal-box import-contacts-modal">
        <div className="tmodal-head">
          <h3>Імпорт угод з NetHunt</h3>
          {step !== 'importing' && <button type="button" className="tmodal-close" onClick={onClose} aria-label="Закрити">&times;</button>}
        </div>

        <div className="tmodal-body">
          {step === 'upload' && (
            <>
              <p>Завантажте CSV-файл угод (лідів) з NetHunt — кожен рядок сам визначить свій pipeline за колонкою Source.</p>
              <label className="btn btn-p import-file-btn">
                Обрати файл
                <input type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
              </label>
              {error && <p className="import-error">{error}</p>}
            </>
          )}

          {step === 'map' && (
            <>
              <p>Файл: <b>{fileName}</b> · {rows.length} рядків</p>
              <div className="import-map-list" style={{ marginTop: 14 }}>
                {headers.map((h) => (
                  <div className="import-map-row" key={h}>
                    <span className="import-map-header">{h}</span>
                    <Select
                      value={columnMap[h]} onChange={(v) => setColumnMap((m) => ({ ...m, [h]: v }))}
                      options={TARGET_FIELDS}
                    />
                  </div>
                ))}
              </div>
              {error && <p className="import-error">{error}</p>}
            </>
          )}

          {step === 'preview' && (
            <>
              <p>
                <b>{validCount}</b> з {rows.length} рядків готові до імпорту. Клієнт шукається спершу за NetHunt ID контакту, потім за іменем — якщо не знайдено, буде створено новий.
              </p>
              <div className="tbl-wrap import-preview-wrap">
                <table className="cmp-table">
                  <thead>
                    <tr><th>Контакт</th><th>Pipeline</th><th>Етап</th><th>Сума</th><th>Статус</th></tr>
                  </thead>
                  <tbody>
                    {mappedRows.slice(0, 20).map((r, i) => (
                      <tr key={i}>
                        <td>{r.displayContactName || '—'}</td>
                        <td>{r.pipeline?.name || '—'}</td>
                        <td>{r.stage?.label || '—'}</td>
                        <td>{r.amount ?? '—'}</td>
                        <td>{!r.valid ? <span className="chip missing">пропущено</span> : <span className="chip have">ок</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {mappedRows.length > 20 && <p className="import-preview-more">…і ще {mappedRows.length - 20} рядків (усі будуть імпортовані)</p>}
              </div>
            </>
          )}

          {step === 'importing' && (
            <>
              <p>Імпортовано {progress.done} з {progress.total}…</p>
              <div className="import-progress"><div className="import-progress-bar" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
            </>
          )}

          {step === 'done' && result && (
            <>
              <p>
                Готово: створено <b>{result.createdDeals}</b> нових угод
                {result.createdClients > 0 && <>, нових контактів — <b>{result.createdClients}</b></>}
                {result.duplicates > 0 && <>, вже імпортовано раніше — <b>{result.duplicates}</b></>}.
              </p>
              {result.skipped.length > 0 && (
                <>
                  <p>Пропущено рядків: {result.skipped.length}</p>
                  <ul className="import-skip-list">
                    {result.skipped.slice(0, 10).map((s, i) => <li key={i}>{s.reason}</li>)}
                  </ul>
                </>
              )}
            </>
          )}
        </div>

        <div className="tmodal-foot">
          {step === 'map' && <button type="button" className="btn" onClick={() => setStep('upload')}>Назад</button>}
          {step === 'preview' && <button type="button" className="btn" onClick={() => setStep('map')}>Назад</button>}
          {(step === 'upload' || step === 'map' || step === 'preview') && <button type="button" className="btn" onClick={onClose}>Скасувати</button>}
          {step === 'map' && <button type="button" className="btn btn-p" onClick={goToPreview}>Далі</button>}
          {step === 'preview' && <button type="button" className="btn btn-p" onClick={handleImport} disabled={!validCount}>Імпортувати {validCount}</button>}
          {step === 'done' && <button type="button" className="btn btn-p" onClick={onClose}>Готово</button>}
        </div>
      </div>
    </div>
  );
}
