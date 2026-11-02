import { authedPost } from '../adAccounts';

// New clients: Meta ad accounts that appear in the CRM's access become projects by themselves (once a day). These calls are for the banner «Нові кабінети в Meta»
// and its buttons; they work on the deployed site only (the Meta token lives on the server).
export const fetchMetaSyncStatus = () => authedPost('/api/meta-sync', { action: 'status' });   // → { enabled, autoCreate, baselineDone, ignored, lastRunAt, lastReport, waiting: [{ id, name, currency, status }] }
export const runMetaSyncNow = () => authedPost('/api/meta-sync', { action: 'run' });
export const importMetaAccount = (accountId) => authedPost('/api/meta-sync', { action: 'import', accountId });
export const ignoreMetaAccount = (accountId) => authedPost('/api/meta-sync', { action: 'ignore', accountId });
export const unignoreMetaAccount = (accountId) => authedPost('/api/meta-sync', { action: 'unignore', accountId });
export const saveMetaSyncSettings = (patch) => authedPost('/api/meta-sync', { action: 'settings', ...patch });
