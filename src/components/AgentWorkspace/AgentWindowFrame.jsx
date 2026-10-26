import { useRef } from 'react';
import { createPortal } from 'react-dom';
import ActionIcon from '../common/ActionIcon';
import useDialogA11y from '../../lib/useDialogA11y';
import { Medallion } from './AgentWindowParts';
import { useAgentWindowNight } from './AgentWindowTheme';
import '../../styles/agentWindowHub.css';

// The frame of every agent window of the AI Agents section (Hub style, variant B of 2026-10-27): a full-screen window with a left column (the agent
// medallion, the sections as medallions, a note) and a right part (header, chips, body, footer). The body is the caller's own.
//   who: { name, sub, icon, html, ring }  sections: [{ key, label, icon, count, bad }]  active / onSection: the open section
//   eyebrow / title: the header text  headRight: extra header controls (before the close button)  chips: node under the header  toast: node
//   footer: node (omit for none)  note: text at the bottom of the left column  extra: nodes that belong inside the window (confirm dialogs)
export default function AgentWindowFrame({ label, who, sections = [], active, onSection, eyebrow, title, headRight, chips, toast, footer, note, extra, onClose, closeLabel = 'Назад', tool = false, children }) {
  const box = useRef(null);
  const night = useAgentWindowNight();
  useDialogA11y(box, onClose);
  return createPortal(
    <div className={'dwa-overlay smm-overlay' + (night ? ' is-night' : '')} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className="dwa-win" role="dialog" aria-modal="true" aria-label={label || who?.name || 'Агент'} tabIndex={-1}>
        {who && (
          <aside className="dwa-side">
            <div className="dwa-who">
              <Medallion icon={who.icon || 'agent'} html={who.html} size={52} ring={4} color={who.ring} />
              <span><b>{who.name}</b><small>{who.sub}</small></span>
            </div>
            {sections.length > 0 && (
              <nav className="dwa-nav" role="tablist" aria-orientation="vertical" aria-label="Розділи агента">
                {sections.map((s) => (
                  <button key={s.key} type="button" role="tab" aria-selected={active === s.key} className="dwa-nav-i" onClick={() => onSection(s.key)}>
                    <Medallion icon={s.icon} size={38} ring={3} />
                    <span className="dwa-nav-t">{s.label}</span>
                    {s.count ? <span className={'dwa-cnt' + (s.bad ? ' is-bad' : '')}>{s.count}</span> : null}
                  </button>
                ))}
              </nav>
            )}
            {note && <div className="dwa-note">{note}</div>}
          </aside>
        )}
        <div className="dwa-main">
          <header className="dwa-head">
            <div className="dwa-idt">
              {eyebrow && <div className="dwa-eyebrow">{eyebrow}</div>}
              <h2>{title}</h2>
            </div>
            {headRight}
            <button type="button" className="dwa-back" onClick={onClose}><ActionIcon name="back" size={16} />{closeLabel}</button>
          </header>
          {toast}
          {chips && <div className="dwa-chips">{chips}</div>}
          <div className={'dwa-scroll' + (tool ? ' dwa-scroll--tool' : '')} role="tabpanel">{children}</div>
          {footer && <footer className="dwa-foot">{footer}</footer>}
        </div>
        {extra}
      </div>
    </div>,
    document.body,
  );
}
