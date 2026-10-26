import ActionIcon from '../../../components/common/ActionIcon';
import { STATUS_TEXT } from './status';
import './DeptChrome.css';

// Chrome of a focused department on the 3D map (Hub style, picks C + 2 of the 2026-10-25 mockup):
// a rail of medallions on the right with a flyout card, «До мапи» above the rail, and a strip of all departments at the bottom.

const STRIP_ORDER = ['management', 'strategy-research', 'performance-creative', 'performance-delivery', 'data-tracking-reporting', 'client-success', 'sales'];
const SHORT = {
  management: 'Управління', 'strategy-research': 'Стратегія', 'performance-creative': 'Креативи', 'performance-delivery': 'Реклама',
  'data-tracking-reporting': 'Дані', 'client-success': 'Клієнти', sales: 'Продажі',
};

const RAIL_ICONS = {
  ov: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  fn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5"/></svg>',
  ag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/></svg>',
  go: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5v14l11-7z"/></svg>',
};

function Medallion({ html, size }) {
  return (
    <span className="dw-med" style={{ '--s': `${size}px` }} aria-hidden="true">
      <i><b dangerouslySetInnerHTML={{ __html: html }} /></i>
    </span>
  );
}

const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

export function DeptRail({ focused, closed, setClosed, tab, setTab, onReset, onOpenAgent }) {
  const { key, dept } = focused;
  const soon = !!dept.comingSoon;
  const startHere = dept.startHere ? dept.subcategories.flatMap((sc) => sc.agents).find((a) => a.key === dept.startHere) : null;
  const total = dept.subcategories.reduce((s, sc) => s + sc.agents.length, 0);
  const tabs = soon
    ? [['ov', 'Огляд']]
    : [['ov', 'Огляд'], ['fn', 'Функції'], ['ag', 'Агенти'], ...(startHere ? [['go', 'Старт']] : [])];
  const open = !closed;

  function pick(k) {
    if (open && tab === k) setClosed(true);
    else { setTab(k); setClosed(false); }
  }
  const openWith = (ag, sc) => onOpenAgent({ ...ag, deptKey: key, deptLabel: dept.label, color: dept.color, subcatLabel: sc?.label });

  let body = null;
  if (tab === 'fn' && !soon) {
    body = (
      <ul className="dw-rows">
        {dept.subcategories.map((sc) => (
          <li key={sc.key}><span>{sc.label}</span><span className="dw-chip">{sc.agents.length} {plural(sc.agents.length, 'агент', 'агенти', 'агентів')}</span></li>
        ))}
      </ul>
    );
  } else if (tab === 'ag' && !soon) {
    body = dept.subcategories.map((sc) => (
      <div key={sc.key} className="dw-group">
        <div className="dw-lab">{sc.label}</div>
        {sc.agents.map((ag) => (
          <button key={ag.key} type="button" className="dw-agent" onClick={() => openWith(ag, sc)}>
            <span className={'dw-dot s-' + ag.status} aria-hidden="true" />
            <span className="dw-agent-name">{ag.name}</span>
            <span className="dw-agent-st">{STATUS_TEXT[ag.status] || ag.status}</span>
          </button>
        ))}
      </div>
    ));
  } else if (tab === 'go' && startHere) {
    body = (
      <>
        <div className="dw-lab">З чого почати</div>
        <button type="button" className="dw-cta" onClick={() => openWith(startHere)}><span>{startHere.name}</span><ActionIcon name="chevron" size={16} /></button>
      </>
    );
  } else {
    body = (
      <>
        {dept.narrative && <p className="dw-txt">{dept.narrative}</p>}
        {soon && dept.comingSoonNote && <p className="dw-txt">{dept.comingSoonNote}</p>}
        {soon && <div className="dw-soon">Узгоджено з командою як частина цільової карти відділів. Реалізація ще не почалась.</div>}
        {!soon && (
          <>
            <div className="dw-lab">Що охоплює</div>
            <div className="dw-chips">{dept.subcategories.map((sc) => <span key={sc.key} className="dw-chip">{sc.label}</span>)}</div>
            <div className="dw-nums">{total} {plural(total, 'агент', 'агенти', 'агентів')} · {dept.subcategories.length} {plural(dept.subcategories.length, 'функція', 'функції', 'функцій')}</div>
          </>
        )}
      </>
    );
  }

  return (
    <div className="dw-right" data-ai-safe>
      <button type="button" className="dw-back" onClick={onReset}><ActionIcon name="back" size={16} />До мапи</button>
      <div className="dw-rail" role="group" aria-label="Розділи відділу">
        {tabs.map(([k, name]) => (
          <button key={k} type="button" className="dw-rail-btn" aria-pressed={open && tab === k} onClick={() => pick(k)}>
            <Medallion html={RAIL_ICONS[k]} size={46} />
            <span>{name}</span>
          </button>
        ))}
      </div>
      {open && (
        <section className="dw-fly" aria-label={dept.label}>
          <div className="dw-fly-head">
            <div>
              <div className="dw-eyebrow">{soon ? 'Відділ · скоро' : 'Відділ'}</div>
              <h2>{dept.label}</h2>
              <div className="dw-sub">{dept.subtitle}</div>
            </div>
            <button type="button" className="dw-x" aria-label="Згорнути панель відділу" onClick={() => setClosed(true)}><ActionIcon name="close" size={16} /></button>
          </div>
          {body}
        </section>
      )}
    </div>
  );
}

export function DeptStrip({ deptKeys, agentDepts, current, onSelect }) {
  const keys = [...STRIP_ORDER.filter((k) => deptKeys.includes(k)), ...deptKeys.filter((k) => !STRIP_ORDER.includes(k))];
  return (
    <nav className="dw-strip" aria-label="Відділи" data-ai-safe>
      {keys.map((k) => {
        const d = agentDepts[k];
        return (
          <button key={k} type="button" className="dw-strip-btn" aria-pressed={k === current} aria-label={d.label} onClick={() => onSelect(k)}>
            <Medallion html={d.icon} size={46} />
            <span>{SHORT[k] || d.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
