import GroupRow from './GroupCards';

import { HubTitle } from '../hubIcons';
// The groups as a separate item before the report: the boxes, and under the pressed one «Вибрати» (its campaigns go into the report),
// «Редагувати», «Видалити». «Усі кампанії» = no group.
export default function GroupsStrip({ groups, known, activeId, onPick, onEdit, onDelete, onCreate, hint, hideAll = false }) {
  return (
    <div className="cg-strip">
      <div className="cg-strip-head">
        <HubTitle icon="layers" as="h3" className="cg-strip-title">Групи кампаній</HubTitle>
        <span className="pacc-hint">{hint || 'Оберіть групу, і в звіт підтягнуться лише її кампанії.'}</span>
      </div>
      {groups.length === 0 && <div className="cg-empty">Груп ще немає. Створіть групу з кампаній цього проєкту.</div>}
      <GroupRow groups={groups} known={known} activeId={activeId} onPick={onPick} onEdit={onEdit} onDelete={onDelete} onCreate={onCreate} allCard={!hideAll} />
    </div>
  );
}
