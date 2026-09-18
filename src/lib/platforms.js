// Logo images for the client "Платформа" values (CLIENT_PLATFORMS,
// reportConstants.js) — kept as its own module (rather than merged into
// reportConstants.js) since it pulls in image assets, not just plain data.
import { CLIENT_PLATFORMS } from './reportConstants';
import upwork from '../assets/platforms/upwork.png';
import fiverr from '../assets/platforms/fiverr.png';
import linkedin from '../assets/platforms/linkedin.png';
import facebook from '../assets/platforms/facebook.png';
import instagram from '../assets/platforms/instagram.png';
import reddit from '../assets/platforms/reddit.png';
import website from '../assets/platforms/website.png';
import other from '../assets/platforms/other.png';

const LOGOS = { Upwork: upwork, Fiverr: fiverr, LinkedIn: linkedin, Facebook: facebook, Instagram: instagram, Reddit: reddit, Website: website, Other: other };

// Each platform's own brand color — used as a light tint behind its logo
// (e.g. badges) rather than the generic hashed tag color, so "Upwork" reads
// green, "Reddit" reads orange, etc. instead of all landing on whatever
// colorForTag's hash happens to assign.
const COLORS = {
  Upwork: '#14A800',
  Fiverr: '#1DBF73',
  LinkedIn: '#0A66C2',
  Facebook: '#3B5998',
  Instagram: '#C13584',
  Reddit: '#FF4500',
  Website: '#0EA5E9',
  Other: '#64748B',
};

export const PLATFORMS = CLIENT_PLATFORMS.map((name) => ({ value: name, label: name, logo: LOGOS[name], color: COLORS[name] }));

export function platformLogo(name) {
  return LOGOS[name] || null;
}

export function platformColor(name) {
  return COLORS[name] || '#64748B';
}
