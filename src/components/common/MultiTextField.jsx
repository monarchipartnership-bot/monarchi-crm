import '../../styles/multiTextField.css';

// A field where the user can add any number of free-text entries (e.g.
// several website URLs, several social-media links) — plain `text[]`
// in/out, no chip/tag styling since these are full values to read, not
// short labels.
export default function MultiTextField({ values = [], onChange, placeholder, disabled }) {
  const rows = values.length ? values : [''];

  function update(i, v) {
    const next = [...rows];
    next[i] = v;
    onChange(next);
  }

  function remove(i) {
    onChange(values.filter((_, idx) => idx !== i));
  }

  return (
    <div className="multi-text-field">
      {rows.map((v, i) => (
        <div className="multi-text-field-row" key={i}>
          <input type="text" value={v} placeholder={placeholder} disabled={disabled} onChange={(e) => update(i, e.target.value)} />
          {values.length > 0 && !disabled && (
            <button type="button" className="multi-text-field-remove" onClick={() => remove(i)} aria-label="Видалити">&times;</button>
          )}
        </div>
      ))}
      {!disabled && <button type="button" className="multi-text-field-add" onClick={() => onChange([...values, ''])}>+ Додати</button>}
    </div>
  );
}
