import { useState } from 'react';
import Papa from 'papaparse';
import Select from '../common/Select';
import { fetchClientDirectory, createClientDirectoryEntry, updateClientDirectoryEntry } from '../../lib/api/clients';
import { fetchClientNotes, addClientNote } from '../../lib/api/clientNotes';
import { normText } from '../../lib/monthlyAggregation';
import { splitClientName } from '../../lib/clientName';
import { COUNTRIES } from '../../lib/countries';
import { CONTACT_TYPES, SOURCES } from '../../lib/clientTypeAndSource';

// Universal CSV importer for contacts — same upload → map columns → preview
// → import flow as ImportDealsModal.jsx, so it works for a NetHunt export
// just as well as anything else (nothing here is hard-coded to NetHunt's own
// header text; GUESS_RULES below only pre-fills a first guess for it since
// that's the export this was built against).
const TARGET_FIELDS = [
  { value: 'ignore', label: 'Ігнорувати' },
  { value: 'name', label: "Ім'я" },
  { value: 'last_name', label: 'Прізвище' },
  { value: 'full_name_fallback', label: "Повне ім'я (якщо немає окремих Ім'я/Прізвище)" },
  { value: 'contact_type', label: 'Тип контакту' },
  { value: 'source', label: 'Джерело' },
  { value: 'job_title', label: 'Посада' },
  { value: 'websites', label: 'Вебсайт' },
  { value: 'niche_raw', label: 'Ніша бізнесу (довільний текст → у нотатку)' },
  { value: 'country', label: 'Країна (код, напр. US)' },
  { value: 'goal_launch', label: 'Цілі запуску' },
  { value: 'current_ad_channels', label: 'Канали реклами' },
  { value: 'service_interest', label: 'Маркетингова послуга' },
  { value: 'brand_name_niche', label: 'Бренд і ніша' },
  { value: 'monthly_budget', label: 'Місячний бюджет' },
  { value: 'phone', label: 'Телефон' },
  { value: 'phone_fallback', label: 'Телефон (резервна колонка)' },
  { value: 'email', label: 'Email' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'ad_campaign', label: 'Ad campaign' },
  { value: 'facebook_lead_id', label: 'Facebook Lead ID' },
  { value: 'agency_experience', label: 'Досвід співпраці з агентствами' },
  { value: 'start_timing', label: 'Коли планує почати' },
  { value: 'message', label: 'Повідомлення (→ нотатка)' },
  { value: 'nethunt_id', label: 'Зовнішній ID (NetHunt Record ID)' },
  { value: 'created_at', label: 'Дата створення' },
];

const GUESS_RULES = [
  { field: 'nethunt_id', re: /record ?id|nethunt/i },
  { field: 'name', re: /first ?name/i },
  { field: 'last_name', re: /last ?name|прізвище/i },
  { field: 'full_name_fallback', re: /^name$/i },
  { field: 'contact_type', re: /contact ?type|тип контакту/i },
  { field: 'source', re: /^source$/i },
  { field: 'job_title', re: /посада|job ?title|position/i },
  { field: 'websites', re: /^website$/i },
  { field: 'niche_raw', re: /ніша/i },
  { field: 'country', re: /^country$/i },
  { field: 'goal_launch', re: /цілі запуску/i },
  { field: 'current_ad_channels', re: /канали реклами/i },
  { field: 'service_interest', re: /маркетингова послуга/i },
  { field: 'brand_name_niche', re: /назва.*бренду/i },
  { field: 'monthly_budget', re: /місячний бюджет/i },
  { field: 'phone_fallback', re: /ваш номер телефону/i },
  { field: 'phone', re: /^phone ?number$/i },
  { field: 'email', re: /^email$/i },
  { field: 'linkedin', re: /linkedin/i },
  { field: 'telegram', re: /telegram/i },
  { field: 'instagram', re: /instagram/i },
  { field: 'ad_campaign', re: /ad campaign/i },
  { field: 'facebook_lead_id', re: /facebook lead id/i },
  { field: 'agency_experience', re: /досвід співпраці/i },
  { field: 'start_timing', re: /коли плануєте/i },
  { field: 'message', re: /^message$/i },
  { field: 'created_at', re: /created ?at/i },
];

function guessField(header) {
  const hit = GUESS_RULES.find((r) => r.re.test(header));
  return hit?.field || 'ignore';
}

// "Створено вручну; Upwork" → "Upwork" — NetHunt sometimes prefixes the real
// source with how the record itself was created. Falls back to the raw
// (trimmed) text if it doesn't match a known source, so nothing is silently
// dropped — but a totally unreasonable value (a stray webhook payload landed
// in the column in one row of the sample export) is dropped rather than
// stored, since it would never show up in the profile's Source picker anyway.
function cleanEnumValue(raw, knownList) {
  if (!raw) return null;
  const candidate = raw.split(';').pop().trim();
  if (!candidate || candidate.length > 60 || candidate.includes('{')) return null;
  const known = knownList.find((v) => v.toLowerCase() === candidate.toLowerCase());
  return known || candidate;
}

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
function parseMDY(raw) {
  const m = DATE_RE.exec((raw || '').trim());
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const d = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function ImportContactsModal({ onClose, onImported }) {
  const [step, setStep] = useState('upload'); // upload | map | preview | importing | done
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [columnMap, setColumnMap] = useState({});
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
    const firstName = valueFor(row, 'name');
    const lastName = valueFor(row, 'last_name');
    const fullNameFallback = valueFor(row, 'full_name_fallback');
    let name = firstName, resolvedLastName = lastName;
    if (!name && !resolvedLastName && fullNameFallback) {
      const split = splitClientName(fullNameFallback);
      name = split.name; resolvedLastName = split.lastName;
    }
    const displayName = [name, resolvedLastName].filter(Boolean).join(' ') || fullNameFallback;
    const countryRaw = valueFor(row, 'country').toUpperCase();
    const phone = valueFor(row, 'phone') || valueFor(row, 'phone_fallback');
    const message = valueFor(row, 'message');
    const nicheRaw = valueFor(row, 'niche_raw');
    const noteText = [message, nicheRaw ? `Ніша бізнесу (з NetHunt, вільний текст): ${nicheRaw}` : ''].filter(Boolean).join('\n\n');

    const fields = {
      name: name || null,
      last_name: resolvedLastName || null,
      contact_type: cleanEnumValue(valueFor(row, 'contact_type'), CONTACT_TYPES),
      source: cleanEnumValue(valueFor(row, 'source'), SOURCES),
      job_title: valueFor(row, 'job_title') || null,
      websites: valueFor(row, 'websites') ? [valueFor(row, 'websites')] : [],
      country: COUNTRIES.some((c) => c.code === countryRaw) ? countryRaw : null,
      goal_launch: valueFor(row, 'goal_launch') || null,
      current_ad_channels: valueFor(row, 'current_ad_channels') || null,
      service_interest: valueFor(row, 'service_interest') || null,
      brand_name_niche: valueFor(row, 'brand_name_niche') || null,
      monthly_budget: valueFor(row, 'monthly_budget') || null,
      phone: phone || null,
      email: valueFor(row, 'email') || null,
      telegram: valueFor(row, 'telegram') || null,
      linkedin: valueFor(row, 'linkedin') || null,
      instagram: valueFor(row, 'instagram') || null,
      ad_campaign: valueFor(row, 'ad_campaign') || null,
      facebook_lead_id: valueFor(row, 'facebook_lead_id') || null,
      agency_experience: valueFor(row, 'agency_experience') || null,
      start_timing: valueFor(row, 'start_timing') || null,
      nethunt_id: valueFor(row, 'nethunt_id') || null,
    };
    const createdAt = parseMDY(valueFor(row, 'created_at'));
    return { displayName, nameKey: normText(displayName), fields, noteText, createdAt, valid: !!displayName };
  }

  const mappedRows = rows.map(resolveRow);
  const validCount = mappedRows.filter((r) => r.valid).length;

  async function goToPreview() {
    if (!Object.values(columnMap).some((v) => v === 'name' || v === 'full_name_fallback')) {
      setError("Зіставте хоча б одну колонку з полем «Ім'я» або «Повне ім'я».");
      return;
    }
    setError('');
    setStep('preview');
  }

  async function handleImport() {
    setStep('importing');
    setProgress({ done: 0, total: validCount });
    const directory = await fetchClientDirectory();
    let created = 0, merged = 0, notesAdded = 0;
    const skipped = [];

    for (const row of mappedRows) {
      if (!row.valid) { skipped.push({ reason: 'Немає імені контакту' }); continue; }
      try {
        const existing = directory.find((c) => (row.fields.nethunt_id && c.nethunt_id === row.fields.nethunt_id) || c.name_key === row.nameKey);
        let client;
        if (existing) {
          const patch = {};
          Object.entries(row.fields).forEach(([k, v]) => {
            if (v == null || (Array.isArray(v) && !v.length)) return;
            const cur = existing[k];
            if (cur == null || cur === '' || (Array.isArray(cur) && !cur.length)) patch[k] = v;
          });
          if (Object.keys(patch).length) {
            await updateClientDirectoryEntry(existing.id, patch, existing, 'Імпорт NetHunt');
            Object.assign(existing, patch);
            merged++;
          }
          client = existing;
        } else {
          client = await createClientDirectoryEntry({
            ...row.fields,
            name_key: row.nameKey,
            ...(row.createdAt ? { created_at: row.createdAt } : {}),
          });
          directory.push(client);
          created++;
        }
        if (row.noteText && client) {
          const existingNotes = await fetchClientNotes(client.id);
          if (!existingNotes.some((n) => n.text === row.noteText)) {
            await addClientNote(client.id, row.noteText, 'Імпорт NetHunt');
            notesAdded++;
          }
        }
      } catch (e) {
        skipped.push({ reason: e.message || 'Помилка створення контакту' });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setResult({ created, merged, notesAdded, skipped });
    setStep('done');
    onImported?.();
  }

  return (
    <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget && step !== 'importing') onClose(); }}>
      <div className="tmodal-box import-contacts-modal">
        <div className="tmodal-head">
          <h3>Імпорт контактів з CSV</h3>
          {step !== 'importing' && <button type="button" className="tmodal-close" onClick={onClose} aria-label="Закрити">&times;</button>}
        </div>

        <div className="tmodal-body">
          {step === 'upload' && (
            <>
              <p>Завантажте CSV-файл з контактами — далі ви самі зіставите його колонки з полями картки клієнта. Підходить для експорту з NetHunt чи будь-якої іншої CRM.</p>
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
                <b>{validCount}</b> з {rows.length} рядків готові до імпорту. Записи з однаковим ім'ям (в межах файлу чи вже наявні в довіднику) будуть об'єднані в один контакт — заповняться лише порожні поля, наявні дані не перезаписуються.
              </p>
              <div className="tbl-wrap import-preview-wrap">
                <table className="cmp-table">
                  <thead>
                    <tr><th>Ім'я</th><th>Джерело</th><th>Тип контакту</th><th>Статус</th></tr>
                  </thead>
                  <tbody>
                    {mappedRows.slice(0, 20).map((r, i) => (
                      <tr key={i}>
                        <td>{r.displayName || '—'}</td>
                        <td>{r.fields.source || '—'}</td>
                        <td>{r.fields.contact_type || '—'}</td>
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
                Готово: створено <b>{result.created}</b> нових контактів
                {result.merged > 0 && <>, доповнено даними — <b>{result.merged}</b></>}
                {result.notesAdded > 0 && <>, додано нотаток — <b>{result.notesAdded}</b></>}.
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
