import { useCallback, useEffect, useRef, useState } from 'react';
import ActionIcon from '../../components/common/ActionIcon';
import { fetchSiteOverview } from '../../lib/api/agents';
import { fetchSiteStats } from '../../lib/api/smm';
import { fmtWhen } from '../../lib/smmDates';
import Markdown from './Markdown';

// The website analyst's main page: first «is the connection healthy», then the figures it tracks right now.
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

export default function SiteAnalystOverview({ openSettings }) {
  const [data, setData] = useState(() => (cache && Date.now() - cache.at < TTL ? cache.data : null));
  const [loading, setLoading] = useState(!data);
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

  useEffect(() => { alive.current = true; load(false); return () => { alive.current = false; }; }, [load]);
  useEffect(() => { fetchSiteStats().then((r) => { if (alive.current) setReport(r?.[0] || null); }).catch(() => {}); }, []);

  const st = data?.status;
  const a = data?.analysis;
  const allOk = st && st.configured && st.ga4.ok && st.gsc.ok;
  const checked = st?.checkedAt ? fmtWhen(st.checkedAt) : null;

  return (
    <section className="smm-block sao">
      <div className="smm-block-head">
        <div>
          <h3>Підключення до Google</h3>
          <p className="smm-muted">{loading ? 'Перевіряємо зʼєднання…' : allOk ? 'Усе гаразд: агент бачить і GA4, і Search Console.' : st ? 'Є проблема з підключенням, деталі нижче.' : ''}{checked && !loading ? ` Перевірено ${checked}.` : ''}</p>
        </div>
        <button type="button" className="smm-btn" onClick={() => load(true)} disabled={loading}><ActionIcon name="regenerate" size={18} />{loading ? 'Оновлюємо…' : 'Перевірити знову'}</button>
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

      {a && (
        <>
          <div className="smm-block-head sao-head">
            <div>
              <h3>Показники, які відстежує агент</h3>
              <p className="smm-muted">{a.period.cur.start} – {a.period.cur.end}, порівняно з попередніми {a.period.days} днями. Дані читаються з Google просто зараз.</p>
            </div>
          </div>
          {a.ga4 && (<><h4>Google Analytics 4: сайт</h4><div className="smm-stats">{a.ga4.metrics.map((m) => <Metric key={m.key} m={m} />)}</div></>)}
          {a.gsc && (<><h4>Search Console: пошук Google</h4><div className="smm-stats">{a.gsc.metrics.map((m) => <Metric key={m.key} m={m} />)}</div></>)}

          {a.ga4?.channels?.length > 0 && (<><h4>Звідки приходять</h4><Table head={['Канал', 'Сеанси', 'Було']} rows={a.ga4.channels.map((c) => [c.name, fmtNum(c.sessions), fmtNum(c.prevSessions)])} /></>)}
          {a.ga4?.pages?.length > 0 && (<><h4>Сторінки за переглядами</h4><Table head={['Сторінка', 'Перегляди', 'Було', 'Зміна']} rows={a.ga4.pages.slice(0, 8).map((p) => [p.path, fmtNum(p.views), fmtNum(p.prevViews), p.delta == null ? '—' : `${p.delta > 0 ? '+' : ''}${p.delta}%`])} /></>)}
          {a.gsc?.topQueries?.length > 0 && (<><h4>Запити, за якими знаходять сайт</h4><Table head={['Запит', 'Кліки', 'Покази', 'Позиція']} rows={a.gsc.topQueries.map((q) => [q.query, fmtNum(q.clicks), fmtNum(q.impressions), fmtNum(q.position)])} /></>)}
          {a.gsc?.opportunities?.length > 0 && (<><h4>Покази є, а кліків майже немає</h4><Table head={['Запит', 'Покази', 'Кліки', 'Позиція']} rows={a.gsc.opportunities.map((q) => [q.query, fmtNum(q.impressions), fmtNum(q.clicks), fmtNum(q.position)])} /></>)}

          {a.findings.length > 0 && (
            <>
              <h4>На що звернути увагу</h4>
              <ul className="sao-findings">
                {a.findings.map((f, i) => {
                  const [label, color] = KIND[f.kind] || KIND.info;
                  return <li key={i}><span className="smm-chip" style={{ '--chip': color }}><i aria-hidden="true" />{label}</span><span>{f.text}</span></li>;
                })}
              </ul>
            </>
          )}

          {(a.handoff.seo.length > 0 || a.handoff.strategist.length > 0) && (
            <div className="sao-handoff">
              {a.handoff.seo.length > 0 && <div className="smm-stat"><span><b className="sao-h">Передає SEO-оптимізатору</b></span><ul>{a.handoff.seo.map((t) => <li key={t}>{t}</li>)}</ul></div>}
              {a.handoff.strategist.length > 0 && <div className="smm-stat"><span><b className="sao-h">Передає стратегу</b></span><ul>{a.handoff.strategist.map((t) => <li key={t}>{t}</li>)}</ul></div>}
            </div>
          )}
        </>
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
