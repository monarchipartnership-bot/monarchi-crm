import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteDeck, fetchProjectDecks } from '../../lib/api/projectDecks';
import { STYLES, periodLabel, platformName } from '../../lib/presentation/deckModel';
import '../../styles/projectReports.css';

// «Презентації» tab of a project: every client deck made for it, newest period first.
export default function ProjectDecksTab({ projectId }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => { setRows(await fetchProjectDecks(projectId)); }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const open = (d) => navigate(`/clients?project=${projectId}&type=${d.period_type}&start=${d.period_start}&platform=${d.platform}`);

  async function remove(d) {
    if (!window.confirm('Видалити збережену презентацію? Дію не можна скасувати. Звіт, з якого її зроблено, залишиться.')) return;
    try { await deleteDeck(d.id); await load(); } catch (e) { setError(e.message || 'Не вдалося видалити.'); }
  }

  return (
    <section className="report-section">
      <div className="ov-section-head">
        <div className="stitle">Презентації для клієнта</div>
        <button type="button" className="btn btn-p" onClick={() => navigate(`/clients?project=${projectId}`)}>Створити презентацію</button>
      </div>
      {error && <div className="pacc-err">{error}</div>}
      {rows == null && <div className="empty-hint">Завантаження...</div>}
      {rows && rows.length === 0 && (
        <div className="empty-hint">Презентацій ще немає. Збережіть Тижневий або Місячний звіт і натисніть біля нього «Створити презентацію».</div>
      )}
      {rows && rows.length > 0 && (
        <table className="prep-table prep-saved">
          <thead><tr><th>Період</th><th>Платформа</th><th>Стиль</th><th>Статус</th><th>Оновлено</th><th /></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td className="lbl">
                  <button type="button" className="pacc-link" onClick={() => open(d)}>
                    {d.period_type === 'weekly' ? 'Тиждень' : 'Місяць'} · {periodLabel(d.period_type, d.period_start, d.period_end, 'uk')}
                  </button>
                </td>
                <td>{platformName(d.platform)}</td>
                <td>{STYLES.find((s) => s.id === d.style)?.name || d.style}</td>
                <td>{d.status === 'final' ? 'Фінал' : 'Чернетка'}{d.source === 'agent' ? ' · AI-агент' : ''}</td>
                <td className="muted">{new Date(d.updated_at).toLocaleString('uk-UA')}</td>
                <td className="num">
                  <button type="button" className="pacc-link" onClick={() => open(d)}>Відкрити</button>{' '}
                  <button type="button" className="pacc-link pacc-link--danger" onClick={() => remove(d)}>Видалити</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
