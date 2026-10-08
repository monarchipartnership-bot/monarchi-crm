import { useCallback, useEffect, useMemo, useState } from 'react';
import AdAccountPicker from './AdAccountPicker';
import Select from '../common/Select';
import ActionIcon from '../common/ActionIcon';
import { PLATFORM_ICONS, PLATFORM_SYMBOL } from '../../lib/pageIcons';
import { AD_PLATFORMS, platformInfo, statusInfo, formatAccountId, formatMoney, fetchAccountInsights, lookupAdAccount } from '../../lib/adAccounts';
import { fetchAllProjectAccounts, fetchProjectAccounts, addProjectAccount, refreshProjectAccount, removeProjectAccount } from '../../lib/api/projectAccounts';
import { useAuth } from '../../contexts/AuthContext';
import '../../styles/projectAccounts.css';
import AccountCampaigns from './AccountCampaigns';

const PERIODS = [{ value: 'last_7d', label: '7 днів' }, { value: 'last_30d', label: '30 днів' }];

function fmtNum(v) {
  return v == null ? '—' : Number(v).toLocaleString('uk-UA', { maximumFractionDigits: 2 });
}

// "Рекламні кабінети" block on a project's Overview: every linked account, one
// platform at a time (switcher on top), with the account's own facts and live
// numbers pulled from the platform. Also where an account is connected later
// (or unlinked). `onAccountsChange(accounts)` lets the page react (e.g. the
// report tabs default to the first linked platform).
export default function ProjectAccountsPanel({ projectId, services, onAddService, onAccountsChange }) {
  const { email } = useAuth();
  const [accounts, setAccounts] = useState(null);
  const [active, setActive] = useState(null);
  const [adding, setAdding] = useState(false);
  const [addPlatform, setAddPlatform] = useState('google');
  const [picked, setPicked] = useState(null);
  const [usedKeys, setUsedKeys] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const [period, setPeriod] = useState('last_7d');
  const [insights, setInsights] = useState({ state: 'idle' });

  const reload = useCallback(async () => {
    const rows = await fetchProjectAccounts(projectId);
    setAccounts(rows);
    setActive((cur) => (cur && rows.some((r) => r.platform === cur) ? cur : rows[0]?.platform || null));
    onAccountsChange?.(rows);
  }, [projectId, onAccountsChange]);

  useEffect(() => { reload(); }, [reload]);

  const current = useMemo(() => (accounts || []).find((a) => a.platform === active) || null, [accounts, active]);
  const freePlatforms = AD_PLATFORMS.filter((p) => !(accounts || []).some((a) => a.platform === p.key));

  // Live numbers for the selected account and period.
  useEffect(() => {
    if (!current) { setInsights({ state: 'idle' }); return undefined; }
    let cancelled = false;
    setInsights({ state: 'loading' });
    fetchAccountInsights(current.platform, current.account_id, period)
      .then((data) => { if (!cancelled) setInsights({ state: 'ok', data }); })
      .catch((e) => { if (!cancelled) setInsights({ state: 'error', error: e.message || 'Не вдалося завантажити.' }); });
    return () => { cancelled = true; };
  }, [current?.id, current?.platform, current?.account_id, period]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startAdding() {
    const all = await fetchAllProjectAccounts();
    setUsedKeys(new Set(all.map((a) => `${a.platform}:${a.account_id}`)));
    setAddPlatform(freePlatforms[0]?.key || 'google');
    setPicked(null);
    setMsg('');
    setAdding(true);
  }

  async function saveAdded() {
    if (!picked) return;
    setBusy(true);
    setMsg('');
    try {
      await addProjectAccount({ projectId, platform: addPlatform, account: picked, createdBy: email });
      const service = platformInfo(addPlatform).service;
      if (service && !(services || []).includes(service)) await onAddService?.(service);
      setAdding(false);
      setActive(addPlatform);
      await reload();
    } catch (e) {
      setMsg(e.message || 'Не вдалося підключити кабінет.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshCurrent() {
    if (!current) return;
    setBusy(true);
    setMsg('');
    try {
      const fresh = await lookupAdAccount(current.platform, current.account_id);
      await refreshProjectAccount(current.id, fresh);
      await reload();
      setMsg('Дані кабінету оновлено.');
    } catch (e) {
      setMsg(e.message || 'Не вдалося оновити.');
    } finally {
      setBusy(false);
    }
  }

  async function removeCurrent() {
    if (!current) return;
    setBusy(true);
    try {
      await removeProjectAccount(current.id);
      setConfirmRemove(false);
      await reload();
    } catch (e) {
      setMsg(e.message || 'Не вдалося відвʼязати.');
    } finally {
      setBusy(false);
    }
  }

  if (accounts == null) return null;

  const info = current ? platformInfo(current.platform) : null;
  const st = current ? statusInfo(current.account_status) : null;
  const d = insights.data;

  return (
    <section className="report-section pacc-panel pw-card">
      <div className="pacc-panel-head">
        <div className="stitle">Рекламні кабінети</div>
        <div className="pacc-panel-actions">
          {accounts.length > 1 && (
            <div className="pw-switch" role="tablist" aria-label="Платформа кабінету">
              {accounts.map((a) => (
                <button key={a.id} type="button" role="tab" aria-selected={a.platform === active} className={'pw-btn' + (a.platform === active ? ' pw-btn--selected' : '')} onClick={() => { setActive(a.platform); setConfirmRemove(false); setMsg(''); }}>
                  <img src={PLATFORM_ICONS[PLATFORM_SYMBOL[a.platform]]?.src} alt="" width="23" height="23" draggable="false" />
                  {platformInfo(a.platform).label}
                </button>
              ))}
            </div>
          )}
          {freePlatforms.length > 0 && !adding && (
            <button type="button" className="pw-btn" onClick={startAdding}><ActionIcon name="create" size={18} /> Підключити кабінет</button>
          )}
        </div>
      </div>

      {adding && (
        <div className="pacc-add-box">
          <div className="pacc-row-head">
            <div className="pacc-row-platform">
              <Select value={addPlatform} onChange={(v) => { setAddPlatform(v); setPicked(null); }} options={freePlatforms.map((p) => ({ value: p.key, label: p.label }))} />
            </div>
          </div>
          <AdAccountPicker platform={addPlatform} value={picked} onChange={setPicked} usedKeys={usedKeys} />
          {msg && <div className="pacc-err">{msg}</div>}
          <div className="pacc-add-actions">
            <button type="button" className="pw-btn pw-btn--primary" onClick={saveAdded} disabled={!picked || busy}>{busy ? '...' : 'Підключити'}</button>
            <button type="button" className="pw-btn" onClick={() => setAdding(false)}>Скасувати</button>
          </div>
        </div>
      )}

      {!current && !adding && (
        <div className="pacc-empty">
          До проєкту ще не підключено рекламного кабінету. {freePlatforms.length > 0 ? 'Підключіть Meta Ads або Google Ads, щоб бачити цифри кабінету тут.' : ''}
        </div>
      )}

      {current && (
        <div className="pacc-card">
          <div className="pacc-card-top">
            <img className="pacc-platform-img" src={PLATFORM_ICONS[PLATFORM_SYMBOL[current.platform]]?.src} alt="" width="40" height="40" draggable="false" />
            <div className="pacc-card-title">
              <div className="pacc-card-name">{current.account_name || 'Без назви'}</div>
              <div className="pacc-card-sub">{info.label} · {formatAccountId(current.platform, current.account_id)}</div>
            </div>
            <span className={'pw-chip pw-chip--' + (st.tone === 'ok' ? 'ok' : st.tone === 'bad' ? 'bad' : st.tone === 'warn' ? 'warn' : 'muted')}>{st.label}</span>
          </div>
          <div className="pacc-facts">
            <div><span>Валюта</span><b>{current.currency || '—'}</b></div>
            <div><span>Часовий пояс</span><b>{current.timezone || '—'}</b></div>
            <div><span>Оновлено</span><b>{current.synced_at ? new Date(current.synced_at).toLocaleString('uk-UA') : '—'}</b></div>
          </div>

          <div className="pacc-metrics-head">
            <div className="pacc-metrics-title">Показники кабінету</div>
            <div className="pacc-period">
              {PERIODS.map((p) => (
                <button key={p.value} type="button" className={'pacc-period-btn' + (period === p.value ? ' on' : '')} onClick={() => setPeriod(p.value)}>{p.label}</button>
              ))}
            </div>
          </div>
          {insights.state === 'loading' && <div className="pacc-hint">Завантажуємо цифри з кабінету…</div>}
          {insights.state === 'error' && <div className="pacc-err">Не вдалося завантажити цифри: {insights.error}</div>}
          {insights.state === 'ok' && !d && <div className="pacc-hint">За цей період даних немає.</div>}
          {insights.state === 'ok' && d && (
            <div className="pacc-metrics">
              <div className="pacc-metric"><span>Витрати</span><b>{formatMoney(d.spend, current.currency)}</b></div>
              <div className="pacc-metric"><span>Покази</span><b>{fmtNum(d.impressions)}</b></div>
              <div className="pacc-metric"><span>Кліки</span><b>{fmtNum(d.clicks)}</b></div>
              <div className="pacc-metric"><span>CTR</span><b>{d.ctr_pct == null ? '—' : d.ctr_pct + '%'}</b></div>
              <div className="pacc-metric"><span>CPC</span><b>{formatMoney(d.cpc, current.currency)}</b></div>
              <div className="pacc-metric"><span>{d.resultsLabel}</span><b>{fmtNum(d.results)}</b></div>
              <div className="pacc-metric"><span>Виручка</span><b>{formatMoney(d.revenue, current.currency)}</b></div>
              <div className="pacc-metric"><span>ROAS</span><b>{d.roas == null ? '—' : d.roas + 'x'}</b></div>
            </div>
          )}

          <AccountCampaigns account={current} period={period} />

          <div className="pacc-card-actions">
            <button type="button" className="pw-btn" onClick={refreshCurrent} disabled={busy}><ActionIcon name="regenerate" size={18} /> Оновити дані кабінету</button>
            {!confirmRemove && (
              <button type="button" className="pw-btn pw-btn--danger-quiet" onClick={() => setConfirmRemove(true)}>Відвʼязати кабінет</button>
            )}
          </div>
          {confirmRemove && (
            <div className="pw-notice pw-notice--warn" role="alert">
              <span>Відвʼязати цей кабінет від проєкту? Звіти збережуться.</span>
              <span className="pw-notice-actions">
                <button type="button" className="pw-btn pw-btn--danger" onClick={removeCurrent} disabled={busy}>Так, відвʼязати</button>
                <button type="button" className="pw-btn" onClick={() => setConfirmRemove(false)}>Ні</button>
              </span>
            </div>
          )}
          {msg && !adding && <div className="pacc-hint">{msg}</div>}
        </div>
      )}
    </section>
  );
}
