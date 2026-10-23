import { useEffect, useState } from 'react';
import { fetchOpenRequests } from '../../../lib/api/deptAgents';

// The live requests of the creative department for the «Рух задачі» card of the map (refreshed every minute). No access or no tables yet: an empty list.
export default function useOpenRequests() {
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = () => fetchOpenRequests().then((r) => { if (alive) setList(r); }).catch(() => { if (alive) setList([]); });
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return list;
}
