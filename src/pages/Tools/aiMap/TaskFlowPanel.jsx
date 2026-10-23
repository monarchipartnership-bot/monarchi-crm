// "Рух задачі по відділах": the demo task going through the chain of departments, in step with the demo van on the 3D map.
// It is a demonstration only (the tag says so): no real task is behind it.

const CHAIN = [
  { key: 'strategy-research', short: 'Стратегія' },
  { key: 'performance-creative', short: 'Креативи' },
  { key: 'performance-delivery', short: 'Реклама' },
  { key: 'data-tracking-reporting', short: 'Звітність' },
  { key: 'client-success', short: 'Клієнти' },
  { key: 'sales', short: 'Продажі' },
];

const PARCEL = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" />
  </svg>
);

export default function TaskFlowPanel({ step, agentDepts, onSelectDept }) {
  const cur = CHAIN[step % CHAIN.length];
  const curLabel = agentDepts[cur.key]?.label || cur.short;
  return (
    <section className="ai-flowcard" aria-label="Рух задачі по відділах" data-ai-safe>
      <header>
        <span className="ai-flowcard-ic">{PARCEL}</span>
        <b>Рух задачі по відділах</b>
        <em className="ai-flowcard-tag">демо-рух, не реальні задачі</em>
      </header>
      <ol>
        {CHAIN.map((d, i) => (
          <li key={d.key} className={i < step ? 'is-done' : i === step ? 'is-now' : ''}>
            <button type="button" onClick={() => onSelectDept(d.key)} aria-label={`${d.short}: показати відділ`}>
              <i>{i < step ? '✓' : i + 1}</i><span>{d.short}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="ai-flowcard-now">
        <span className="ai-flowcard-ic sm">{PARCEL}</span>
        <span><b>Зараз: {curLabel}</b><small>Демо-задача «Запит клієнта на кампанію»</small></span>
      </div>
    </section>
  );
}
