// The conversion actions of a Google Ads account with their counts (read-only), for choosing the stages of the funnel (src/lib/googleFunnel.js).
import { authedPost } from '../adAccounts';

// → { period: { from_date, to_date }, actions: [{ name, type, category, primary, count }] }, the most used first
export const fetchConversionActions = (customerId) => authedPost('/api/google-ads-accounts', { action: 'conversion_actions', customerId });
