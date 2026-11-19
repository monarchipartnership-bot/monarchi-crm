import { useRef, useState } from 'react';
import { Pill } from './parts';
import { adProblems } from '../../lib/workflow/ads';
import { competitorCards, competitorHosts } from '../../lib/workflow/sections';
import { requestRun, uploadCompetitorShot } from '../../lib/api/workflow';

const blank = () => ({ competitor: '', library_url: '', screenshot_url: '', active_since: '', note: '' });
const dmy = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('.') : '');

// The section «Ринок і конкуренти» (step A4, variant B of the mockup): a card per competitor, the ads confirmed by the manager as a list with an adding row,
// the analysis of those ads by the agent, the ideas. The official Ad Library API does not cover most of our markets, so a person confirms every ad
// (link, screenshot, date «active since»); the agent uses only complete entries (rule in src/lib/workflow/ads.js).
export default function CompetitorsView({ content, projectId, email, busy, onSaveAds }) {
  const cards = competitorCards(content);
  const hosts = competitorHosts(content);
  const ads = Array.isArray(content.ads) ? content.ads : [];
  const analysis = content.ads_analysis || [];
  const [draft, setDraft] = useState(blank());
  const [editing, setEditing] = useState(null); // the index of the entry being completed
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [up, setUp] = useState(false);
  const file = useRef(null);
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const empty = !draft.library_url.trim() && !draft.screenshot_url && !draft.active_since;

  async function pick(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setErr(''); setUp(true);
    try { const url = await uploadCompetitorShot(projectId, f); setDraft((d) => ({ ...d, screenshot_url: url })); } catch (x) { setErr(x.message || String(x)); } finally { setUp(false); }
  }
  async function save() {
    setErr(''); setNote('');
    const entry = { ...draft, competitor: draft.competitor || hosts[0] || '', library_url: draft.library_url.trim(), verified_by: email || 'manager' };
    const next = editing == null ? [...ads, entry] : ads.map((a, i) => (i === editing ? entry : a));
    try { await onSaveAds(next); setDraft(blank()); setEditing(null); setNote(adProblems(entry).length ? 'Оголошення збережено, але поки не береться: ' + adProblems(entry).join(', ') + '.' : 'Оголошення підтверджено. Агент розбере скриншот при наступному запуску.'); } catch (x) { setErr(x.message || String(x)); }
  }
  const edit = (i) => { setEditing(i); setDraft({ ...blank(), ...ads[i] }); setNote(''); };
  const remove = async (i) => { try { await onSaveAds(ads.filter((_, k) => k !== i)); setNote(''); } catch (x) { setErr(x.message || String(x)); } };
  async function rerun() {
    setErr('');
    try { setNote((await requestRun(projectId, 'researcher', 'competitors', email)) ? 'Запит надіслано: агент розбере рекламу при наступному проході оркестратора.' : 'Такий запуск уже в черзі або виконується.'); } catch (x) { setErr(x.message || String(x)); }
  }
  const counted = ads.filter((a) => !adProblems(a).length).length;

  return (
    <div className="wf-col">
      <div className="wf-row" style={{ justifyContent: 'space-between' }}>
        <div className="wf-muted">Сайти беремо з брифу: {hosts.join(', ') || '—'}. Нових конкурентів у ніші агент у цій версії не шукає.</div>
        <Pill tone={counted ? 'info' : 'mute'}>Реклама: підтверджено менеджером {counted}</Pill>
      </div>
      {(content.failed || []).length > 0 && <div className="wf-lock">Не вдалося прочитати: {content.failed.map((f) => `${f.host} (${f.error})`).join(', ')}.</div>}

      <div className="wf-cards">
        {cards.map((r) => (
          <div key={r.competitor} className="wf-card">
            <div className="wf-row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0, fontSize: 17 }}>{r.competitor}</h2><Pill tone={r.verified ? 'ok' : 'warn'}>{r.verified ? 'підтверджено' : 'не підтверджено'}</Pill></div>
            {!r.verified && <div className="wf-muted" style={{ fontSize: 12.5 }}>{r.problem}. У задачах не використовується.</div>}
            <dl className="wf-kv" style={{ marginTop: 8 }}>
              {[['Товари', r.products], ['Ціни', r.prices], ['Офери', r.offers], ['Кути', r.angles], ['Підхід', r.approach]].map(([k, v]) => v ? <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div> : null)}
              {r.verified && r.evidence?.quote && <><dt>Доказ</dt><dd><q>{r.evidence.quote}</q></dd></>}
            </dl>
            {r.comparisons.filter((x) => x.verified).length > 0 && (
              <div className="wf-cmp" style={{ marginTop: 8 }}>
                {r.comparisons.filter((x) => x.verified).map((x, i) => <div key={i} style={{ display: 'contents' }}>{x.better_theirs && <div className="b">Краще: {x.better_theirs}</div>}{x.worse_theirs && <div className="w">Гірше: {x.worse_theirs}</div>}</div>)}
              </div>
            )}
          </div>
        ))}
        {!cards.length && <div className="wf-empty">Таблиця конкурентів порожня.</div>}
      </div>

      <div className="wf-card">
        <h3>Реклама конкурентів: підтверджена менеджером</h3>
        <p className="wf-muted" style={{ margin: '0 0 10px', fontSize: 12.5 }}>Офіційний API Бібліотеки реклами Meta не віддає звичайну рекламу поза ЄС і Великою Британією, тому оголошення перевіряє людина. Агент бере лише ті, де є посилання, скриншот і дата.</p>
        <div className="wf-tblwrap">
          <table className="wf-tbl">
            <thead><tr><th>Конкурент</th><th>Бібліотека</th><th>Скриншот</th><th>Активно з</th><th>Стан</th></tr></thead>
            <tbody>
              {ads.map((a, i) => {
                const pr = adProblems(a);
                return (
                  <tr key={i}>
                    <td>{a.competitor}</td>
                    <td>{a.library_url ? <a href={a.library_url} target="_blank" rel="noreferrer">посилання ↗</a> : <span className="wf-muted">немає</span>}</td>
                    <td>{a.screenshot_url ? <a href={a.screenshot_url} target="_blank" rel="noreferrer">є ↗</a> : <span className="wf-muted">немає</span>}</td>
                    <td>{dmy(a.active_since) || <span className="wf-muted">немає</span>}</td>
                    <td><div className="wf-row">{pr.length ? <Pill tone="warn">Не беремо: {pr[0]}{pr.length > 1 ? ` (+${pr.length - 1})` : ''}</Pill> : <Pill tone="ok">Беремо</Pill>}<button type="button" className="wf-btn sm" disabled={busy} onClick={() => edit(i)}>{pr.length ? 'Дописати' : 'Змінити'}</button><button type="button" className="wf-btn sm d" disabled={busy} onClick={() => remove(i)}>Прибрати</button></div></td>
                  </tr>
                );
              })}
              <tr className="wf-addrow">
                <td><select className="wf-inp" aria-label="Конкурент" value={draft.competitor || hosts[0] || ''} onChange={set('competitor')}>{hosts.map((h) => <option key={h} value={h}>{h}</option>)}</select></td>
                <td><input className="wf-inp" aria-label="Посилання на оголошення в Бібліотеці реклами" placeholder="https://www.facebook.com/ads/library/?id=…" value={draft.library_url} onChange={set('library_url')} /></td>
                <td><input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} />
                  <button type="button" className="wf-btn sm" disabled={up || busy} onClick={() => file.current?.click()}>{up ? 'Завантаження…' : draft.screenshot_url ? 'Скриншот додано ✓' : 'Скриншот…'}</button></td>
                <td><input className="wf-inp" type="date" aria-label="Активно з" value={draft.active_since} onChange={set('active_since')} /></td>
                <td><div className="wf-row"><button type="button" className="wf-btn p sm" disabled={busy || up || empty || !hosts.length} onClick={save}>{editing == null ? 'Додати' : 'Зберегти'}</button>{editing != null && <button type="button" className="wf-btn sm" onClick={() => { setEditing(null); setDraft(blank()); }}>Скасувати</button>}</div></td>
              </tr>
            </tbody>
          </table>
        </div>
        {!hosts.length && <div className="wf-muted" style={{ marginTop: 8, fontSize: 12.5 }}>Спершу вкажіть сайти конкурентів у брифі.</div>}
        {err && <div className="wf-err" role="alert" style={{ marginTop: 8 }}>{err}</div>}
        {note && <div className="wf-muted" style={{ marginTop: 8, fontSize: 12.5 }}>{note}</div>}
        {counted > 0 && analysis.length < counted && <div className="wf-row" style={{ marginTop: 8 }}><span className="wf-muted" style={{ fontSize: 12.5 }}>Не всі підтверджені оголошення ще розібрав агент.</span><button type="button" className="wf-btn sm" onClick={rerun}>Розібрати агентом</button></div>}
      </div>

      {analysis.length > 0 && (
        <div className="wf-cards">
          {analysis.map((a, i) => (
            <div key={i} className="wf-adc">
              {a.screenshot_url ? <img src={a.screenshot_url} alt={a.label} loading="lazy" /> : <div className="im">без скриншота</div>}
              <div className="wf-col" style={{ gap: 4 }}>
                <b style={{ color: 'var(--wf-plum)' }}>{a.label}</b>
                <div className="wf-row"><Pill tone="ok">Активно з {dmy(a.active_since)}</Pill>{a.format && <span className="wf-chip">{a.format}</span>}</div>
                <div className="wf-muted" style={{ fontSize: 12 }}>Перевірив {a.verified_by} · <a href={a.library_url} target="_blank" rel="noreferrer">Бібліотека реклами ↗</a></div>
                <div><b>Кут:</b> {a.angle || '—'}. <b>Оффер:</b> {a.offer || '—'}.</div>
                <div className="wf-muted" style={{ fontSize: 12.5 }}><b>Ідея:</b> {a.idea || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {content.ideas?.length > 0 && (
        <div className="wf-card"><h3>Ідеї для банку ідей</h3><ol className="wf-nlist">{content.ideas.map((x, i) => <li key={i}><b>{x.approach}:</b> {x.idea}</li>)}</ol></div>
      )}
      {content.open?.length > 0 && <div className="wf-muted" style={{ fontSize: 12.5 }}>Відкриті питання: {content.open.join(' ')}</div>}
    </div>
  );
}
