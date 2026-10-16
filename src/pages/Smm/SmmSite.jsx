import { useEffect, useState } from 'react';
import ActionIcon from '../../components/common/ActionIcon';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSiteAudits, runSeoAudit, saveSettings } from '../../lib/api/smm';
import { fmtWhen } from '../../lib/smmDates';

const SEV = { high: ['Критично', '#C2185B'], medium: ['Важливо', '#B7791F'], low: ['Бажано', '#807394'] };
const EFFORT = { low: 'швидко', medium: 'помірно', high: 'довго' };

function Finding({ f }) {
  const [label, color] = SEV[f.severity] || SEV.low;
  return (
    <details className="smm-find">
      <summary>
        <span className="smm-chip" style={{ '--chip': color }}><i aria-hidden="true" />{label}</span>
        <b>{f.title}</b>
        {f.count > 0 && <span className="smm-count-pill">{f.count}</span>}
      </summary>
      <div className="smm-find-body">
        <p>{f.detail}</p>
        <p><b>Як виправити:</b> {f.fix}</p>
        {f.pages?.length > 0 && <ul>{f.pages.map((u) => <li key={u}>{/^https?:/.test(u) ? <a className="smm-link" href={u.split(' ')[0]} target="_blank" rel="noreferrer noopener">{u}</a> : u}</li>)}</ul>}
        {f.count > (f.pages?.length || 0) && <p className="smm-hint">Показано {f.pages.length} із {f.count}.</p>}
      </div>
    </details>
  );
}

// The SEO agent: it reads the public pages of Monarchi's own site and writes a priority plan. It never changes the site:
// the proposed titles and descriptions are for a person to copy into WordPress.
export default function SmmSite({ settings, audits, notify, reload }) {
  const { email } = useAuth();
  const [url, setUrl] = useState(settings?.site_url || 'https://www.monarchi.agency');
  const [running, setRunning] = useState(false);
  const [pick, setPick] = useState(0);
  useEffect(() => { if (settings?.site_url) setUrl(settings.site_url); }, [settings?.site_url]);
  const audit = audits[pick];
  const plan = audit?.plan;

  async function run() {
    setRunning(true);
    try {
      if (url.trim() && url.trim() !== settings?.site_url) await saveSettings({ site_url: url.trim() }, email);
      const r = await runSeoAudit(url.trim());
      notify(r.planError ? `Перевірки готові. ${r.planError}` : 'Аудит готовий.', Boolean(r.planError));
      setPick(0); reload();
    } catch (err) { notify(err.message || 'Не вдалося запустити аудит.', true); } finally { setRunning(false); }
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); notify('Скопійовано.'); } catch { notify('Не вдалося скопіювати: виділіть текст вручну.', true); }
  }

  return (
    <>
      <section className="smm-block">
        <h3>SEO-оптимізатор</h3>
        <p className="smm-muted">Агент читає публічні сторінки вашого сайту (до 25, за sitemap), перевіряє заголовки, описи, H1, canonical, noindex, alt, биті посилання, robots і sitemap, а потім складає план і пропонує нові title та description. Сайт агент не змінює: правки вносите ви.</p>
        <div className="smm-seo-bar">
          <div className="smm-field"><label htmlFor="smm-site-url">Адреса сайту</label><input id="smm-site-url" type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></div>
          <button type="button" className="smm-btn smm-btn--primary" disabled={running || !url.trim()} onClick={run}><ActionIcon name="generate" size={18} />{running ? 'Аналізуємо…' : 'Запустити аудит'}</button>
        </div>
        {running && <p className="smm-note" role="status">Агент читає сторінки сайту й складає план. Це займає до хвилини-двох.</p>}
      </section>

      {!audit ? <p className="smm-empty smm-empty--big">Аудитів ще не було. Натисніть «Запустити аудит».</p> : (
        <>
          <section className="smm-block">
            <div className="smm-block-head">
              <h3>Аудит від {fmtWhen(audit.created_at)}</h3>
              {audits.length > 1 && (
                <label className="smm-inline">Попередні: <select value={pick} onChange={(e) => setPick(Number(e.target.value))}>{audits.map((a, i) => <option key={a.id} value={i}>{fmtWhen(a.created_at)}</option>)}</select></label>
              )}
            </div>
            <div className="smm-stats">
              <div className="smm-stat"><b>{audit.summary?.pages ?? 0}</b><span>сторінок прочитано</span></div>
              <div className="smm-stat"><b style={{ color: '#C2185B' }}>{audit.summary?.high ?? 0}</b><span>критичних проблем</span></div>
              <div className="smm-stat"><b style={{ color: '#B7791F' }}>{audit.summary?.medium ?? 0}</b><span>важливих</span></div>
              <div className="smm-stat"><b>{audit.summary?.low ?? 0}</b><span>бажаних покращень</span></div>
            </div>
            {audit.error && <p className="smm-error">{audit.error}</p>}
          </section>

          {plan && (
            <section className="smm-block">
              <h3>План від агента</h3>
              {plan.summary && <p>{plan.summary}</p>}
              <ol className="smm-prio">
                {plan.priorities.map((p) => (
                  <li key={p.title}>
                    <div className="smm-prio-head"><b>{p.title}</b><span className="smm-count-pill">{EFFORT[p.effort]}</span></div>
                    {p.why && <p className="smm-muted">{p.why}</p>}
                    {p.action && <p>{p.action}</p>}
                  </li>
                ))}
              </ol>
              {plan.rewrites.length > 0 && (
                <>
                  <h3>Запропоновані тексти</h3>
                  <p className="smm-muted">Агент писав їх лише за змістом самої сторінки. Перевірте перед вставкою в WordPress або SEO-плагін.</p>
                  <div className="smm-list">
                    {plan.rewrites.map((r) => (
                      <div key={r.url + r.field} className="smm-rewrite">
                        <a className="smm-link" href={r.url} target="_blank" rel="noreferrer noopener">{r.url}</a>
                        <span className="smm-hint">{r.field === 'title' ? 'Title' : 'Description'}{r.current ? `, зараз: ${r.current}` : ', зараз порожньо'}</span>
                        <div className="smm-rewrite-new"><span>{r.proposed}</span><button type="button" className="smm-btn" onClick={() => copy(r.proposed)}><ActionIcon name="copy" size={18} />Копіювати</button></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {plan.notes && <p className="smm-hint">{plan.notes}</p>}
            </section>
          )}

          <section className="smm-block">
            <h3>Усі знахідки <span className="smm-count-pill">{audit.findings?.length || 0}</span></h3>
            {audit.findings?.length ? <div className="smm-finds">{audit.findings.map((f) => <Finding key={f.id} f={f} />)}</div> : <p className="smm-empty smm-empty--big">Проблем не знайдено.</p>}
          </section>
        </>
      )}
    </>
  );
}
