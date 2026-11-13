import '../../../styles/qcLine.css';

const ASPECT = { brand: 'бренд', product: 'товар', artifact: 'дефект картинки', text: 'текст', brief: 'ТЗ' };
const SEV = { high: 'серйозно', medium: 'помірно', low: 'дрібниця' };

// What the quality checker thinks of the FINISHED picture (step 3.2; ADVICE only, the manager decides): a mark and, when there is something to say, the reasons. qc: { verdict: 'pass' | 'fail', summary, issues: [{ aspect, severity, comment }] } or null
//   compact: only the mark (the small card), open: the reasons are shown at once (the large view)
export default function QcLine({ qc, compact = false, open = false }) {
  if (!qc) return null;
  const fail = qc.verdict === 'fail';
  const issues = (qc.issues || []).filter((i) => i.comment);
  return (
    <div className={'qcl ' + (fail ? 'is-fail' : 'is-ok')}>
      <span className="qcl-mark">{fail ? 'Контроль якості не схвалив би' : 'Контроль якості схвалив би'}</span>
      {!compact && qc.summary && <span className="qcl-sum">{qc.summary}</span>}
      {!compact && issues.length > 0 && (
        <details open={open || fail}>
          <summary>Що знайшов контроль ({issues.length})</summary>
          <ul>{issues.map((i, k) => <li key={k} className={'is-' + i.severity}><b>{ASPECT[i.aspect] || 'дефект'} · {SEV[i.severity] || i.severity}:</b> {i.comment}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
