import { useState } from 'react';
import AutoResizeTextarea from './AutoResizeTextarea';
import TagInput from '../Automation/TagInput';
import { DUE_STATUS_ICONS } from '../../lib/dueStatusIcons';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import { colorForTag } from '../../lib/tagColors';
import { iconForTag } from '../../lib/tagIcons';

const PRIORITY_OPTIONS = [
  { value: '', label: 'Без пріоритету' },
  { value: 'low', label: 'Низький' },
  { value: 'medium', label: 'Середній' },
  { value: 'high', label: 'Високий' },
];

// The tag field starts collapsed — a small icon+name chip (or a bare "+ Тег"
// affordance when unset) — and only expands into the full TagInput picker
// on click, collapsing again once a tag is actually chosen. Keeps a filled
// item compact instead of always showing the full picker + suggestion row.
function TagField({ tag, onChange, suggestions, onNewTag }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button type="button" className="task-tag-compact" onClick={() => setEditing(true)}>
        <span
          className={'task-tag-compact-icon' + (tag ? '' : ' none')}
          style={tag ? { background: colorForTag(tag) } : undefined}
          dangerouslySetInnerHTML={{ __html: iconForTag(tag) }}
        />
        <span className="task-tag-compact-label">{tag || 'Додати тег'}</span>
      </button>
    );
  }

  return (
    <div className="wk-field-box wk-field-box-tag">
      <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.tag }} />
      <div className="wk-field-body">
        <label>Тег</label>
        <TagInput
          tags={tag ? [tag] : []}
          onChange={(tags) => {
            const next = tags[tags.length - 1] || '';
            onChange(next);
            if (next) setEditing(false);
          }}
          suggestions={suggestions}
          onNewTag={onNewTag}
        />
      </div>
    </div>
  );
}

// Auto-numbered list of free-text items with add/remove — used for "Виконано
// за день" and "Плани на завтра" (Sales daily/weekly/monthly reports) and the
// Projects ad-report form. `withTags`/`showDoneIcon`/`withPriority`/
// `onCarryForward`/`iconByTag` are opt-in extras used only by Sales Daily
// and Weekly Report — every other caller leaves them unset and renders
// exactly as before. The tag/priority fields reuse Automation's own
// `.wk-field-box` (icon + label + control) styling so a report item looks
// like an Automation task. `iconByTag` (Weekly Report only) swaps the
// leading number/checkmark for Automation's colored `.daily-task-icon`
// (by `item.tag`) — Daily Report keeps its own showDoneIcon/number look.
// `onNewTag(tag)` fires when someone commits a tag that isn't already in
// `tagSuggestions` — the caller persists it (see lib/api/customTags.js) so
// it becomes a one-click suggestion for everyone from then on.
export default function EditableItemList({
  items, onChange, onAdd, onRemove, emptyHint, addLabel, capturing,
  withTags = false, tagSuggestions, onNewTag, showDoneIcon = false, withPriority = false, onCarryForward, iconByTag = false,
}) {
  return (
    <>
      <div className="items">
        {items.map((item, i) => (
          <div className="item-box numbered" key={item.id}>
            {iconByTag ? (
              <span
                className={'daily-task-icon' + (item.tag ? '' : ' none')}
                style={item.tag ? { background: colorForTag(item.tag) } : undefined}
                dangerouslySetInnerHTML={{ __html: iconForTag(item.tag) }}
              />
            ) : showDoneIcon ? (
              <span className="dash-task-done-ic" dangerouslySetInnerHTML={{ __html: DUE_STATUS_ICONS.done }} />
            ) : (
              <div className="item-num">{i + 1}</div>
            )}
            {!capturing && (
              <button type="button" className="del-btn" title="Видалити" onClick={() => onRemove(item.id)}>&times;</button>
            )}
            <div className="item-box-body">
              <AutoResizeTextarea
                value={item.text}
                onChange={(text) => onChange(item.id, { text })}
                placeholder="Введіть текст..."
                capturing={capturing}
              />
              {(withTags || withPriority || onCarryForward) && !capturing && (
                <div className="wk-row-fields">
                  {withTags && (
                    <TagField
                      tag={item.tag}
                      onChange={(tag) => onChange(item.id, { tag })}
                      suggestions={tagSuggestions}
                      onNewTag={onNewTag}
                    />
                  )}
                  {withPriority && (
                    <div className="wk-field-box">
                      <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.priority }} />
                      <div className="wk-field-body">
                        <label>Пріоритет</label>
                        <select value={item.priority || ''} onChange={(e) => onChange(item.id, { priority: e.target.value })}>
                          {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                  {onCarryForward && (
                    <button type="button" className="btn btn-p wk-field-submit" onClick={() => onCarryForward(item)}>
                      &#8594; Перенести на завтра
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {!items.length && <div className="empty-hint">{emptyHint}</div>}
      {!capturing && (
        <button type="button" className="add-btn" onClick={onAdd}>+ {addLabel}</button>
      )}
    </>
  );
}
