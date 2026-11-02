import { authedPost } from '../adAccounts';

// The page «Стан системи»: the clock, the keys (set or not), the queue and the notices. → { status, checks: [{ key, label, status, detail }] }
export const fetchSystemState = () => authedPost('/api/system-state', {});
