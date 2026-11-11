import { useState } from 'react';
import { updateCampaign } from '../../../lib/api/campaigns';
import { creativeAutoOf } from '../../../lib/agents/creativeTeam';
import '../../../styles/stepDetails.css';

// «Картинки» of the settings of an operation of creatives (owner, 2026-11-12): the pictures are generated at once, within a limit, so the person only approves the ready
// creatives; the person is asked only when something does not fit the limit. Saved in campaign.config.creative (autoGenerate, maxUsd).
//   campaign: the ag_campaigns row   notify(text, isError)   onChanged(): the list is read again
export default function PicturesSetting({ campaign, notify, onChanged }) {
  const now = creativeAutoOf(campaign);
  const [auto, setAuto] = useState(now.auto);
  const [max, setMax] = useState(now.maxUsd ? String(now.maxUsd) : '3');
  const [busy, setBusy] = useState(false);
  const limit = Number(String(max).replace(',', '.'));
  const changed = auto !== now.auto || (auto && limit !== (now.maxUsd || 3));
  async function save() {
    if (auto && !(limit > 0)) { notify?.('Ліміт — сума в доларах, наприклад 3.', true); return; }
    setBusy(true);
    try {
      await updateCampaign(campaign.id, { config: { ...(campaign.config || {}), creative: { ...(campaign.config?.creative || {}), autoGenerate: auto, maxUsd: auto ? limit : null } } });
      notify?.(auto ? `Картинки генеруються автоматично, ліміт $${limit} на завдання.` : 'Автоматичну генерацію вимкнено: картинки чекатимуть вашого підтвердження.');
      await onChanged?.();
    } catch (e) { notify?.(e?.message || 'Не вдалося зберегти.', true); } finally { setBusy(false); }
  }
  return (
    <section className="ckp-box sd-pics" aria-label="Картинки">
      <div className="ckp-sec-h"><h3>Картинки</h3><span className={'ckp-chip ' + (now.auto ? 'is-work' : 'is-grey')}>{now.auto ? 'автоматично' : 'з підтвердженням'}</span></div>
      <p className="sd-note">Агенти доводять завдання до готових креативів, а ви лише затверджуєте або повертаєте їх. Якщо вартість не вміщується в ліміт, залишок чекає вашого підтвердження.</p>
      <label className="sd-check"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /><span>Генерувати картинки автоматично</span></label>
      {auto && <label className="sd-limit">Ліміт на одне завдання, $<input type="text" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} aria-label="Ліміт на картинки одного завдання, $" /><small>Картинка Higgsfield коштує приблизно $0.2.</small></label>}
      <div><button type="button" className="ckp-btn" disabled={busy || !changed} onClick={save}>{busy ? 'Зберігаємо…' : 'Зберегти'}</button></div>
    </section>
  );
}
