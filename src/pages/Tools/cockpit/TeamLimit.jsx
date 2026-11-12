import { useCallback, useEffect, useState } from 'react';
import { kickQueue } from '../../../lib/api/agents';
import { updateCampaign } from '../../../lib/api/campaigns';
import { fetchCampaignControl, saveCampaignMoney } from '../../../lib/api/campaignControl';
import { Spinner } from './parts';
import '../../../styles/stepDetails.css';

// «Загальні налаштування» of the creative team (owner, 2026-11-12): only what is the same for ALL tasks of the client: the limit of money of the whole team and the pause of every task. Everything
// else (the style, the formats, the number of ideas, the agents, the limit of pictures) is set in the settings of each task.
//   campaign: the ag_campaigns row   notify(text, isError)   onChanged(): the lists are read again
export default function TeamLimit({ campaign, notify, onChanged }) {
  const [ctl, setCtl] = useState(null);
  const [money, setMoney] = useState({ cap: '', step: '2' });
  const [busy, setBusy] = useState('');
  const paused = campaign.status === 'paused';
  const load = useCallback(async () => {
    const c = await fetchCampaignControl(campaign.id);
    setCtl(c); setMoney({ cap: c.spendCapUsd == null ? '' : String(c.spendCapUsd), step: String(c.notifyStepUsd ?? 2) });
  }, [campaign.id]);
  useEffect(() => { load().catch((e) => notify?.(e?.message || 'Не вдалося завантажити ліміт.', true)); }, [load, notify]);
  const changed = ctl && (money.cap !== (ctl.spendCapUsd == null ? '' : String(ctl.spendCapUsd)) || money.step !== String(ctl.notifyStepUsd ?? 2));

  async function saveMoney() {
    setBusy('money');
    try { await saveCampaignMoney(campaign.id, { capUsd: money.cap, stepUsd: money.step }); await load(); notify?.('Ліміт команди збережено.'); } catch (e) { notify?.(e?.message || 'Не вдалося зберегти.', true); } finally { setBusy(''); }
  }
  async function togglePause() {
    setBusy('pause');
    try {
      await updateCampaign(campaign.id, { status: paused ? 'active' : 'paused' });
      if (paused) kickQueue().catch(() => {});
      notify?.(paused ? 'Команду відновлено: усі задачі працюють за розкладом.' : 'Команду зупинено: жодна задача не запускається.');
      await onChanged?.();
    } catch (e) { notify?.(e?.message || 'Не вдалося змінити стан.', true); } finally { setBusy(''); }
  }

  return (
    <>
      <section className="ckp-box" aria-label="Ліміт команди">
        <div className="ckp-sec-h"><h3>Загальний ліміт команди</h3><span className="ckp-chip">{ctl ? (ctl.spendCapUsd == null ? 'без ліміту' : `$${ctl.spendCapUsd}`) : '…'}</span></div>
        <p className="sd-note">Скільки команда може витратити загалом на всі свої задачі. Досягнувши ліміту, вона не запускає нових платних кроків і надсилає сповіщення. Ліміт на картинки для окремої задачі задається в налаштуваннях цієї задачі.</p>
        <div className="sd-limit-row">
          <label className="sd-limit">Ліміт команди, $<input type="text" inputMode="decimal" value={money.cap} onChange={(e) => setMoney((m) => ({ ...m, cap: e.target.value }))} placeholder="без ліміту" aria-label="Загальний ліміт команди, $" /></label>
          <label className="sd-limit">Сповіщати кожні, $<input type="text" inputMode="decimal" value={money.step} onChange={(e) => setMoney((m) => ({ ...m, step: e.target.value }))} aria-label="Сповіщати кожні, $" /></label>
          <button type="button" className="ckp-btn" disabled={!ctl || !changed || !!busy} onClick={saveMoney}>{busy === 'money' ? <Spinner /> : null}Зберегти</button>
        </div>
      </section>
      <section className="ckp-box" aria-label="Пауза команди">
        <div className="ckp-sec-h"><h3>Пауза всіх задач</h3><span className={'ckp-chip ' + (paused ? '' : 'is-work')}>{paused ? 'на паузі' : 'працює'}</span></div>
        <p className="sd-note">{paused ? 'Усі задачі команди стоять: регулярні не запускаються за розкладом, а нові стають чернетками.' : 'Зупинка діє на всі задачі команди одразу: регулярні не запускатимуться, доки ви не відновите команду. Окрему задачу можна вимкнути в її картці.'}</p>
        <div><button type="button" className="ckp-btn" disabled={!!busy} onClick={togglePause}>{busy === 'pause' ? <Spinner /> : null}{paused ? 'Відновити команду' : 'Зупинити команду'}</button></div>
      </section>
    </>
  );
}
