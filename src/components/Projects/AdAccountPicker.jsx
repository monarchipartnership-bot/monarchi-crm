import { useEffect, useMemo, useState } from 'react';
import Select from '../common/Select';
import { listAdAccounts, lookupAdAccount, formatAccountId, statusInfo, platformInfo } from '../../lib/adAccounts';
import '../../styles/projectAccounts.css';

// Picks one ad account for a given platform: from the list the integration can
// see (the usual case), or by typing an ID and checking it. `usedKeys` is a Set
// of "platform:id" for accounts already linked to some project, which are left
// out of the list. `onChange(account | null)` — account is the plain object from
// lib/adAccounts.js.
export default function AdAccountPicker({ platform, value, onChange, usedKeys, disabled }) {
  const [list, setList] = useState(null);
  const [listError, setListError] = useState('');
  const [manual, setManual] = useState(false);
  const [manualId, setManualId] = useState('');
  const [checking, setChecking] = useState(false);
  const [manualError, setManualError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setList(null);
    setListError('');
    listAdAccounts(platform)
      .then((rows) => { if (!cancelled) setList(rows); })
      .catch((e) => { if (!cancelled) { setListError(e.message || 'Не вдалося завантажити список.'); setManual(true); } });
    return () => { cancelled = true; };
  }, [platform]);

  const options = useMemo(() => (list || [])
    .filter((a) => !usedKeys?.has(`${platform}:${a.id}`) || a.id === value?.id)
    .map((a) => ({ value: a.id, label: `${a.name || 'Без назви'} · ${formatAccountId(platform, a.id)}${a.status !== 'active' ? ` · ${statusInfo(a.status).label}` : ''}` })), [list, usedKeys, platform, value]);

  function pickFromList(id) {
    const acc = (list || []).find((a) => a.id === id) || null;
    onChange(acc);
  }

  async function checkManual() {
    setChecking(true);
    setManualError('');
    try {
      const acc = await lookupAdAccount(platform, manualId);
      if (usedKeys?.has(`${platform}:${acc.id}`)) { setManualError('Цей кабінет уже привʼязано до іншого проєкту.'); return; }
      onChange(acc);
    } catch (e) {
      setManualError(e.message || 'Не вдалося перевірити кабінет.');
    } finally {
      setChecking(false);
    }
  }

  const info = platformInfo(platform);

  return (
    <div className="pacc-picker">
      {!manual ? (
        <>
          <Select
            value={value?.id || ''}
            onChange={pickFromList}
            options={options}
            placeholder={list == null ? 'Завантаження кабінетів…' : options.length ? `Оберіть кабінет ${info.label}` : 'Вільних кабінетів немає'}
            searchable
            disabled={disabled || list == null}
          />
          <button type="button" className="pacc-link" onClick={() => setManual(true)}>Ввести ID вручну</button>
        </>
      ) : (
        <>
          <div className="pacc-manual">
            <input
              type="text" value={manualId} disabled={disabled}
              onChange={(e) => setManualId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); checkManual(); } }}
              placeholder={platform === 'google' ? '123-456-7890' : 'act_1234567890 або тільки цифри'}
            />
            <button type="button" className="btn" onClick={checkManual} disabled={checking || !manualId.trim()}>{checking ? '...' : 'Перевірити'}</button>
          </div>
          {manualError && <div className="pacc-err">{manualError}</div>}
          {listError && <div className="pacc-hint">Список не завантажився: {listError}</div>}
          {!listError && <button type="button" className="pacc-link" onClick={() => setManual(false)}>Обрати зі списку</button>}
        </>
      )}

      {value && (
        <div className="pacc-found">
          <span className="pacc-badge pacc-badge--sm" style={{ background: info.gradient }}>{info.mark}</span>
          <div className="pacc-found-body">
            <div className="pacc-found-name">{value.name || 'Без назви'}</div>
            <div className="pacc-found-meta">
              {formatAccountId(platform, value.id)}
              {value.currency ? ` · ${value.currency}` : ''}
              {value.timezone ? ` · ${value.timezone}` : ''}
            </div>
          </div>
          <span className={'pacc-pill pacc-pill--' + statusInfo(value.status).tone}>{statusInfo(value.status).label}</span>
        </div>
      )}
    </div>
  );
}
