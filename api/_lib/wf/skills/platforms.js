// The agents of the new system work with Meta only (step A13: Google needs a description from Google specialists, TikTok needs an adaptation and a trial project,
// as the document «Робочий процес клієнта» says). A project that has only cabinets of other platforms must not wait in silence: the reason says so.
const NAMES = { google: 'Google', tiktok: 'TikTok' };

// all = every ad account of the project. → '' or a sentence for the end of the reason
export function otherPlatformsNote(all = []) {
  const other = [...new Set(all.filter((a) => a.platform !== 'meta').map((a) => NAMES[a.platform] || a.platform))];
  if (!other.length) return '';
  return ` У проєкті є кабінети ${other.join(', ')}, але автоматизації для них ще немає: агенти працюють лише з Meta. Ці платформи ведіть вручну або підключіть кабінет Meta.`;
}
