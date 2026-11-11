import { useMemo, useState } from 'react';
import MultiCountryField from '../../common/MultiCountryField';
import Select from '../../common/Select';
import { COUNTRIES } from '../../../lib/countries';
import { languageLabel, languageOptions, overlaySafe } from '../../../lib/agents/languages';
import { marketsText, parseMarkets } from '../../../lib/agents/markets';

// The editor of the field «Ринки й мови» (owner, 2026-11-12): the countries from a list (several), the language of the client from a list (one: everything meant for the client is
// written in it). The countries are kept as the text the agents read; the language is a field of the project.
//   text: the saved text of the field   language: the code now (or '')   onSave({ text, language })   onCancel()   busy
export default function MarketsEditor({ text = '', language = '', onSave, onCancel, busy = false }) {
  const [codes, setCodes] = useState(() => parseMarkets(text, COUNTRIES));
  const [lang, setLang] = useState(language || '');
  const options = useMemo(() => [{ value: '', label: 'Не вказано' }, ...languageOptions()], []);
  const old = String(text || '').trim();
  const changedFromText = old && !codes.length;
  return (
    <div className="mk">
      <div className="mk-block">
        <b>Країни, у яких рекламуємось</b>
        <MultiCountryField value={codes} onChange={setCodes} />
        {changedFromText && <p className="mk-note">Раніше було написано: «{old}». Країни з цього тексту не розпізнано: оберіть їх зі списку.</p>}
      </div>
      <div className="mk-block">
        <b>Мова клієнта</b>
        <Select bare searchable value={lang} onChange={setLang} options={options} ariaLabel="Мова клієнта" />
        <p className="mk-note">Усі тексти для клієнта (на креативах, у рекламі, у звітах) агенти пишуть цією мовою. Для команди результати завжди українською.{lang && !overlaySafe(lang) ? ' Для цієї мови слова не накладаються на картинку: тексти видаються окремо.' : ''}</p>
      </div>
      <div className="pcr-row-actions">
        <button type="button" className="btn btn-p" disabled={busy} onClick={() => onSave({ text: marketsText(codes, COUNTRIES), language: lang })}>{busy ? 'Зберігаємо…' : 'Зберегти'}</button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>Скасувати</button>
      </div>
    </div>
  );
}

export const marketsLanguageLine = (language) => (language ? `Мова клієнта: ${languageLabel(language)}` : 'Мова клієнта не вибрана: без неї команди «Креативи» і «Звіти» не запустяться.');
