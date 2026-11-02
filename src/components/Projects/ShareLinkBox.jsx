import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../common/ConfirmDialog';
import { HubTitle } from './hubIcons';
import InfoTip from '../common/InfoTip';
import { fetchReportShare, fetchReportShareFor, issueReportShare, issueReportShareFor, revokeReportShare, revokeReportShareFor } from '../../lib/api/projectReportStore';
import { shareUrl } from '../../lib/clientReport';
import '../../styles/projectHistory.css';

const stamp = (iso) => (iso ? new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

// «Посилання для клієнта»: ONE public link per project + platform. The page behind it shows only approved weeks and the running total of the month, and it
// updates itself, so the client keeps the same link for good. A new link stops the old one at once.
// With `reportId` the box is the link of ONE custom report: the page shows that report as it was saved (what is changed afterwards reaches the client after «Зберегти»).
export default function ShareLinkBox({ projectId, scope, label, reportId = null }) {
  const { email } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const [share, setShare] = useState(undefined); // undefined: loading, null: no active link
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const input = useRef(null);

  const load = useCallback(async () => { setShare(reportId ? await fetchReportShareFor(reportId) : await fetchReportShare(projectId, scope)); }, [projectId, scope, reportId]);
  const issue = () => (reportId ? issueReportShareFor(reportId, email) : issueReportShare(projectId, scope, email));
  const revokeIt = () => (reportId ? revokeReportShareFor(reportId) : revokeReportShare(projectId, scope));
  useEffect(() => { setShare(undefined); setError(''); setCopied(false); load(); }, [load]);

  async function run(fn) {
    setBusy(true);
    setError('');
    try { await fn(); await load(); } catch (e) { setError(e.message || 'Не вдалося виконати дію.'); } finally { setBusy(false); }
  }
  const url = share ? shareUrl(window.location.origin, share.token) : '';

  async function copy() {
    try { await navigator.clipboard.writeText(url); } catch { input.current?.select(); document.execCommand?.('copy'); }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  async function renew() {
    if (!(await confirm({ title: 'Створити нове посилання?', body: 'Поточне посилання одразу перестане працювати. Клієнту потрібно буде надіслати нове.', confirmLabel: 'Створити нове', danger: true }))) return;
    run(issue);
  }
  async function revoke() {
    if (!(await confirm({ title: 'Вимкнути посилання?', body: 'Клієнт більше не зможе відкрити звіт за цим посиланням. Пізніше можна створити нове.', confirmLabel: 'Вимкнути', danger: true }))) return;
    run(revokeIt);
  }

  return (
    <div className="ph-share">
      <HubTitle icon="link" as="h3" className="ph-share-title">Посилання для клієнта · {label}<InfoTip>{reportId ? 'Клієнт бачить цей звіт у тому вигляді, в якому він збережений: цифри, тексти, креативи й воронку. Що приховано оком, клієнт не бачить. Після змін натисніть «Зберегти»: посилання те саме. Пароля немає, доступу до рекламного кабінету теж.' : 'Клієнт бачить лише затверджені тижні та поточний підсумок місяця. Посилання одне й те саме: нові тижні зʼявляються на сторінці самі. Пароля немає, доступу до рекламного кабінету теж.'}</InfoTip></HubTitle>
      {error && <div className="pacc-err">{error}</div>}
      {share === undefined && <div className="empty-hint">Завантаження…</div>}
      {share === null && (
        <div className="ph-share-row"><button type="button" className="btn btn-p" disabled={busy} onClick={() => run(issue)}>Створити посилання</button></div>
      )}
      {share && (
        <>
          <div className="ph-share-row">
            <input ref={input} className="ph-share-url" readOnly value={url} aria-label="Посилання для клієнта" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn-p" onClick={copy}>{copied ? 'Скопійовано' : 'Копіювати'}</button>
            <a className="btn" href={url} target="_blank" rel="noreferrer">Відкрити</a>
            <button type="button" className="btn" disabled={busy} onClick={renew}>Нове посилання</button>
            <button type="button" className="btn" disabled={busy} onClick={revoke}>Вимкнути</button>
          </div>
          <div className="ph-share-meta">Створено {stamp(share.created_at)} · відкривали {share.opens || 0} {share.opens === 1 ? 'раз' : 'разів'}{share.last_opened_at ? `, востаннє ${stamp(share.last_opened_at)}` : ''}</div>
        </>
      )}
      {confirmDialog}
    </div>
  );
}
