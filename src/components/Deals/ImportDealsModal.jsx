import { useState } from 'react';
import Papa from 'papaparse';
import { createDeal } from '../../lib/api/deals';
import { fetchDealStages } from '../../lib/api/dealStages';
import { fetchClientDirectory, upsertClientDirectoryEntry } from '../../lib/api/clients';
import { normText } from '../../lib/monthlyAggregation';

// Universal CSV importer — no source system is hard-coded (works for a
// NetHunt export just as well as anything else) since the user maps each
// CSV column to a deal field by hand rather than relying on known headers.
const TARGET_FIELDS = [
  { value: 'ignore', label: 'Ігнорувати' },
  { value: 'clientName', label: "Клієнт (обов'язково)" },
  { value: 'title', label: 'Title' },
  { value: 'amount', label: 'Сума' },
  { value: 'currency', label: 'Валюта' },
  { value: 'stage', label: 'Стадія (текст)' },
  { value: 'source', label: 'Source' },
  { value: 'chatLink', label: 'Chat link' },
  { value: 'owner', label: 'Owner' },
  { value: 'expectedClose', label: 'Очікуване закриття (РРРР-ММ-ДД)' },
];

// Cheap header-text heuristics for a first-guess mapping — the user can
// still override every column, this just saves clicks on common exports.
const GUESS_RULES = [
  { field: 'clientName', re: /client|contact|name|клієнт|контакт|ім'я|имя/i },
  { field: 'title', re: /title|deal|назва|сделк|угод/i },
  { field: 'amount', re: /amount|value|sum|price|сума|сумма/i },
  { field: 'currency', re: /currency|валют/i },
  { field: 'stage', re: /stage|status|этап|стад|статус/i },
  { field: 'source', re: /source|джерел|источник/i },
  { field: 'chatLink', re: /link|chat|посилання|ссылк/i },
  { field: 'owner', re: /owner|manager|менеджер|власник/i },
  { field: 'expectedClose', re: /close|date|дата|термін|срок/i },
];

function guessField(header) {
  const hit = GUESS_RULES.find((r) => r.re.test(header));
  return hit?.field || 'ignore';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function ImportDealsModal({ pipelines, defaultPipelineId, profiles, onClose, onImported }) {
  const [step, setStep] = useState('upload'); // upload | map | preview | importing | done
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [pipelineId, setPipelineId] = useState(defaultPipelineId || pipelines[0]?.id || '');
  const [stages, setStages] = useState([]);
  const [clientDirectory, setClientDirectory] = useState([]);
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

  async function goToPreview() {
    if (!Object.values(columnMap).includes('clientName')) {
      setError("Зіставте хоча б одну колонку з полем «Клієнт».");
      return;
    }
    setError('');
    const [stageRows, directory] = await Promise.all([fetchDealStages(pipelineId), fetchClientDirectory()]);
    setStages(stageRows);
    setClientDirectory(directory);
    setStep('preview');
  }

  function valueFor(row, field) {
    const header = Object.keys(columnMap).find((h) => columnMap[h] === field);
    return header ? String(row[header] ?? '').trim() : '';
  }

  const mappedRows = rows.map((row) => {
    const clientName = valueFor(row, 'clientName');
    const stageText = valueFor(row, 'stage');
    const matchedStage = stageText
      ? stages.find((s) => normText(s.label) === normText(stageText))
      : null;
    const matchedClient = clientName
      ? clientDirectory.find((c) => c.name_key === normText(clientName))
      : null;
    return {
      clientName,
      title: valueFor(row, 'title'),
      amount: valueFor(row, 'amount'),
      currency: valueFor(row, 'currency'),
      stageText,
      matchedStage,
      source: valueFor(row, 'source'),
      chatLink: valueFor(row, 'chatLink'),
      owner: valueFor(row, 'owner'),
      expectedClose: valueFor(row, 'expectedClose'),
      valid: !!clientName,
      willCreateClient: !!clientName && !matchedClient,
    };
  });

  const validCount = mappedRows.filter((r) => r.valid).length;
  const newClientCount = mappedRows.filter((r) => r.willCreateClient).length;

  async function handleImport() {
    setStep('importing');
    setProgress({ done: 0, total: validCount });
    const pipeline = pipelines.find((p) => p.id === pipelineId);
    const directory = [...clientDirectory];
    let createdDeals = 0;
    let createdClients = 0;
    const skipped = [];

    for (const row of mappedRows) {
      if (!row.valid) { skipped.push({ reason: 'Немає імені клієнта' }); continue; }
      try {
        let client = directory.find((c) => c.name_key === normText(row.clientName));
        if (!client) {
          client = await upsertClientDirectoryEntry({ name: row.clientName, platform: pipeline?.name });
          if (!client) { skipped.push({ reason: `Не вдалося створити клієнта «${row.clientName}»` }); continue; }
          directory.push(client);
          createdClients++;
        }
        const expectedCloseDate = DATE_RE.test(row.expectedClose) ? row.expectedClose : null;
        await createDeal({
          clientId: client.id,
          manager: row.owner || '',
          stageId: row.matchedStage?.id,
          pipelineId,
          amount: row.amount ? Number(row.amount.replace(',', '.')) || null : null,
          currency: row.currency || 'USD',
          expectedCloseDate,
          title: row.title,
          source: row.source,
          chatLink: row.chatLink,
        });
        createdDeals++;
      } catch (e) {
        skipped.push({ reason: e.message || 'Помилка створення угоди' });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setResult({ createdDeals, createdClients, skipped });
    setStep('done');
    onImported?.();
  }

  return (
    <div className="tmodal-overlay" onClick={(e) => { if (e.target === e.currentTarget && step !== 'importing') onClose(); }}>
      <div className="tmodal-box import-deals-modal">
        <div className="tmodal-head">
          <h3>Імпорт угод з CSV</h3>
          {step !== 'importing' && <button type="button" className="tmodal-close" onClick={onClose} aria-label="Закрити">&times;</button>}
        </div>

        <div className="tmodal-body">
          {step === 'upload' && (
            <>
              <p>Завантажте CSV-файл з угодами — далі ви самі зіставите його колонки з полями угоди. Підходить для будь-якого джерела, включно з експортом з іншої CRM.</p>
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

              <label style={{ marginTop: 10 }}>Pipeline для імпорту</label>
              <select value={pipelineId} onChange={(e) => setPipelineId(Number(e.target.value))}>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <div className="import-map-list" style={{ marginTop: 14 }}>
                {headers.map((h) => (
                  <div className="import-map-row" key={h}>
                    <span className="import-map-header">{h}</span>
                    <select value={columnMap[h]} onChange={(e) => setColumnMap((m) => ({ ...m, [h]: e.target.value }))}>
                      {TARGET_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {error && <p className="import-error">{error}</p>}
            </>
          )}

          {step === 'preview' && (
            <>
              <p>
                <b>{validCount}</b> з {rows.length} рядків готові до імпорту в pipeline «{pipelines.find((p) => p.id === pipelineId)?.name}».
                {newClientCount > 0 && <> Буде створено нових клієнтів: <b>{newClientCount}</b>.</>}
              </p>
              <div className="tbl-wrap import-preview-wrap">
                <table className="cmp-table">
                  <thead>
                    <tr><th>Клієнт</th><th>Title</th><th>Стадія</th><th>Сума</th><th>Статус</th></tr>
                  </thead>
                  <tbody>
                    {mappedRows.slice(0, 20).map((r, i) => (
                      <tr key={i}>
                        <td>{r.clientName || '—'}</td>
                        <td>{r.title || '—'}</td>
                        <td>{r.stageText ? (r.matchedStage ? r.stageText : `${r.stageText} (не знайдено → перша стадія)`) : '—'}</td>
                        <td>{r.amount || '—'}</td>
                        <td>
                          {!r.valid ? <span className="chip missing">пропущено</span> : r.willCreateClient ? <span className="chip partial">новий клієнт</span> : <span className="chip have">ок</span>}
                        </td>
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
              <p>Готово: створено <b>{result.createdDeals}</b> {result.createdDeals === 1 ? 'угоду' : 'угод'}{result.createdClients > 0 && <>, з них нових клієнтів — <b>{result.createdClients}</b></>}.</p>
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
