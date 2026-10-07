import { useMemo } from 'react';
import Select from './Select';
import { COUNTRIES, flagClass } from '../../lib/countries';
import '../../styles/multiCountryField.css';

const ALL_OPTIONS = COUNTRIES.map((c) => ({ value: c.code, label: c.name, iconClassName: flagClass(c.code) }));

// Several countries at once (promotion GEO): chips for what's chosen plus a
// searchable picker that offers the rest. Values are country codes.
export default function MultiCountryField({ value, onChange, disabled }) {
  const chosen = useMemo(() => value || [], [value]);
  const options = useMemo(() => ALL_OPTIONS.filter((o) => !chosen.includes(o.value)), [chosen]);
  const nameOf = (code) => COUNTRIES.find((c) => c.code === code)?.name || code;
  return (
    <div className="mcf">
      {chosen.length > 0 && (
        <div className="mcf-chips">
          {chosen.map((code) => (
            <span key={code} className="mcf-chip">
              <span className={flagClass(code)} />
              {nameOf(code)}
              {!disabled && (
                <button type="button" className="mcf-x" aria-label={`Прибрати ${nameOf(code)}`} onClick={() => onChange(chosen.filter((c) => c !== code))}>&times;</button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <Select bare searchable value="" onChange={(v) => v && onChange([...chosen, v])} options={options} placeholder="Додати країну..." />
      )}
    </div>
  );
}
