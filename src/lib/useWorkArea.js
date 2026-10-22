import { useEffect, useState } from 'react';

// Where the working area starts (the page next to the sidebar): the report windows cover this area and leave the sidebar visible.
const measure = () => {
  const main = typeof document !== 'undefined' ? document.querySelector('.main') : null;
  return main ? Math.max(0, Math.round(main.getBoundingClientRect().left)) : 0;
};

export default function useWorkAreaLeft() {
  const [left, setLeft] = useState(measure);
  useEffect(() => {
    const on = () => setLeft(measure());
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return left;
}
