import { useMemo, useRef, useState } from 'react';
import useDialogA11y from '../../../lib/useDialogA11y';
import { runOneOff } from '../../../lib/api/oneoff';
import { FIELD_LABELS, filledFields, missingFor } from '../../../lib/agents/agentRequirements';
import { ONEOFF, whereToFill } from '../../../lib/agents/teams';

// The kinds of a task (owner, 2026-11-12: «сначала выбирается тип задания, а потом направление команды»): the person first says WHAT KIND of task it is, then for which direction of the teams.
const KINDS = [
  { key: 'oneoff', title: 'Разове', text: 'Один раз, коли потрібно: агенти зроблять роботу й віддадуть результат.' },
  { key: 'seasonal', title: 'Сезонне', text: 'На період із датами початку й кінця: новорічні свята, розпродаж. Основне регулярне завдання на цей час можна призупинити.' },
  { key: 'regular', title: 'Регулярне', text: 'За розкладом: день і час задаєте ви, агенти працюють самі, поки завдання не зупинити.' },
];
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.key, k.title]));

// «Додаткове завдання»: work that a person asks for any time, next to the teams that work by their schedules. Step 1: the kind (one-off, seasonal, regular), step 2: the direction of the teams
// (creatives, the report of a period, the research and the strategy). A direction that has no such kind is not shown at all.
//   data: fetchTeamsData result   view: teamsOf result   onNewCreative({ seasonal }): the window of a new creative task   onNewRegular(): a new regular creative task (its form)
//   onOpenReports(), onOpenMaterials(): switch the tab   onGoFill(section): opens that section of the card of the project
export default function OneOffDialog({ data, view, email, onClose, onNewCreative, onNewRegular, onOpenReports, onOpenMaterials, onGoFill }) {
  const box = useRef(null);
  const [kind, setKind] = useState(null); // null = step 1
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState({}); // role -> { ok, text }
  useDialogA11y(box, () => { if (!busy) onClose(); });
  const creativeTeam = view.teams.find((t) => t.key === 'creative');
  const creativeOff = creativeTeam?.state === 'none';
  const have = useMemo(() => filledFields({ settings: data.settings, assets: data.assets, accounts: data.accounts }), [data]);

  async function run(item) {
    setBusy(item.role);
    try {
      const out = await runOneOff({ project: { id: data.project.id, name: data.project.name }, accounts: data.accounts, role: item.role, email });
      if (out?.status === 'failed') setDone((d) => ({ ...d, [item.role]: { ok: false, text: out.error || 'Агент не зміг виконати завдання.' } }));
      else setDone((d) => ({ ...d, [item.role]: { ok: true, text: 'Готово. Результат у вкладці «Результати AI команди»: він чекає вашого перегляду.' } }));
    } catch (e) { setDone((d) => ({ ...d, [item.role]: { ok: false, text: e?.message || 'Не вдалося виконати.' } })); } finally { setBusy(''); }
  }

  return (
    <div className="tm-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} className="tm-win" role="dialog" aria-modal="true" aria-labelledby="oo-title" tabIndex={-1}>
        <header className="tm-head"><h2 id="oo-title">Додаткове завдання</h2><button type="button" className="tm-x" onClick={onClose} disabled={!!busy} aria-label="Закрити">×</button></header>
        <div className="tm-body">
          {!kind ? (
            <>
              <p className="tm-lead">Крок 1 з 2. Який це тип завдання? Спершу оберіть тип, потім напрямок команди. Результат зʼявляється у вкладці «Результати AI команди».</p>
              <ul className="oo-list">
                {KINDS.map((k) => (
                  <li key={k.key} className="oo-row">
                    <div><b>{k.title}</b><small>{k.text}</small></div>
                    <button type="button" className={'btn' + (k.key === 'oneoff' ? ' btn-p' : '')} onClick={() => setKind(k.key)}>Обрати</button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className="oo-bar">
                <button type="button" className="btn oo-back" disabled={!!busy} onClick={() => setKind(null)}>← Назад</button>
                <span className="oo-step">Крок 2 з 2 · Тип завдання: <b>{KIND_LABEL[kind]}</b></span>
              </div>
              <ul className="oo-list">
                <li className="oo-row">
                  <div>
                    <b>Креативи</b>
                    <small>{creativeOff ? 'Команда «Креативи» ще не запущена: запустіть її, і тоді можна створювати завдання.' : kind === 'oneoff' ? 'Окреме завдання: агенти заплановують, напишуть і намалюють, ви перевірите результат.' : kind === 'seasonal' ? 'Завдання з датами початку й кінця. Основне регулярне завдання на цей час можна призупинити або залишити паралельно.' : 'Ще одне регулярне завдання команди: свої день, час, формат і назва. Працює поруч із основним.'}</small>
                  </div>
                  <button type="button" className={'btn' + (kind === 'oneoff' ? ' btn-p' : '')} disabled={creativeOff}
                    onClick={() => (kind === 'regular' ? onNewRegular() : onNewCreative({ seasonal: kind === 'seasonal' }))}>{kind === 'oneoff' ? 'Створити завдання' : kind === 'seasonal' ? 'Створити сезонне' : 'Створити регулярне'}</button>
                </li>
                {kind !== 'seasonal' && (
                <li className="oo-row">
                  <div>
                    <b>{kind === 'regular' ? 'Звіти' : 'Звіт за період'}</b>
                    <small>{kind === 'regular' ? 'Тижневий і місячний звіти складає агент звітів за розкладом: день і час налаштовуються в його вкладці.' : 'Зібрати звіт за будь-який період у конструкторі звіту: поряд із тим, що агент робить щотижня й щомісяця.'}</small>
                  </div>
                  <button type="button" className="btn" onClick={onOpenReports}>{kind === 'regular' ? 'Налаштувати розклад' : 'Відкрити конструктор'}</button>
                </li>
                )}
                {kind === 'oneoff' && ONEOFF.map((item) => {
                  const miss = missingFor([item.role], have);
                  const stop = miss.required;
                  const r = done[item.role];
                  return (
                    <li key={item.key} className="oo-row">
                      <div>
                        <b>{item.title}</b><small>{item.text}</small>
                        {stop.length > 0 && <small className="oo-warn">Спершу заповніть у картці: {stop.map((x) => FIELD_LABELS[x.key] || x.label).join(', ')}. <button type="button" className="oo-link" onClick={() => onGoFill(whereToFill(stop[0].key))}>Відкрити в картці</button></small>}
                        {r && <small className={r.ok ? 'oo-ok' : 'oo-warn'}>{r.text}{r.ok && <> <button type="button" className="oo-link" onClick={onOpenMaterials}>Відкрити «Результати AI команди»</button></>}</small>}
                      </div>
                      <button type="button" className="btn" disabled={!!busy || stop.length > 0} onClick={() => run(item)}>{busy === item.role ? 'Виконується…' : 'Запустити · до $0.05'}</button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {busy && <p className="tm-hint" role="status">Агент працює: це може тривати до кількох хвилин. Вікно не закривайте.</p>}
        </div>
      </div>
    </div>
  );
}
