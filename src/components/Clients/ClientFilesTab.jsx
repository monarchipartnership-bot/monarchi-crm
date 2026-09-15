import { useEffect, useRef, useState } from 'react';
import { fetchClientFiles, uploadClientFile, deleteClientFile, getClientFilePublicUrl } from '../../lib/api/clientFiles';

function fmtSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
}

export default function ClientFilesTab({ clientId, uploadedBy }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  function reload() {
    setLoading(true);
    fetchClientFiles(clientId).then((rows) => { setFiles(rows); setLoading(false); });
  }

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    await uploadClientFile(clientId, file, uploadedBy);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    reload();
  }

  async function handleDelete(f) {
    await deleteClientFile(f.id, f.path);
    reload();
  }

  return (
    <div className="client-files-tab">
      <label className="btn client-files-upload-btn">
        {uploading ? 'Завантаження…' : '+ Додати файл'}
        <input ref={inputRef} type="file" onChange={handleUpload} disabled={uploading} hidden />
      </label>

      {loading ? (
        <p className="client-history-empty">Завантаження…</p>
      ) : files.length === 0 ? (
        <p className="client-history-empty">Файлів ще немає.</p>
      ) : (
        <div className="client-files-list">
          {files.map((f) => (
            <div className="client-file-row" key={f.id}>
              <a href={getClientFilePublicUrl(f.path)} target="_blank" rel="noreferrer" className="client-file-name">{f.file_name}</a>
              <span className="client-file-meta">{fmtSize(f.size)} · {new Date(f.created_at).toLocaleDateString('uk-UA')}</span>
              <button type="button" className="client-file-del" onClick={() => handleDelete(f)} aria-label="Видалити файл">&times;</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
