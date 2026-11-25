import { useCallback, useEffect, useState } from 'react';
import { fetchConnections } from '../../lib/api/workflow';
import { Pill } from '../../components/Workflow/parts';
import { ageText } from '../../lib/workflow/view';

// The window «Підключення» of the AI Agents section: what the agents work with and whether it works (Meta, pictures, the model, Telegram, the cron, Google, TikTok).
// The server asks; secrets never come to the page, only the state. On the pilot most of the time went on access (a token without the right to write, a page that was not assigned),
// so the check is here before the first launch of a client.
const LABEL = { ok: 'Працює', warn: 'Увага', bad: 'Не працює', mute: 'Не підключено' };

export default function Connections() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setBusy(true); try { setData(await fetchConnections()); setErr(''); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); } }, []);
  useEffect(() => { load(); }, [load]);

  if (err && !data) return <div className="wf wf-page"><div className="wf-err" role="alert">{err}</div><button type="button" className="wf-btn sm" style={{ marginTop: 10 }} onClick={load}>Повторити</button></div>;
  if (!data) return <div className="wf wf-page"><div className="wf-load">Перевіряємо підключення…</div></div>;
  const n = (t) => data.checks.filter((c) => c.tone === t).length;
  return (
    <div className="wf wf-page wf-grid wf-cn">
      <div className="wf-row" style={{ justifyContent: 'space-between' }}>
        <div className="wf-row"><Pill tone="ok">Працює: {n('ok')}</Pill>{n('warn') > 0 && <Pill tone="warn">Увага: {n('warn')}</Pill>}{n('bad') > 0 && <Pill tone="bad">Не працює: {n('bad')}</Pill>}<span className="wf-muted" style={{ fontSize: 12.5 }}>перевірено {ageText(data.at)} тому</span></div>
        <button type="button" className="wf-btn sm p" disabled={busy} onClick={load}>{busy ? 'Перевіряємо…' : 'Перевірити знову'}</button>
      </div>
      {err && <div className="wf-err" role="alert">{err}</div>}
      <div className="wf-card">
        {data.checks.map((c) => (
          <div key={c.key} className="wf-cn-row">
            <i className={'wf-cn-dot ' + c.tone} aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <b>{c.title}</b>
              <div className="wf-muted" style={{ fontSize: 13 }}>{c.text}</div>
              {c.details?.length > 0 && <details className="wf-muted" style={{ fontSize: 12.5, marginTop: 2 }}><summary>Подробиці</summary>{c.details.map((d, i) => <div key={i}>{d}</div>)}</details>}
            </div>
            <Pill tone={c.tone}>{LABEL[c.tone]}</Pill>
          </div>
        ))}
      </div>
      <div className="wf-muted" style={{ fontSize: 12.5 }}>Доступ токена до кабінету й сторінки конкретного клієнта перевіряє картка «Готовність до запуску» на вкладці «Огляд» проєкту. Секрети тут не показуються.</div>
    </div>
  );
}
