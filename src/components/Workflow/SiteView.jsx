import { useState } from 'react';
import { Pill } from './parts';
import { SEV_LABEL, SEV_TONE, siteAreaRows, siteCounts } from '../../lib/workflow/sections';

const EVID = { quote: 'цитата зі сторінки', signal: 'показник з HTML', absence: 'на прочитаних сторінках цього немає' };

// The section «Сайт» (step A4, variant B of the mockup): the 11 areas of the document as a table, worst first; the chosen area opens on the right.
export default function SiteView({ content }) {
  const rows = siteAreaRows(content);
  const counts = siteCounts(content);
  const [key, setKey] = useState(rows[0]?.key);
  const cur = rows.find((r) => r.key === key) || rows[0];
  const pages = (content.pages || []).filter((p) => p.ok);
  const failed = (content.pages || []).filter((p) => !p.ok);
  return (
    <div className="wf-col">
      <div className="wf-row" style={{ justifyContent: 'space-between' }}>
        <div className="wf-muted">{content.url} · прочитано сторінок: {pages.length} ({pages.map((p) => p.kind).join(', ')}) · швидкість {content.speed ? 'перевірено' : 'не перевірялась'}</div>
        <div className="wf-row"><Pill tone="ok">Підтверджено {counts.verified}</Pill>{counts.unverified > 0 && <Pill tone="warn">Не підтверджено {counts.unverified}</Pill>}<Pill tone="mute">Не перевірено {counts.notChecked}</Pill></div>
      </div>
      {failed.length > 0 && <div className="wf-lock">Не вдалося прочитати: {failed.map((p) => `${p.kind} (${p.error})`).join(', ')}.</div>}
      <div className="wf-grid wf-g2e">
        <div className="wf-tblwrap">
          <table className="wf-tbl">
            <thead><tr><th>Область</th><th>Стан</th><th>Знахідки</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={'wf-tr' + (r.key === cur?.key ? ' sel' : '')} tabIndex={0} aria-selected={r.key === cur?.key} onClick={() => setKey(r.key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setKey(r.key); } }}>
                  <td>{r.name}</td><td><Pill tone={r.state}>{r.label}</Pill></td>
                  <td>{r.findings.length ? r.findings.map((f) => SEV_LABEL[f.severity].toLowerCase()).join(', ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cur && (
          <div className="wf-card wf-sdet">
            <h3>Область</h3>
            <h2 style={{ margin: '0 0 8px', fontSize: 17 }}>{cur.name}</h2>
            <div className="wf-row" style={{ marginBottom: 10 }}><Pill tone={cur.state}>{cur.label}</Pill></div>
            {cur.note && <p style={{ margin: '0 0 10px' }}>{cur.note}</p>}
            {!cur.findings.length && !cur.note && <p className="wf-muted" style={{ margin: 0 }}>Агент не оцінював цю область.</p>}
            {cur.findings.map((f, i) => (
              <div key={i} className={'wf-find' + (f.verified ? '' : ' un')}>
                <div className="wf-row" style={{ marginBottom: 6 }}><Pill tone={f.verified ? SEV_TONE[f.severity] : 'warn'}>{f.verified ? SEV_LABEL[f.severity] : 'Не підтверджено'}</Pill>{f.page && <a className="wf-muted" href={f.page} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>{f.page.replace(/^https?:\/\//, '')} ↗</a>}</div>
                {!f.verified && <div className="wf-muted" style={{ fontSize: 12.5, marginBottom: 6 }}>{f.problem}. Задачу не створено, поки знахідку не перевірить менеджер.</div>}
                <dl className="wf-kv">
                  <dt>Що бачимо</dt><dd>{f.seen}</dd>
                  <dt>Чому важливо</dt><dd>{f.why}</dd>
                  <dt>Що змінити</dt><dd>{f.change}</dd>
                  <dt>Критерій приймання</dt><dd>{f.acceptance}</dd>
                  <dt>Доказ ({EVID[f.evidence?.kind] || '—'})</dt><dd>{f.evidence?.quote ? <q>{f.evidence.quote}</q> : f.evidence?.signal || '—'}</dd>
                </dl>
              </div>
            ))}
            {cur.comparisons.length > 0 && (
              <div className="wf-col" style={{ marginTop: 10 }}>
                <h3 style={{ margin: '4px 0 0' }}>Порівняння з конкурентами</h3>
                {cur.comparisons.map((x, i) => (
                  <div key={i} className="wf-cmp">
                    {x.better_theirs && <div className="b">Краще в {x.competitor}: {x.better_theirs}</div>}
                    {x.worse_theirs && <div className="w">Гірше в {x.competitor}: {x.worse_theirs}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {content.open?.length > 0 && <div className="wf-muted" style={{ fontSize: 12.5 }}>Відкриті питання: {content.open.join(' ')}</div>}
    </div>
  );
}
