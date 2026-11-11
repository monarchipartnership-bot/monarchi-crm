// «Ринки й мови» of the card of a project (owner, 2026-11-12): the countries are chosen from a list (not typed), the language is the language of the client. The agents read the
// field as one short text; this file turns the chosen countries into that text and back. The list of countries is handed in (lib/countries.js imports a stylesheet, so this file
// stays free of it and the tests can run it). Pure code.

// countries: [{ code, name }]; codes: the chosen ones → «Країни реклами: Німеччина, Австрія.» ('' when none)
export function marketsText(codes = [], countries = []) {
  const names = codes.map((c) => countries.find((x) => x.code === c)?.name).filter(Boolean);
  return names.length ? `Країни реклами: ${names.join(', ')}.` : '';
}

// the text of the field → the codes of the countries it names (the names are looked for as whole words, longest first, so «Корея» is not found inside «Південна Корея»)
// the short names people write for the countries
const ALIASES = { сша: 'US', usa: 'US', us: 'US', 'united states': 'US', америка: 'US', великобританія: 'GB', британія: 'GB', uk: 'GB', 'united kingdom': 'GB', оае: 'AE', uae: 'AE', німеччина: 'DE', germany: 'DE', канада: 'CA', canada: 'CA', австралія: 'AU', australia: 'AU', польща: 'PL', poland: 'PL' };
export function parseMarkets(text = '', countries = []) {
  let rest = ` ${String(text || '').toLowerCase()} `;
  const found = [];
  const known = new Set(countries.map((c) => c.code));
  const names = [...countries.map((c) => ({ code: c.code, name: c.name })), ...Object.entries(ALIASES).filter(([, code]) => known.has(code)).map(([name, code]) => ({ code, name }))];
  names.sort((a, b) => b.name.length - a.name.length).forEach((c) => {
    if (found.includes(c.code)) return;
    const name = c.name.toLowerCase();
    const re = new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u');
    if (re.test(rest)) { found.push(c.code); rest = rest.replace(re, ' '); }
  });
  return found;
}
