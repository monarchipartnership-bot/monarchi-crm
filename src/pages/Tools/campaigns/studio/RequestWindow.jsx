import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ActionIcon from '../../../../components/common/ActionIcon';
import { useConfirm } from '../../../../components/common/ConfirmDialog';
import useDialogA11y from '../../../../lib/useDialogA11y';
import { kickQueue } from '../../../../lib/api/agents';
import { cancelRequest, deleteRequest, fetchRequestDetail, passOn, retryStudioTask, runStep, startRequest } from '../../../../lib/api/creatives';
import { CREATIVE_ROLES, IDEA_SOURCES, MATERIAL_KINDS, REQUEST_LANGUAGES, REQUEST_RATIOS, TEXT_MODES } from '../../../../lib/agents/creativeTeam';
import Markdown from '../../../Smm/Markdown';
import { fmtDateTime } from '../../../Smm/agentUi';

export const REQUEST_STATUS = {
  draft: ['Чернетка', 'draft'], running: ['В роботі', 'active'], review: ['Готово до перегляду', 'active'], done: ['Завершено', 'archived'],
  problem: ['Помилка', 'bad'], cancelled: ['Скасовано', 'archived'],
};
const STEP_STATE = { wait: 'Чекає', work: 'Працює', done: 'Готово', fail: 'Помилка', off: 'Вимкнено', manual: 'Вручну', gate: 'Чекає вашого ОК' };

// One request of the studio: where its chain is, what every agent concluded, the brief with its concepts, the prompts and texts of the
// creatives. A person can start it, cancel it, retry a failed step, copy it into a new request or delete it.
export default function RequestWindow({ request: initial, team, onClose, onChanged, onCopy, notify }) {
  const box = useRef(null);
  const [confirm, confirmDialog] = useConfirm();
  const [detail, setDetail] = useState({ request: initial, tasks: [], creatives: [] });
  const [open, setOpen] = useState({});
  const [busy, setBusy] = useState(false);
  useDialogA11y(box, onClose);

  const reload = useCallback(async () => {
    const d = await fetchRequestDetail(initial.id);
    if (d) setDetail(d);
    return d;
  }, [initial.id]);
  useEffect(() => { reload().catch(() => {}); }, [reload]);
  const status = detail.request.status;
  useEffect(() => {
    if (status !== 'running') return undefined;
    const t = setInterval(() => { reload().then((d) => { if (d && d.request.status !== 'running') onChanged(); }).catch(() => {}); }, 5000);
    return () => clearInterval(t);
  }, [status, reload, onChanged]);

  const agentsByRole = useMemo(() => new Map((team?.agents || []).map((a) => [a.role, a])), [team]);
  const taskOf = (role) => { const a = agentsByRole.get(role); return a ? detail.tasks.find((t) => t.agent_id === a.id) : null; };
  // the steps of a request are the agents of the department that work on requests; an agent is «off» for this client when it is off or the client's
  // link to it is off or paused, and «manual» when the client's link is in manual mode (the person starts that step)
  const steps = CREATIVE_ROLES.filter((r) => r.trigger === 'request').map((def) => {
    const agent = agentsByRole.get(def.role);
    const link = agent ? team?.clients?.get(agent.id) : null;
    const task = taskOf(def.role);
    let state = 'wait';
    if (!agent?.enabled || !link || !link.enabled || link.mode === 'paused') state = 'off';
    else if (task?.status === 'done') state = task.output?.awaiting_pass ? 'gate' : 'done';
    else if (task?.status === 'failed') state = 'fail';
    else if (task && ['queued', 'running'].includes(task.status)) state = 'work';
    else if (link.mode === 'manual') state = 'manual';
    return { def, agent, task, state };
  });
  const cost = detail.tasks.reduce((s, t) => s + Number(t.cost_usd || 0), 0);
  const plan = steps.find((s) => s.def.role === 'creative_strategy')?.task?.output?.json;
  const brief = steps.find((s) => s.def.role === 'creative_brief')?.task?.output?.json;
  const copyBy = (key) => (steps.find((s) => s.def.role === 'creative_copywriter')?.task?.output?.json?.texts || []).filter((t) => t.concept === key);
  const b = detail.request.brief || {};

  async function run(fn, okText) {
    setBusy(true);
    try { await fn(); if (okText) notify(okText); await reload(); onChanged(); } catch (e) { notify(e.message || 'Не вдалося виконати дію.', true); } finally { setBusy(false); }
  }
  const start = () => run(async () => { await startRequest(detail.request.id); await reload(); await kickQueue(() => { reload().catch(() => {}); }); }, 'Запит запущено.');
  const retry = (task) => run(async () => { await retryStudioTask(task.id); await kickQueue(() => { reload().catch(() => {}); }); }, 'Крок запущено ще раз.');
  const startStep = (agent) => run(async () => { await runStep(agent.id, detail.request.campaign_id, detail.request.id); await kickQueue(() => { reload().catch(() => {}); }); }, 'Крок виконано.');
  const approve = (task) => run(async () => { await passOn(task.id); await kickQueue(() => { reload().catch(() => {}); }); }, 'Передано далі.');
  async function cancel() {
    if (!(await confirm({ title: 'Скасувати запит?', body: 'Завдання, що чекають у черзі, буде знято. Крок, який уже працює, закінчиться, але нічого нового не почне.', confirmLabel: 'Скасувати запит', danger: true }))) return;
    run(() => cancelRequest(detail.request.id), 'Запит скасовано.');
  }
  async function remove() {
    if (!(await confirm({ title: 'Видалити запит?', body: 'Запит, його результати й запити для креативів буде видалено. Завантажені матеріали залишаться у сховищі.', confirmLabel: 'Видалити', danger: true }))) return;
    setBusy(true);
    try { await deleteRequest(detail.request.id); onChanged(); onClose(); notify('Запит видалено.'); } catch (e) { notify(e.message || 'Не вдалося видалити.', true); setBusy(false); }
  }

  const [label, tone] = REQUEST_STATUS[status] || ['—', 'draft'];
  return (
    <div className="cmp-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className="cmp-wizard stu-win" role="dialog" aria-modal="true" aria-labelledby="stu-win-title" tabIndex={-1}>
        <header className="cmp-wiz-head">
          <div>
            <span className="cmp-kicker">Запит на креативи · {fmtDateTime(detail.request.created_at)}</span>
            <h2 id="stu-win-title">{detail.request.title}</h2>
          </div>
          <span className={'cmp-status cmp-status--' + tone}>{label}</span>
          <button type="button" className="cmp-x" onClick={onClose} aria-label="Закрити"><ActionIcon name="close" size={20} /></button>
        </header>
        <div className="cmp-wiz-body">
          <div className="stu-actions">
            {status === 'draft' && <button type="button" className="cmp-btn cmp-btn--primary" disabled={busy} onClick={start}>Запустити</button>}
            {status === 'running' && <button type="button" className="cmp-btn" disabled={busy} onClick={cancel}>Скасувати запит</button>}
            {['review', 'problem', 'cancelled', 'done'].includes(status) && <button type="button" className="cmp-btn" disabled={busy} onClick={() => onCopy(detail.request)}>Повторити з цими вимогами</button>}
            {status !== 'running' && <button type="button" className="cmp-btn cmp-btn--danger" disabled={busy} onClick={remove}>Видалити</button>}
            {cost > 0 && <span className="cmp-muted">Витрати моделі: ${cost.toFixed(2)}</span>}
          </div>
          {status === 'problem' && <p className="cmp-warnbox" role="status"><b>Запит зупинився.</b> {detail.request.error || ''} Натисніть «Повторити крок» біля агента з помилкою.</p>}
          {status === 'review' && <p className="cmp-note">Технічне завдання, тексти й запити для Higgsfield готові. Генерація картинок підключається наступним кроком: поки що перевірте концепції й запити.</p>}

          <section className="stu-section">
            <h3>Вимоги</h3>
            <dl className="stu-req">
              <div><dt>Задача</dt><dd>{b.goal}</dd></div>
              {b.product && <div><dt>Продукт</dt><dd>{b.product}</dd></div>}
              {b.audience && <div><dt>Аудиторія</dt><dd>{b.audience}</dd></div>}
              {b.message && <div><dt>Меседж</dt><dd>{b.message}</dd></div>}
              {b.must && <div><dt>Обовʼязково</dt><dd>{b.must}</dd></div>}
              {b.avoid && <div><dt>Не можна</dt><dd>{b.avoid}</dd></div>}
              <div><dt>Формати</dt><dd>{(b.ratios || []).map((r) => REQUEST_RATIOS.find((x) => x.key === r)?.label || r).join(', ')} · {b.texts === 'given' ? `креативів за текстами: ${(b.given_texts || []).length}` : `напрямів: до ${b.count}`} · тексти: {TEXT_MODES[b.texts]} · {REQUEST_LANGUAGES[b.language]}</dd></div>
              {b.texts === 'given' && (b.given_texts || []).length > 0 && <div><dt>Задані тексти</dt><dd>{b.given_texts.map((t, i) => `${i + 1}) ${t.headline}${t.subline ? ` / ${t.subline}` : ''}${t.badge ? ` / ${t.badge}` : ''}`).join(' | ')}</dd></div>}
              {b.idea_source && <div><dt>Ідеї</dt><dd>{IDEA_SOURCES[b.idea_source]}{b.figma ? ` · Figma: ${b.figma}` : ''}</dd></div>}
              <div><dt>Кнопка</dt><dd>{b.cta === false ? 'не потрібна' : `потрібна${b.cta_text ? `: «${b.cta_text}»` : ''}`}</dd></div>
            </dl>
            {(detail.request.materials || []).length > 0 && (
              <ul className="stu-files stu-files--ro">{detail.request.materials.map((m) => <li key={m.url}><img src={m.url} alt="" /><span><b>{m.name}</b><small>{MATERIAL_KINDS[m.kind] || m.kind}</small></span></li>)}</ul>
            )}
          </section>

          <section className="stu-section">
            <h3>Хід роботи</h3>
            <ol className="stu-steps">
              {steps.map(({ def, agent, task, state }) => (
                <li key={def.role} className={'stu-step stu-step--' + state}>
                  <div className="stu-step-head">
                    <b>{def.name}</b>
                    <span className="stu-step-state">{STEP_STATE[state]}</span>
                  </div>
                  <small>{def.short}</small>
                  {task?.status === 'done' && task.output?.summary && <p>{task.output.summary}</p>}
                  {task?.status === 'failed' && <p className="cmp-bad">{task.error}</p>}
                  <div className="stu-step-actions">
                    {task?.status === 'done' && task.output?.text && <button type="button" className="cmp-btn" onClick={() => setOpen((o) => ({ ...o, [def.role]: !o[def.role] }))}>{open[def.role] ? 'Згорнути' : 'Відкрити звіт'}</button>}
                    {task?.status === 'failed' && <button type="button" className="cmp-btn" disabled={busy} onClick={() => retry(task)}>Повторити крок</button>}
                    {state === 'gate' && <button type="button" className="cmp-btn cmp-btn--primary" disabled={busy} onClick={() => approve(task)}>Підтвердити й передати далі</button>}
                    {state === 'manual' && <button type="button" className="cmp-btn" disabled={busy} onClick={() => startStep(agent)}>Запустити для цього клієнта</button>}
                  </div>
                  {open[def.role] && task?.output?.text && <div className="stu-report"><Markdown text={task.output.text} />{task.output.failedInputs?.length > 0 && <p className="cmp-warnbox">Не завантажились дані: {task.output.failedInputs.join('; ')}</p>}</div>}
                </li>
              ))}
            </ol>
          </section>

          {plan?.directions?.length > 0 && (
            <section className="stu-section">
              <h3>План стратега</h3>
              {plan.clarify && <p className="cmp-note">Що уточнити менеджеру: {plan.clarify}</p>}
              <div className="stu-concepts">
                {plan.directions.map((d) => (
                  <article key={d.key} className="stu-concept">
                    <header><b>{d.priority}. {d.name}</b><small>{d.key}</small></header>
                    <p><span>Чому</span>{d.why}</p>
                    <p><span>Для кого</span>{d.audience}</p>
                    <p><span>Ідея</span>{d.angle}</p>
                    <p><span>Що перевіряє</span>{d.tests}</p>
                    {d.notes && <p><span>Ризики</span>{d.notes}</p>}
                  </article>
                ))}
              </div>
            </section>
          )}

          {brief?.concepts?.length > 0 && (
            <section className="stu-section">
              <h3>Концепції й запити для Higgsfield</h3>
              {brief.notes && <p className="cmp-note">Що перевірити людині: {brief.notes}</p>}
              <div className="stu-concepts">
                {brief.concepts.map((c) => (
                  <article key={c.key} className="stu-concept">
                    <header><b>{c.name}</b><small>{c.key} · {c.ratios.join(', ')}</small></header>
                    <p><span>Ідея</span>{c.angle}</p>
                    <p><span>Меседж</span>{c.message}</p>
                    <p><span>Картинка</span>{c.visual}</p>
                    {c.uses_materials?.length > 0 && <p><span>З матеріалів</span>{c.uses_materials.join(', ')}</p>}
                    {copyBy(c.key).map((t, i) => (
                      <div key={i} className="stu-copy"><b>{t.headline}</b><p>{t.primary_text}</p><small>{t.description}{t.cta ? ` · ${t.cta}` : ''}</small></div>
                    ))}
                    {detail.creatives.filter((x) => x.concept_key === c.key).map((x) => (
                      <details key={x.id} className="stu-prompt">
                        <summary>Запит для Higgsfield · {x.ratio}{x.hf?.references?.length ? ` · референсів: ${x.hf.references.length}` : ''}</summary>
                        <p>{x.prompt}</p>
                        {x.negative_prompt && <small>Негативний запит: {x.negative_prompt}</small>}
                        {x.hf?.references?.length > 0 && <div className="stu-refs">{x.hf.references.map((r) => <img key={r.url} src={r.url} alt={r.name} title={r.name} />)}</div>}
                      </details>
                    ))}
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
        {confirmDialog}
      </div>
    </div>
  );
}
