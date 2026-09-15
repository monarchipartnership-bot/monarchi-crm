// Default case-study projects used by the Follow-up Generator to ground the
// AI's follow-up message in real agency results. Ported verbatim.
export const DEFAULT_PROJECTS = [
  { name: 'Byme', desc: "Took over Google Ads and Meta Ads for byMe (fashion e-commerce) - revenue grew 48%, ROAS went from 6.6 to 9.3 on Google, and on Meta we cut ad spend by 22% while increasing ROAS by 50% (5.89 to 8.82)." },
  { name: 'Oysters XO', desc: 'Oysters XO (premium oyster catering, US market): built and scaled Google Ads in a highly competitive luxury niche - 113 monthly leads at $31-41 CPA, broke into Top-3 Search Impression Share, and maintained precision targeting for high-net-worth audiences through Search and Performance Max campaigns.' },
  { name: 'HumanCentric', desc: 'HumanCentric (US workspace accessories e-commerce): managed both Google Ads and Meta Ads - grew revenue by 42%, boosted ROAS by 85% (peak 4.2x), cut ad budget by 50% while maintaining order volume, and reduced CPA from $78 to $45 through cross-channel synergy and Performance Max optimization.' },
  { name: 'MebModern', desc: 'MebModern (furniture e-commerce): managed both Meta and Google Ads - boosted sales by 66%, scaled Google Ads budget by 70% while lifting ROAS from 4 to 14, doubled Meta ad spend while maintaining 4+ ROAS, and increased website conversion rate by 3.5x through funnel optimization and creative testing.' },
  { name: 'Mola', desc: 'Mola Brand (Ukrainian skincare & haircare e-commerce): managed Meta and Google Ads across two sub-brands, increased ROAS by 125% (peaking at 12.55), grew direct message conversions 3.5x, boosted sales volume by 70%, and reduced cost per conversion by 23% through creative testing, audience expansion, retargeting optimization, and value-based bidding.' },
  { name: 'PNB', desc: 'PNB (Ukrainian nail care e-commerce brand): managed Meta and Google Ads to expand beyond an existing customer base, increasing Meta ROAS from 1.5 to 4.08, achieving a record Google Ads ROAS of 7.0, and growing sales by 70% through creative production, audience segmentation, tracking fixes, and campaign restructuring.' },
  { name: 'I Know The Pilot', desc: '(Australian travel deals platform): built and scaled a Meta Ads lead generation funnel from scratch, reducing CPL by 54% ($2.4 to $1.1), increasing newsletter subscriptions by 60% (3,000 to 4,800 per month), and boosting CTR by 40% through funnel optimization, creative testing, and budget reallocation.' },
  { name: 'NADZOR', desc: 'Took over technical SEO for NADZOR (video surveillance & home security e-commerce, ~20,000 pages) - organic traffic grew from 2,700 to 18,000 visitors/month, rankings moved from position 25 to top-6 for core keywords, with clicks and impressions nearly tripling in under half a year.' },
  { name: 'Lodka5', desc: 'Took over technical SEO for Lodka5 (fishing, hunting & outdoor recreation e-commerce) - organic traffic grew from 0 to 40,000 visitors/month, reaching top-5 rankings for core keywords, with the site seeing more than 100% overall growth within a year.' },
  { name: 'Boekhouders Totaal', desc: 'Took over technical SEO for Boekhouders Totaal (Belgian accountant directory) - organic traffic grew from 3,000 to 20,000 visitors/month, reaching top-4 rankings, with the site eventually reaching 5x more traffic than before SEO work began.' },
];

export const SHEET_ID = '1Yew_2fkbXp33WsaATGSLi52Vv2GkakaVKENnMMhc0MU';

// Real browsers cannot call api.anthropic.com directly (no CORS, requires a
// secret key). Point this at a backend proxy (e.g. a Cloudflare Worker) that
// forwards the request and attaches the API key server-side before this tool
// works in production.
export const API_ENDPOINT = 'https://api.anthropic.com/v1/messages';

export const PROJECTS_CACHE_KEY = 'mon-archi-projects-cache';
