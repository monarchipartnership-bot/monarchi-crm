import { createContext, useContext, useMemo } from 'react';
import { normLang, trFor } from '../../lib/clientLang';

// The language the client page is drawn in. A report (a week, a month, one custom report) wraps its part of the page in its own, so every report has its own language;
// the rest of the page follows the project's. English by default, as the page always was.
const LangContext = createContext('en');

export function LangProvider({ lang, children }) {
  return <LangContext.Provider value={normLang(lang)}>{children}</LangContext.Provider>;
}
export const useLang = () => useContext(LangContext);
export function useT() {
  const lang = useLang();
  return useMemo(() => trFor(lang), [lang]);
}
