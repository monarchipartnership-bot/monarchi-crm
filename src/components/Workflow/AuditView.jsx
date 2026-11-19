import { useState } from 'react';
import { Pill } from './parts';

const TABS = ['Підсумок', 'Динаміка', 'Структура', 'Креативи', 'Аудиторії', 'Трекінг'];
const WORD = { purchases: 'покупок', leads: 'лідів', messages: 'звернень', none: 'результатів' };
const TONE = { good: 'ok', ok: 'info', bad: 'bad', few: 'mute', none: 'mute' };
const VLABEL = { good: 'на цілі', ok: 'вище беззбитковості', bad: 'збитково', few: 'мало даних', none: '' };
const fmt = (x, c = 'USD') => (x == null ? '—' : `${c === 'USD' ? '$' : ''}${Math.round(x).toLocaleString('en-US')}${c === 'USD' ? '' : ' ' + c}`);
const pct = (x) => `${Math.round((x || 0) * 100)}%`;

function Findings({ list }) {
  if (!list?.length) return null;
  return (
    <div className="wf-col">
      {list.map((f, i) => (
        <div key={i} className="wf-pt"><span className={'no ' + f.tone}>{i + 1}</span><span>{f.text}</span></div>
      ))}
    </div>
  );
}

// The ROAS of every month with spend against the break-even line (SVG, one scale for bars, ticks and the line).
function MonthChart({ months, th, c }) {
  const list = months.filter((m) => m.spend > 0);
  if (!list.length) return null;
  const W = 640, H = 200, pl = 36, pr = 10, pb = 28, pt = 12;
  const maxRoas = Math.max(2, th?.target_roas || 0, ...list.map((m) => m.roas || 0));
  const y = (v) => H - pb - (v / maxRoas) * (H - pb - pt);
  const bw = Math.max(4, Math.min(28, (W - pl - pr) / list.length - 4));
  const step = (W - pl - pr) / list.length;
  const color = { good: 'var(--wf-ok)', ok: 'var(--wf-info)', bad: 'var(--wf-bad)', few: 'var(--wf-border)', none: 'var(--wf-orchid)' };
  const ticks = [0, 0.5, 1, 1.5, 2, 2.5, 3].filter((t) => t <= maxRoas);
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 420 }} role="img" aria-label="ROAS по місяцях проти беззбиткової лінії">
        {ticks.map((t) => <g key={t}><line x1={pl} y1={y(t)} x2={W - pr} y2={y(t)} stroke="var(--wf-line)" /><text x={pl - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--wf-muted)">{t}</text></g>)}
        {th && <g><line x1={pl} y1={y(th.breakeven_roas)} x2={W - pr} y2={y(th.breakeven_roas)} stroke="var(--wf-bad)" strokeDasharray="5 4" /><text x={W - pr} y={y(th.breakeven_roas) - 4} textAnchor="end" fontSize="10" fill="var(--wf-bad)">беззбитковий {th.breakeven_roas}</text></g>}
        {list.map((m, i) => {
          const x = pl + i * step + (step - bw) / 2;
          const h = Math.max(1, H - pb - y(m.roas || 0));
          return (
            <g key={m.month}>
              <rect x={x} y={H - pb - h} width={bw} height={h} rx="3" fill={color[m.verdict] || color.none}><title>{`${m.month}: витрати ${fmt(m.spend, c)}, ROAS ${m.roas ?? '—'}`}</title></rect>
              {(list.length <= 18 || i % Math.ceil(list.length / 18) === 0) && <text x={x + bw / 2} y={H - 10} textAnchor="middle" fontSize="9" fill="var(--wf-muted)">{m.month.slice(2)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function BreakdownTable({ title, rows, kind, c }) {
  if (!rows?.length) return null;
  const hasRoas = rows.some((r) => r.roas != null);
  return (
    <div>
      <div className="wf-h">{title}</div>
      <div className="wf-tblwrap">
        <table className="wf-tbl">
          <thead><tr><th>Значення</th><th>Частка витрат</th><th>Витрати</th><th>{WORD[kind]}</th>{hasRoas && <th>ROAS</th>}<th>Ціна результату</th><th /></tr></thead>
          <tbody>{rows.slice(0, 8).map((r) => (
            <tr key={r.key}><td><b>{r.key}</b></td><td>{pct(r.share)}</td><td>{fmt(r.spend, c)}</td><td>{r.results}</td>{hasRoas && <td>{r.roas ?? '—'}</td>}<td>{fmt(r.cpr, c)}</td><td>{VLABEL[r.verdict] && <Pill tone={TONE[r.verdict]}>{VLABEL[r.verdict]}</Pill>}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function AdList({ title, list, tone, kind, c }) {
  if (!list?.length) return null;
  return (
    <div>
      <div className="wf-h">{title}</div>
      <div className="wf-col">
        {list.map((a) => (
          <div key={a.id || a.name} className="wf-ad">
            <div className={'im ' + tone} aria-hidden="true">{tone === 'g' ? 'працює' : 'ні'}</div>
            <div style={{ minWidth: 0 }}>
              <b>{a.name}</b> <Pill tone={tone === 'g' ? 'ok' : 'bad'}>{tone === 'g' ? 'спрацював' : 'не спрацював'}</Pill>
              <div className="wf-muted">{fmt(a.spend, c)} · {a.results} {WORD[kind]}{a.roas != null ? ` · ROAS ${a.roas}` : ''}{a.cpr != null ? ` · ціна ${fmt(a.cpr, c)}` : ''}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// The section «Аудит кабінету» (step A4, variant B of the mockup): the same audit in six tabs. content = what the Researcher wrote (api/_lib/wf/skills/auditEngine.js).
export default function AuditView({ content }) {
  const [tab, setTab] = useState(TABS[0]);
  const a = content;
  const c = a.currency || 'USD';
  const th = a.thresholds;
  const kind = a.resultKind;
  const o = a.overview;
  return (
    <div className="wf-col">
      <div className="wf-subtabs" role="tablist" aria-label="Розділи аудиту">
        {TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={t === tab} className={'wf-btn sm' + (t === tab ? ' p' : '')} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'Підсумок' && (
        <>
          <div className="wf-tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div className="wf-tile"><span className="k">Витрачено за весь час</span><b>{fmt(o.spend, c)}</b></div>
            <div className={'wf-tile' + (th && o.roas != null && o.roas < th.breakeven_roas ? ' bad' : '')}><span className="k">ROAS{th ? ` (беззбитковий ${th.breakeven_roas})` : ''}</span><b>{o.roas ?? '—'}</b></div>
            <div className="wf-tile"><span className="k">{WORD[kind]}</span><b>{o.results ?? 0}</b></div>
            <div className="wf-tile"><span className="k">Кампаній · період</span><b>{o.campaigns} · {o.from || '—'} – {o.to || '—'}</b></div>
          </div>
          <Findings list={a.findings.summary} />
          {a.change.length > 0 && <div><div className="wf-h">Що змінюємо</div><ol className="wf-nlist">{a.change.map((t, i) => <li key={i}>{t}</li>)}</ol></div>}
          {a.open.length > 0 && <div><div className="wf-h">Відкриті питання</div><div className="wf-col">{a.open.map((t, i) => <div key={i} className="wf-row"><Pill tone="info">Питання</Pill><span style={{ flex: 1, minWidth: 0 }}>{t}</span></div>)}</div></div>}
          {a.not_covered?.length > 0 && <div className="wf-src">У цій версії аудиту ще не рахується: {a.not_covered.join('; ')}.</div>}
        </>
      )}

      {tab === 'Динаміка' && (
        <>
          <div className="wf-tblwrap"><table className="wf-tbl">
            <thead><tr><th>Рік</th><th>Місяців</th><th>Витрати</th><th>{WORD[kind]}</th><th>Виторг</th><th>ROAS</th><th>Ціна результату</th><th>Середній чек</th></tr></thead>
            <tbody>{a.years.map((y) => <tr key={y.year}><td><b>{y.year}</b></td><td>{y.months}</td><td>{fmt(y.spend, c)}</td><td>{y.results}</td><td>{fmt(y.revenue, c)}</td><td>{y.roas ?? '—'}</td><td>{fmt(y.cpr, c)}</td><td>{fmt(y.aov, c)}</td></tr>)}</tbody>
          </table></div>
          <div><div className="wf-h">ROAS по місяцях{th ? ' проти беззбиткової лінії' : ''}</div><MonthChart months={a.months} th={th} c={c} /></div>
          <Findings list={a.findings.dynamics} />
          {a.recent && <div className="wf-src">Останні 90 днів із показами: {a.recent.window.since} – {a.recent.window.until}.</div>}
        </>
      )}

      {tab === 'Структура' && (
        <>
          {a.objectives.length > 0 && (
            <div className="wf-tblwrap"><table className="wf-tbl">
              <thead><tr><th>Мета кампаній</th><th>Кампаній</th><th>Витрати</th><th>Частка</th><th>{WORD[kind]}</th><th>ROAS</th></tr></thead>
              <tbody>{a.objectives.map((x) => <tr key={x.objective}><td><b>{x.objective}</b></td><td>{x.campaigns}</td><td>{fmt(x.spend, c)}</td><td>{pct(x.share)}</td><td>{x.results}</td><td>{x.roas ?? '—'}</td></tr>)}</tbody>
            </table></div>
          )}
          {a.test && (
            <div className="wf-tiles">
              <div className="wf-tile"><span className="k">Оголошень, запущених у вікні</span><b>{a.test.launched}</b></div>
              <div className="wf-tile"><span className="k">Мали результат</span><b>{a.test.with_result} ({pct(a.test.share_with_result)})</b></div>
              <div className="wf-tile"><span className="k">Перший результат у типовому випадку</span><b>після {fmt(a.test.median_first_spend, c)}</b></div>
            </div>
          )}
          <Findings list={a.findings.structure} />
        </>
      )}

      {tab === 'Креативи' && (
        <>
          <AdList title="Що спрацювало (останні 90 днів)" list={a.recent?.ads.best} tone="g" kind={kind} c={c} />
          <AdList title="Що не спрацювало" list={a.recent?.ads.worst} tone="r" kind={kind} c={c} />
          {!a.recent?.ads.best.length && !a.recent?.ads.worst.length && <div className="wf-empty">Недостатньо даних по оголошеннях (мінімальна витрата для оцінки {fmt(a.min_spend, c)}).</div>}
          <div className="wf-src">Зображення креативів у цій версії не підтягуються.</div>
        </>
      )}

      {tab === 'Аудиторії' && (
        <>
          {[['age', 'Вік'], ['gender', 'Стать'], ['placement', 'Плейсменти'], ['device', 'Пристрої'], ['region', 'Регіони']].map(([k, t]) => <BreakdownTable key={k} title={t + ' (весь час)'} rows={a.breakdowns[k]?.life} kind={kind} c={c} />)}
          <Findings list={a.findings.audiences} />
        </>
      )}

      {tab === 'Трекінг' && (
        <>
          {a.tracking.pixels.length > 0 && (
            <div className="wf-tblwrap"><table className="wf-tbl">
              <thead><tr><th>Піксельний набір</th><th>Остання подія</th><th>Стан</th></tr></thead>
              <tbody>{a.tracking.pixels.map((p) => <tr key={p.id}><td><b>{p.name}</b></td><td>{p.lastFired ? String(p.lastFired).slice(0, 10) : 'ніколи'}</td><td>{p.unavailable ? <Pill tone="bad">недоступний</Pill> : !p.lastFired ? <Pill tone="bad">без подій</Pill> : a.tracking.stale.includes(p.name) ? <Pill tone="warn">давно без подій</Pill> : <Pill tone="ok">отримує події</Pill>}</td></tr>)}</tbody>
            </table></div>
          )}
          <Findings list={a.findings.tracking} />
          <div className="wf-src">Якість збігів подій, дедуплікація й каталог поки не перевіряються: їх потрібно дивитись в Events Manager.</div>
        </>
      )}
    </div>
  );
}
