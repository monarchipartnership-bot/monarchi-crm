import { useCallback, useEffect, useRef, useState } from 'react';
import ActionIcon from '../../components/common/ActionIcon';
import { fetchSiteOverview } from '../../lib/api/agents';
import { fetchSiteStats } from '../../lib/api/smm';
import { fmtWhen } from '../../lib/smmDates';
import Markdown from './Markdown';

// The website analyst's main page, in two blocks: «Підключення до Google» (is the connection healthy) and «Звіт» (the figures it tracks now).
// The figures are read live from Google (no model, nothing saved) and kept for a few minutes so switching tabs does not refetch.
const TTL = 5 * 60 * 1000;
let cache = null;

const fmtNum = (n, unit) => (n == null ? '—' : `${Number(n).toLocaleString('uk-UA', { maximumFractionDigits: 1 })}${unit || ''}`);
const KIND = { low: ['Мало даних', '#807394'], up: ['Зростання', '#2E7D32'], down: ['Падіння', '#C2185B'], info: ['Інформація', '#5B4B8A'], setup: ['Варто налаштувати', '#B7791F'], opportunity: ['Можливість', '#5B4B8A'], error: ['Помилка', '#C2185B'] };

// What an error from Google usually means, in plain words.
function hintFor(source, text = '') {
  const t = String(text).toLowerCase();
  const where = source === 'ga4' ? 'у Google Analytics 4 (Адміністратор → Керування доступом до ресурсу)' : 'у Search Console (Налаштування → Користувачі й дозволи)';
  if (t.includes('invalid_grant') || t.includes('invalid_client') || t.includes('unauthorized_client')) return 'Токен доступу більше не діє. Потрібно заново отримати refresh-токен і оновити його у Vercel (Settings → Environment Variables).';
  if (t.includes('403') || t.includes('permission') || t.includes('forbidden')) return `Немає доступу: додайте акаунт, під яким працює агент, читачем ${where}.`;
  if (t.includes('404') || t.includes('not found')) return source === 'ga4' ? 'Ресурс не знайдено: перевірте ID ресурсу GA4 у «Налаштуваннях» агента.' : 'Сайт не знайдено: перевірте адресу ресурсу Search Console у «Налаштуваннях» агента (для доменного ресурсу: sc-domain:назва.com).';
  if (t.includes('api has not been used') || t.includes('disabled') || t.includes('accessnotconfigured')) return 'API вимкнено в Google Cloud: увімкніть Google Analytics Data API / Search Console API у проєкті.';
  return null;
}

function Status({ ok, label, detail, hint }) {
  const color = ok ? '#2E7D32' : '#C2185B';
  return (
    <div className="smm-stat sao-conn">
      <span className="smm-chip" style={{ '--chip': color }}><i aria-hidden="true" />{ok ? 'Підключено' : 'Не працює'}</span>
      <b className="sao-conn-name">{label}</b>
      {detail && <span className="sao-conn-detail">{detail}</span>}
      {hint && <small className="sao-conn-hint">{hint}</small>}
    </div>
  );
}

function Metric({ m }) {
  const tone = m.delta == null ? '' : m.delta > 0 ? ' smm-delta--up' : m.delta < 0 ? ' smm-delta--down' : '';
  const sub = m.delta != null ? `${m.delta > 0 ? '+' : ''}${m.delta}% до попередніх 28 днів` : m.enough === false ? 'мало даних для порівняння' : `було ${fmtNum(m.prev, m.unit)}`;
  return (
    <div className="smm-stat">
      <b>{fmtNum(m.cur, m.unit)}</b>
      <span>{m.label}</span>
      <small className={'smm-delta' + tone}>{sub}</small>
    </div>
  );
}

function Table({ head, rows }) {
  return (
    <div className="smm-scroll">
      <table className="smm-table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// The agent page loads the overview once and hands it to both blocks and to the agent's status light.
export function useSiteOverview(active) {
  const [data, setData] = useState(() => (cache && Date.now() - cache.at < TTL ? cache.data : null));
  const [loading, setLoading] = useState(Boolean(active) && !data);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const alive = useRef(true);

  const load = useCallback(async (force) => {
    if (!force && cache && Date.now() - cache.at < TTL) { setData(cache.data); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const out = await fetchSiteOverview();
      cache = { at: Date.now(), data: out };
      if (alive.current) setData(out);
    } catch (e) {
      if (alive.current) setError(e.message || 'Не вдалося перевірити підключення.');
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => { alive.current = true; if (active) load(false); return () => { alive.current = false; }; }, [active, load]);
  useEffect(() => { if (active) fetchSiteStats().then((r) => { if (alive.current) setReport(r?.[0] || null); }).catch(() => {}); }, [active]);
  return { data, loading, error, report, reload: () => load(true) };
}

// true while the connection is known to be broken (the status light turns red)
const connectionBroken = (ov) => Boolean(ov && (ov.error || (ov.data?.status && !(ov.data.status.configured && ov.data.status.ga4.ok && ov.data.status.gsc.ok))));

// What turns the agent's light red: Google is not reachable, or the site itself does not answer. '' = nothing wrong.
export function siteProblem(ov) {
  if (connectionBroken(ov)) return 'Немає звʼязку з Google Analytics або Search Console, деталі в блоці «Підключення до Google».';
  const u = ov?.data?.extras?.uptime;
  return u && !u.ok ? u.error : '';
}

// Block «Підключення до Google»
export function SiteConnection({ ov, openSettings }) {
  const { data, loading, error, reload } = ov;
  const st = data?.status;
  const allOk = st && st.configured && st.ga4.ok && st.gsc.ok;
  const checked = st?.checkedAt ? fmtWhen(st.checkedAt) : null;
  return (
    <section className="smm-block sao">
      <div className="smm-block-head">
        <div>
          <h3>Підключення до Google</h3>
          <p className="smm-muted">{loading ? 'Перевіряємо зʼєднання…' : allOk ? 'Усе гаразд: агент бачить і GA4, і Search Console.' : st ? 'Є проблема з підключенням, деталі нижче.' : ''}{checked && !loading ? ` Перевірено ${checked}.` : ''}</p>
        </div>
        <button type="button" className="smm-btn" onClick={reload} disabled={loading}><ActionIcon name="regenerate" size={18} />{loading ? 'Оновлюємо…' : 'Перевірити знову'}</button>
      </div>

      {error && <p className="smm-warn-banner" role="alert">{error}</p>}

      {st && !st.configured && (
        <p className="smm-warn-banner" role="status">
          Доступ до Google не налаштовано на сервері: {st.error}. Додайте змінні у Vercel (Settings → Environment Variables) і перезапустіть розгортання. Самі ключі в чат чи на сторінку не вставляються.
        </p>
      )}
      {st?.error && st.configured && <p className="smm-warn-banner" role="alert">{st.error}{hintFor('ga4', st.error) ? ` ${hintFor('ga4', st.error)}` : ''}</p>}

      {st && (
        <div className="smm-stats">
          <Status ok={st.configured} label="Вхід у Google" detail={st.auth?.label || 'не налаштовано'} />
          <Status ok={st.ga4.ok} label="Google Analytics 4" detail={`Ресурс ${st.ga4.propertyId}`} hint={st.ga4.ok ? null : hintFor('ga4', st.ga4.error) || st.ga4.error} />
          <Status ok={st.gsc.ok} label="Search Console" detail={st.gsc.siteUrl} hint={st.gsc.ok ? null : hintFor('gsc', st.gsc.error) || st.gsc.error} />
        </div>
      )}
      {st?.warnings?.map((w) => <p key={w} className="smm-note">{w}</p>)}
      {st && (!st.ga4.ok || !st.gsc.ok) && openSettings && <div><button type="button" className="smm-btn" onClick={openSettings}>Відкрити налаштування агента</button></div>}
    </section>
  );
}

// Weeks of sessions as small bars, the oldest first.
function Bars({ weeks }) {
  const max = Math.max(1, ...weeks.map((w) => w.sessions));
  return (
    <div className="sao-bars" role="img" aria-label="Сеанси по тижнях">
      {weeks.map((w) => (
        <div key={w.start} className="sao-bar" title={`${w.start} – ${w.end}: ${w.sessions} сеансів, ${w.views} переглядів`}>
          <span>{w.sessions}</span>
          <i style={{ height: `${Math.max(3, Math.round((w.sessions / max) * 80))}px` }} />
          <small>{w.start.slice(8)}.{w.start.slice(5, 7)}</small>
        </div>
      ))}
    </div>
  );
}

const money = (n) => fmtNum(n);
const delta = (cur, prev) => (prev > 0 ? `${cur >= prev ? '+' : ''}${Math.round(((cur - prev) / prev) * 100)}%` : '—');

// Leads that the site form brought into the CRM, and whether the site opens: no Google needed for these two.
function LeadsAndSite({ extras }) {
  const L = extras?.leads;
  const U = extras?.uptime;
  if (!L && !U && !extras?.leadsError) return null;
  return (
    <>
      <h4>Заявки з сайту (з CRM) і доступність сайту</h4>
      <div className="smm-stats">
        {L && (
          <>
            <div className="smm-stat"><b>{money(L.cur.leads)}</b><span>заявок за {L.period.days} днів</span><small className={'smm-delta' + (L.delta > 0 ? ' smm-delta--up' : L.delta < 0 ? ' smm-delta--down' : '')}>{L.delta != null ? `${L.delta > 0 ? '+' : ''}${L.delta}% до попередніх ${L.period.days} днів` : `було ${L.prev.leads}, мало даних для порівняння`}</small></div>
            <div className="smm-stat"><b>{money(L.cur.deals)}</b><span>стали угодами в CRM</span><small className="smm-delta">з {L.cur.leads} заявок</small></div>
            <div className="smm-stat"><b>{money(L.cur.spam)}</b><span>спаму відсіяно</span><small className="smm-delta">дублікатів: {L.cur.duplicates}</small></div>
          </>
        )}
        {U && (
          <div className="smm-stat">
            <b style={{ color: U.ok ? undefined : 'var(--s-bad)' }}>{U.ok ? `${U.status} · ${(U.ms / 1000).toFixed(1).replace('.', ',')} с` : 'Не відповідає'}</b>
            <span>головна сторінка сайту</span>
            <small className={'smm-delta' + (U.ok && !U.slow ? ' smm-delta--up' : ' smm-delta--down')}>{U.ok ? (U.slow ? 'відкривається повільно' : 'відкривається швидко') : U.error}</small>
          </div>
        )}
      </div>
      {extras?.leadsError && <p className="smm-warn-banner" role="status">{extras.leadsError}</p>}
      {L?.sources?.length > 0 && (
        <div className="sao-pair">
          <div><h4>Звідки заявки</h4><Table head={['Джерело', 'Заявки', 'Було']} rows={L.sources.map((x) => [x.name, fmtNum(x.count), fmtNum(x.prevCount)])} /></div>
          <div><h4>З яких сторінок</h4><Table head={['Сторінка', 'Заявки']} rows={L.pages.map((x) => [x.path, fmtNum(x.count)])} /></div>
        </div>
      )}
      {L?.campaigns?.length > 0 && (<><h4>Рекламні кампанії (utm_campaign)</h4><Table head={['Кампанія', 'Заявки']} rows={L.campaigns.map((x) => [x.name, fmtNum(x.count)])} /></>)}
    </>
  );
}

// Block «Звіт»: leads and site check, the live figures, what the code found, what is handed on, and the agent's last written report.
export function SiteReport({ ov }) {
  const { data, loading, report } = ov;
  const a = data?.analysis;
  const extras = data?.extras || a?.extras;
  const findings = a ? a.findings : extras?.findings || [];
  return (
    <section className="smm-block sao">
      <div className="smm-block-head">
        <div>
          <h3>Звіт</h3>
          <p className="smm-muted">{a ? `${a.period.cur.start} – ${a.period.cur.end}, порівняно з попередніми ${a.period.days} днями. Дані читаються з Google просто зараз.` : loading ? 'Читаємо дані…' : 'Дані Google зʼявляться, коли запрацює підключення до Google.'}</p>
        </div>
      </div>

      <LeadsAndSite extras={extras} />

      {a && (
        <>
          {a.ga4 && (<><h4>Google Analytics 4: сайт</h4><div className="smm-stats">{a.ga4.metrics.map((m) => <Metric key={m.key} m={m} />)}</div></>)}
          {a.ga4?.weekly?.length > 0 && (<><h4>Сеанси по тижнях (8 тижнів)</h4><Bars weeks={a.ga4.weekly} /></>)}
          {a.gsc && (<><h4>Search Console: пошук Google</h4><div className="smm-stats">{a.gsc.metrics.map((m) => <Metric key={m.key} m={m} />)}</div></>)}

          {a.ga4?.sources?.length > 0 && (<><h4>Джерела трафіку (джерело / канал)</h4><Table head={['Джерело', 'Сеанси', 'Було', 'Зміна']} rows={a.ga4.sources.map((x) => [x.name, fmtNum(x.sessions), fmtNum(x.prevSessions), delta(x.sessions, x.prevSessions)])} /></>)}
          {a.ga4?.channels?.length > 0 && !a.ga4?.sources?.length && (<><h4>Звідки приходять</h4><Table head={['Канал', 'Сеанси', 'Було']} rows={a.ga4.channels.map((c) => [c.name, fmtNum(c.sessions), fmtNum(c.prevSessions)])} /></>)}
          {(a.ga4?.devices?.length > 0 || a.ga4?.countries?.length > 0) && (
            <div className="sao-pair">
              {a.ga4.devices?.length > 0 && <div><h4>Пристрої</h4><Table head={['Пристрій', 'Користувачі', 'Частка']} rows={a.ga4.devices.map((x) => [x.name, fmtNum(x.users), `${x.share}%`])} /></div>}
              {a.ga4.countries?.length > 0 && <div><h4>Країни</h4><Table head={['Країна', 'Користувачі', 'Було']} rows={a.ga4.countries.map((x) => [x.name, fmtNum(x.users), fmtNum(x.prevUsers)])} /></div>}
            </div>
          )}
          {a.ga4?.pages?.length > 0 && (<><h4>Сторінки за переглядами</h4><Table head={['Сторінка', 'Перегляди', 'Було', 'Зміна']} rows={a.ga4.pages.slice(0, 8).map((p) => [p.path, fmtNum(p.views), fmtNum(p.prevViews), p.delta == null ? '—' : `${p.delta > 0 ? '+' : ''}${p.delta}%`])} /></>)}
          {a.gsc?.topQueries?.length > 0 && (<><h4>Запити, за якими знаходять сайт</h4><Table head={['Запит', 'Кліки', 'Покази', 'Позиція']} rows={a.gsc.topQueries.map((q) => [q.query, fmtNum(q.clicks), fmtNum(q.impressions), fmtNum(q.position)])} /></>)}
          {(a.gsc?.movers?.risers?.length > 0 || a.gsc?.movers?.fallers?.length > 0) && (
            <div className="sao-pair">
              {a.gsc.movers.risers.length > 0 && <div><h4>Запити, що виросли</h4><Table head={['Запит', 'Кліки', 'Покази', 'Було']} rows={a.gsc.movers.risers.map((q) => [q.query, fmtNum(q.clicks), fmtNum(q.impressions), `${fmtNum(q.prevClicks)} / ${fmtNum(q.prevImpressions)}`])} /></div>}
              {a.gsc.movers.fallers.length > 0 && <div><h4>Запити, що просіли</h4><Table head={['Запит', 'Кліки', 'Покази', 'Було']} rows={a.gsc.movers.fallers.map((q) => [q.query, fmtNum(q.clicks), fmtNum(q.impressions), `${fmtNum(q.prevClicks)} / ${fmtNum(q.prevImpressions)}`])} /></div>}
            </div>
          )}
          {a.gsc?.queryPages?.length > 0 && (<><h4>Яка сторінка під який запит показується</h4><Table head={['Запит', 'Сторінка', 'Покази', 'Кліки', 'Позиція']} rows={a.gsc.queryPages.map((q) => [q.query, q.page, fmtNum(q.impressions), fmtNum(q.clicks), fmtNum(q.position)])} /></>)}
          {a.gsc?.opportunities?.length > 0 && (<><h4>Покази є, а кліків майже немає</h4><Table head={['Запит', 'Покази', 'Кліки', 'Позиція']} rows={a.gsc.opportunities.map((q) => [q.query, fmtNum(q.impressions), fmtNum(q.clicks), fmtNum(q.position)])} /></>)}
        </>
      )}

      {findings.length > 0 && (
        <>
          <h4>На що звернути увагу</h4>
          <ul className="sao-findings">
            {findings.map((f, i) => {
              const [label, color] = KIND[f.kind] || KIND.info;
              return <li key={i}><span className="smm-chip" style={{ '--chip': color }}><i aria-hidden="true" />{label}</span><span>{f.text}</span></li>;
            })}
          </ul>
        </>
      )}

      {a && (a.handoff.seo.length > 0 || a.handoff.strategist.length > 0) && (
        <div className="sao-handoff">
          {a.handoff.seo.length > 0 && <div className="smm-stat"><span><b className="sao-h">Передає SEO-оптимізатору</b></span><ul>{a.handoff.seo.map((t) => <li key={t}>{t}</li>)}</ul></div>}
          {a.handoff.strategist.length > 0 && <div className="smm-stat"><span><b className="sao-h">Передає стратегу</b></span><ul>{a.handoff.strategist.map((t) => <li key={t}>{t}</li>)}</ul></div>}
        </div>
      )}

      {report?.report && (
        <>
          <h4>Останній звіт агента <span className="smm-hint">від {fmtWhen(report.created_at)}</span></h4>
          <Markdown text={report.report} />
        </>
      )}
    </section>
  );
}
