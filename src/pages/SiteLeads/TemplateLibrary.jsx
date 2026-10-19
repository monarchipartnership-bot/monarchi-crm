import { useEffect, useMemo, useRef, useState } from 'react';
import ActionIcon from '../../components/common/ActionIcon';
import { useConfirm } from '../../components/common/ConfirmDialog';
import { useAuth } from '../../contexts/AuthContext';
import { createTemplate, deleteTemplate, fetchTemplates, updateTemplate } from '../../lib/api/siteLeads';
import { DEFAULT_TEMPLATE, PLACEHOLDERS, renderMessage, SAMPLE_LEAD } from '../../lib/siteLeadMessage';

const html = (body, ping = '') => renderMessage(body, { ...SAMPLE_LEAD, time: '19.10, 10:30', returning: '', ping });

// The library of message forms: small cards with a miniature of each, «+ Додати шаблон», and under the card you pressed two buttons:
// «Вибрати» (this form is sent to the chat; its frame turns plum) and «Редагувати» (the editor with a live preview opens below).
// `settings.message_template` always holds the BODY of the chosen form, so the server needs no lookup.
export default function TemplateLibrary({ settings, patch, notify, busy, onTest, canTest, ping }) {
  const { email } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const [templates, setTemplates] = useState([]);
  const [focus, setFocus] = useState(null); // the card pressed (id | 'std')
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', body: '' });
  const [working, setWorking] = useState(false);
  const ref = useRef(null);

  useEffect(() => { fetchTemplates().then(setTemplates); }, []);
  const cards = useMemo(() => [{ id: 'std', name: 'Стандартний', body: DEFAULT_TEMPLATE, builtin: true }, ...templates], [templates]);
  const activeId = settings.active_template_id ?? 'std';
  const current = cards.find((c) => c.id === focus) || null;
  const dirty = editing && current && !current.builtin && (draft.name !== current.name || draft.body !== current.body);

  async function guard(fn) { setWorking(true); try { await fn(); } catch (e) { notify(e.message || 'Не вдалося виконати.', true); } finally { setWorking(false); } }
  const choose = (c) => patch({ active_template_id: c.builtin ? null : c.id, message_template: c.builtin ? null : c.body }, `Шаблон «${c.name}» вибрано: нові заявки надходитимуть у цій формі.`);
  const open = (c) => { setFocus(c.id); setEditing(false); };
  const add = () => guard(async () => {
    const t = await createTemplate({ name: 'Новий шаблон', body: DEFAULT_TEMPLATE }, email);
    setTemplates((all) => [...all, t]); setFocus(t.id); setDraft({ name: t.name, body: t.body }); setEditing(true);
    notify('Шаблон додано: відредагуйте його нижче.');
  });
  const edit = (c) => {
    if (c.builtin) { // the standard form is not edited itself: its copy is
      guard(async () => {
        const t = await createTemplate({ name: 'Власний шаблон', body: DEFAULT_TEMPLATE }, email);
        setTemplates((all) => [...all, t]); setFocus(t.id); setDraft({ name: t.name, body: t.body }); setEditing(true);
        notify('Стандартний шаблон не змінюється: створено його копію для редагування.');
      });
      return;
    }
    setDraft({ name: c.name, body: c.body }); setEditing(true);
  };
  const save = () => guard(async () => {
    const t = await updateTemplate(current.id, draft);
    setTemplates((all) => all.map((x) => (x.id === t.id ? t : x)));
    if (activeId === t.id) await patch({ message_template: t.body });
    notify('Шаблон збережено.');
  });
  const remove = async (c) => {
    if (!(await confirm({ title: `Видалити шаблон «${c.name}»?`, body: activeId === c.id ? 'Він зараз вибраний: після видалення нові заявки йдуть у стандартній формі.' : 'Цю дію не можна скасувати.', confirmLabel: 'Видалити', danger: true }))) return;
    guard(async () => {
      if (activeId === c.id) await patch({ active_template_id: null, message_template: null });
      await deleteTemplate(c.id);
      setTemplates((all) => all.filter((x) => x.id !== c.id));
      if (focus === c.id) { setFocus(null); setEditing(false); }
      notify('Шаблон видалено.');
    });
  };
  const insert = (key) => {
    const el = ref.current;
    const at = el ? el.selectionStart : draft.body.length;
    setDraft((d) => ({ ...d, body: d.body.slice(0, at) + `{${key}}` + d.body.slice(el ? el.selectionEnd : at) }));
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(at + key.length + 2, at + key.length + 2); } });
  };

  return (
    <section className="smm-block">
      <h3>3. Шаблони повідомлення в чат</h3>
      <p className="smm-muted">Збережіть кілька форм повідомлення й виберіть, яка працює зараз: її рамка підсвічена фіолетовим. Натисніть на шаблон, щоб вибрати його або відредагувати.</p>

      <div className="smm-tplrow" role="list">
        {cards.map((c) => {
          const active = c.id === activeId;
          return (
            <div key={c.id} className="smm-tplcol" role="listitem">
              <button type="button" className={'smm-tplcard' + (active ? ' is-active' : '') + (focus === c.id ? ' is-focus' : '')} onClick={() => open(c)} aria-pressed={focus === c.id} aria-label={`Шаблон ${c.name}${active ? ', вибраний' : ''}`}>
                <span className="smm-tplcard-head"><b>{c.name}</b>{active && <em>Вибрано</em>}</span>
                <span className="smm-tplmini" dangerouslySetInnerHTML={{ __html: html(c.body) }} />
              </button>
              {focus === c.id && (
                <div className="smm-tplactions">
                  <button type="button" className="smm-btn smm-btn--primary" disabled={active || busy} onClick={() => choose(c)}>{active ? 'Вибрано' : 'Вибрати'}</button>
                  <button type="button" className="smm-btn" disabled={working} onClick={() => edit(c)}>Редагувати</button>
                  {!c.builtin && <button type="button" className="smm-btn smm-btn--danger" disabled={working} onClick={() => remove(c)}>Видалити</button>}
                </div>
              )}
            </div>
          );
        })}
        <div className="smm-tplcol">
          <button type="button" className="smm-tplcard smm-tpladd" onClick={add} disabled={working}><span aria-hidden="true">+</span>Додати шаблон</button>
        </div>
      </div>

      {editing && current && !current.builtin && (
        <div className="smm-tpleditor">
          <div className="smm-field"><label htmlFor="tpl-name">Назва шаблону</label><input id="tpl-name" type="text" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} maxLength={60} /></div>
          <div className="smm-tplgrid">
            <div className="smm-field">
              <label htmlFor="tpl">Текст</label>
              <textarea id="tpl" ref={ref} className="smm-code" rows={12} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
              <div className="smm-chips" role="group" aria-label="Вставити поле">
                {PLACEHOLDERS.map((p) => <button key={p.key} type="button" className="smm-chipbtn" onClick={() => insert(p.key)} title={`{${p.key}}`}>{p.label}</button>)}
              </div>
              <span className="smm-hint">Рядок, у якому поле порожнє, зникає разом з підписом. З розмітки працюють <code>&lt;b&gt;</code> <code>&lt;i&gt;</code> <code>&lt;u&gt;</code> <code>&lt;s&gt;</code> <code>&lt;code&gt;</code>.</span>
            </div>
            <div className="smm-field">
              <label>Так це виглядатиме в Telegram</label>
              <div className="smm-bubble" dangerouslySetInnerHTML={{ __html: html(draft.body, ping) }} />
              {settings.show_button !== false && <div className="smm-bubble-btn">Відкрити в CRM</div>}
            </div>
          </div>
          <div className="smm-form-foot">
            <button type="button" className="smm-btn smm-btn--primary" disabled={!dirty || working} onClick={save}><ActionIcon name="save" size={18} />Зберегти</button>
            <button type="button" className="smm-btn" disabled={!canTest || working} onClick={() => onTest(draft.body)}>Надіслати тест у чат</button>
            <button type="button" className="smm-btn" onClick={() => setEditing(false)}>Закрити редактор</button>
            {dirty && <span className="smm-muted">Є незбережені зміни</span>}
          </div>
        </div>
      )}

      <label className="smm-check"><input type="checkbox" checked={settings.show_button !== false} onChange={(e) => patch({ show_button: e.target.checked }, e.target.checked ? 'Кнопку «Відкрити в CRM» показуємо.' : 'Кнопку «Відкрити в CRM» вимкнено.')} disabled={busy} /> Кнопка «Відкрити в CRM» під повідомленням</label>
      {confirmDialog}
    </section>
  );
}
