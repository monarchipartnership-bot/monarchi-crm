import { useMemo, useRef, useState } from 'react';
import useDialogA11y from '../../../lib/useDialogA11y';
import { runOneOff } from '../../../lib/api/oneoff';
import { FIELD_LABELS, filledFields, missingFor } from '../../../lib/agents/agentRequirements';
import { ONEOFF, whereToFill } from '../../../lib/agents/teams';

// «Разове завдання» (owner, 2026-11-11): work that a person asks for any time, outside the teams that work by their schedules. Creatives and the report of a period go to the screens
// that already do them; the research and the strategy run at once and the result lands in «Готові матеріали».
//   data: fetchTeamsData result   view: teamsOf result   onNewCreative(): opens the form of a new creative task   onOpenReports(), onOpenMaterials(): switch the tab
//   onGoFill(section): opens that section of the card of the project
export default function OneOffDialog({ data, view, email, onClose, onNewCreative, onOpenReports, onOpenMaterials, onGoFill }) {
  const box = useRef(null);
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState({}); // role -> { ok, text }
  useDialogA11y(box, () => { if (!busy) onClose(); });
  const creativeTeam = view.teams.find((t) => t.key === 'creative');
  const have = useMemo(() => filledFields({ settings: data.settings, assets: data.assets, accounts: data.accounts }), [data]);

  async function run(item) {
    setBusy(item.role);
    try {
      const out = await runOneOff({ project: { id: data.project.id, name: data.project.name }, accounts: data.accounts, role: item.role, email });
      if (out?.status === 'failed') setDone((d) => ({ ...d, [item.role]: { ok: false, text: out.error || 'Агент не зміг виконати завдання.' } }));
      else setDone((d) => ({ ...d, [item.role]: { ok: true, text: 'Готово. Результат у «Готові матеріали» проєкту: він чекає вашого перегляду.' } }));
    } catch (e) { setDone((d) => ({ ...d, [item.role]: { ok: false, text: e?.message || 'Не вдалося виконати.' } })); } finally { setBusy(''); }
  }

  return (
    <div className="tm-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} className="tm-win" role="dialog" aria-modal="true" aria-labelledby="oo-title" tabIndex={-1}>
        <header className="tm-head"><h2 id="oo-title">Разове завдання</h2><button type="button" className="tm-x" onClick={onClose} disabled={!!busy} aria-label="Закрити">×</button></header>
        <div className="tm-body">
          <p className="tm-lead">Робота, яку можна замовити в будь-який момент, незалежно від команд, що працюють за розкладом. Результат з&apos;являється в «Історії проєкту» та «Готових матеріалах».</p>

          <ul className="oo-list">
            <li className="oo-row">
              <div><b>Креативи</b><small>{creativeTeam?.state !== 'none' ? 'Опишіть задачу: агенти заплановують, напишуть і намалюють, ви перевірите результат.' : 'Спершу запустіть команду «Креативи»: вона підключає клієнта до відділу креативів.'}</small></div>
              <button type="button" className="btn btn-p" disabled={creativeTeam?.state === 'none'} onClick={onNewCreative}>Створити завдання</button>
            </li>
            <li className="oo-row">
              <div><b>Звіт за період</b><small>Зібрати звіт за будь-який період у конструкторі звіту: поряд із тим, що агент робить щотижня й щомісяця.</small></div>
              <button type="button" className="btn" onClick={onOpenReports}>Відкрити конструктор</button>
            </li>
            {ONEOFF.map((item) => {
              const miss = missingFor([item.role], have);
              const stop = miss.required;
              const r = done[item.role];
              return (
                <li key={item.key} className="oo-row">
                  <div>
                    <b>{item.title}</b><small>{item.text}</small>
                    {stop.length > 0 && <small className="oo-warn">Спершу заповніть у картці: {stop.map((x) => FIELD_LABELS[x.key] || x.label).join(', ')}. <button type="button" className="oo-link" onClick={() => onGoFill(whereToFill(stop[0].key))}>Відкрити в картці</button></small>}
                    {r && <small className={r.ok ? 'oo-ok' : 'oo-warn'}>{r.text}{r.ok && <> <button type="button" className="oo-link" onClick={onOpenMaterials}>Відкрити «Готові матеріали»</button></>}</small>}
                  </div>
                  <button type="button" className="btn" disabled={!!busy || stop.length > 0} onClick={() => run(item)}>{busy === item.role ? 'Виконується…' : 'Запустити · до $0.05'}</button>
                </li>
              );
            })}
          </ul>
          {busy && <p className="tm-hint" role="status">Агент працює: це може тривати до кількох хвилин. Вікно не закривайте.</p>}
        </div>
      </div>
    </div>
  );
}
