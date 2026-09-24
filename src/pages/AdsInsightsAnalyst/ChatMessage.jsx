import AiaTable from './AiaTable';
import AiaChart from './AiaChart';

export default function ChatMessage({ role, content, visual }) {
  return (
    <div className={'aia-msg aia-msg-' + role}>
      <div className="aia-msg-col">
        {content && <div className="aia-msg-bubble">{content}</div>}
        {visual?.kind === 'table' && <AiaTable title={visual.title} columns={visual.columns} rows={visual.rows} />}
        {visual?.kind === 'chart' && <AiaChart title={visual.title} type={visual.type} labels={visual.labels} datasets={visual.datasets} />}
      </div>
    </div>
  );
}
