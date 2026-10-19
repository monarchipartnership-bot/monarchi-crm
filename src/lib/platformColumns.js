// The extra report columns of every platform that has a catalog: Meta (src/lib/metaColumns.js) and Google Ads (src/lib/googleColumns.js).
import { META_METRIC_LIST, META_METRICS, isExtraMetric, pickCounts } from './metaColumns.js';
import { GOOGLE_METRIC_LIST, GOOGLE_METRICS } from './googleColumns.js';

export { isExtraMetric, pickCounts };

// Columns available per platform (a platform without a catalog has none).
export const PLATFORM_COLUMNS = { meta: META_METRIC_LIST, google: GOOGLE_METRIC_LIST };

// Every extra metric of every platform, for the formulas / labels registry in reportMetrics.
export const EXTRA_METRICS = { ...META_METRICS, ...GOOGLE_METRICS };

// Only keys of the platform's catalog survive (what comes back from storage or a request is never trusted).
export const cleanColumns = (platform, keys) => (PLATFORM_COLUMNS[platform] ? [...new Set((keys || []).filter((k) => PLATFORM_COLUMNS[platform].some((m) => m.key === k)))] : []);

// The picked columns a saved report has no numbers for (it was made before they were picked): [metric keys]. Columns that need no
// platform count (a ratio of standard numbers) are never missing.
export const missingColumns = (platform, keys, total) => cleanColumns(platform, keys).filter((k) => (EXTRA_METRICS[k].needs || []).some((n) => total?.[`x_${n}`] == null));
