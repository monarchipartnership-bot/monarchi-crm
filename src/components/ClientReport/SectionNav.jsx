import { useEffect, useState } from 'react';
import { useT } from './langContext';

// The ribbon of the page's sections (Overview, Spend & ROAS, Funnel, Details, Notes, Creatives): it is built from the sections that are really on the page
// (every <Sec> carries `data-secnav`), follows the reading and jumps to a section on a click. With fewer than three sections it is not shown.
// `watch` is whatever changes the page (the month that is open): the ribbon reads the sections again.
export default function SectionNav({ watch }) {
  const t = useT();
  const [items, setItems] = useState([]);
  const [active, setActive] = useState('');

  useEffect(() => {
    // the page is drawn after the header (the data loads first), so the whole body is watched, not only #view
    const read = () => {
      const view = document.querySelector('.crh'); // a single report has no #view of its own
      const next = view ? [...view.querySelectorAll('[data-secnav]')].map((el) => ({ id: el.id, title: el.getAttribute('data-secnav') })) : [];
      setItems((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [watch]);

  useEffect(() => {
    const onScroll = () => {
      let cur = items[0]?.id || '';
      items.forEach((x) => { const el = document.getElementById(x.id); if (el && el.getBoundingClientRect().top <= 140) cur = x.id; });
      if (items.length && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 6) cur = items[items.length - 1].id; // the end of the page: the last section, even when it is too short to reach the top
      setActive(cur);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [items]);

  if (items.length < 3) return null;
  return (
    <div className="cx-navw">
      <nav className="cx-nav" aria-label={t('Sections')}>
        {items.map((x) => (
          <button key={x.id} type="button" className={active === x.id ? 'on' : ''} aria-current={active === x.id ? 'true' : undefined} onClick={() => document.getElementById(x.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{x.title}</button>
        ))}
      </nav>
    </div>
  );
}
