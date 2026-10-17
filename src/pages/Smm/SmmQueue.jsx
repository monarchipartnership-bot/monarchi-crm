import { useState } from 'react';
import ActionIcon from '../../components/common/ActionIcon';
import { useAuth } from '../../contexts/AuthContext';
import { agentAction } from '../../lib/api/agents';
import { NETWORKS, reviewPost } from '../../lib/api/smm';
import { fmtRange, fmtWhen } from '../../lib/smmDates';
import { NetworkBadge, StatusChip } from './smmCommon';
import { TextPromptDialog } from './SmmDialogs';

const SEV = { high: 'важливо', medium: 'помірно', low: 'дрібниця' };

function VisualBlock({ p }) {
  const v = p.visual_prompt;
  if (!p.needs_visual && !p.visual_brief) return null;
  return (
    <div className="smm-visual">
      <b>{p.format === 'video' || p.format === 'reel' ? 'Сценарій і візуал' : 'Візуал'}</b>
      {p.asset_url && (p.asset_kind === 'video' ? <video className="smm-asset" src={p.asset_url} controls preload="metadata" /> : <img className="smm-asset" src={p.asset_url} alt={v?.alt_text || 'Згенероване зображення'} />)}
      {p.asset_status === 'pending' && <span className="smm-muted">Зображення генерується…</span>}
      {p.asset_status === 'failed' && <span className="smm-bad">Не вдалося згенерувати{v?.generation_error ? `: ${v.generation_error}` : ''}</span>}
      {v ? (
        <details>
          <summary>Промт для Higgsfield ({v.mode === 'video' ? `відео ${v.duration_seconds} с` : 'зображення'}, {v.aspect_ratio})</summary>
          <p className="smm-prompt-text">{v.prompt}</p>
          {v.negative_prompt && <p className="smm-muted">Без: {v.negative_prompt}</p>}
        </details>
      ) : null}
      {p.visual_brief && <span>{p.visual_brief}</span>}
    </div>
  );
}

function QcBlock({ qc }) {
  if (!qc) return null;
  const bad = qc.verdict === 'revise';
  return (
    <div className={bad ? 'smm-warn' : 'smm-qc-ok'}>
      <b>Контроль якості: {bad ? 'лишилися зауваження' : 'пройшов'}{qc.round > 1 ? ` (після ${qc.round - 1} доопрацювань)` : ''}</b>
      {qc.summary && <span>{qc.summary}</span>}
      {qc.unresolved && <span>Агенти вже повертали пост на доопрацювання максимум разів, рішення за вами.</span>}
      {qc.issues?.length > 0 && <ul>{qc.issues.map((i, n) => <li key={n}><em>{SEV[i.severity]}</em> · {i.target === 'visual' ? 'візуал' : i.target === 'both' ? 'текст і візуал' : 'текст'}: {i.comment}</li>)}</ul>}
    </div>
  );
}

function PostBody({ p }) {
  return (
    <>
      <p className="smm-post-full">{p.body}</p>
      {p.hashtags && <p className="smm-tags">{p.hashtags}</p>}
      <VisualBlock p={p} />
      {p.fact_check && <div className="smm-warn"><b>Перевірте перед публікацією</b><span>{p.fact_check}</span></div>}
      <QcBlock qc={p.qc} />
    </>
  );
}

function Stage({ done, active, label }) {
  return <span className={'smm-stage-chip' + (done ? ' is-done' : active ? ' is-active' : '')}><i aria-hidden="true" />{label}</span>;
}

// The approval queue: the plan of the week waits for the person's «ок», then the posts are produced by the agents and wait here
// until somebody reads them and decides.
export default function SmmQueue({ posts, plans, postTasks, team, onEdit, notify, reload, kick }) {
  const { email } = useAuth();
  const [prompt, setPrompt] = useState(null); // { post?, plan?, kind: 'reject' | 'publish' | 'reject_plan' }
  const [busyId, setBusyId] = useState(null);
  const awaiting = plans.filter((pl) => pl.status === 'awaiting_approval');
  const producing = posts.filter((p) => p.status === 'producing' || p.status === 'qc');
  const review = posts.filter((p) => p.status === 'needs_review');
  const approved = posts.filter((p) => p.status === 'approved');
  const drafts = posts.filter((p) => p.status === 'draft');
  const closed = posts.filter((p) => p.status === 'published' || p.status === 'rejected').sort((a, b) => (b.reviewed_at || '').localeCompare(a.reviewed_at || '')).slice(0, 10);
  const agentName = (id) => team.agents.find((a) => a.id === id)?.name || 'агент';

  async function act(p, action, extra) {
    setBusyId(p.id);
    try {
      await reviewPost(p.id, action, { ...extra, email });
      notify({ approve: 'Пост схвалено.', reject: 'Пост відхилено.', reopen: 'Пост повернуто на перевірку.', publish: 'Позначено як опубліковане.' }[action]);
      reload();
    } catch (e) { notify(e.message || 'Не вдалося виконати дію.', true); } finally { setBusyId(null); }
  }
  async function approvePlan(plan) {
    setBusyId('plan' + plan.id);
    try {
      const r = await agentAction('approve_plan', { planId: plan.id });
      notify(`План схвалено: ${r.started} постів передано копірайтеру й візуал-агенту. Вони працюватимуть кілька хвилин.`);
      await reload();
      kick();
    } catch (e) { notify(e.message || 'Не вдалося схвалити план.', true); } finally { setBusyId(null); }
  }
  async function retry(task) {
    setBusyId('task' + task.id);
    try { await agentAction('retry_task', { taskId: task.id }); notify('Завдання поставлено в чергу знову.'); await reload(); kick(); } catch (e) { notify(e.message || 'Не вдалося повторити.', true); } finally { setBusyId(null); }
  }
  async function submitPrompt(text) {
    const { post, plan, kind } = prompt;
    if (kind === 'reject_plan') {
      await agentAction('reject_plan', { planId: plan.id, reason: text });
      notify('План відхилено. Причина врахується в наступному плані.');
    } else {
      await reviewPost(post.id, kind, kind === 'reject' ? { note: text, email } : { url: text, email });
      notify(kind === 'reject' ? 'Пост відхилено.' : 'Позначено як опубліковане.');
    }
    setPrompt(null); reload();
  }

  return (
    <>
      <p className="smm-muted">Агенти нічого не публікують самі. Спершу ви схвалюєте план тижня, потім пости проходять копірайтера, візуал-агента й контроль якості та зʼявляються тут. Опублікуйте у мережі вручну й позначте тут.</p>

      {awaiting.map((plan) => {
        const planned = posts.filter((p) => p.plan_id === plan.id && p.status === 'planned');
        return (
          <section key={plan.id} className="smm-block smm-plan-approve">
            <div className="smm-block-head"><h3>План на тиждень {fmtRange(plan.week_start)} чекає на ваше «ок»</h3></div>
            {plan.summary && <p className="smm-note">{plan.summary}</p>}
            <div className="smm-list">
              {planned.map((p) => (
                <div key={p.id} className="smm-plan-row">
                  <div className="smm-plan-row-head"><NetworkBadge platform={p.platform} /><span className="smm-when">{fmtWhen(p.scheduled_for)}</span><span className="smm-pill">{NETWORKS[p.platform]?.formats[p.format] || p.format}</span>{p.needs_visual && <span className="smm-pill">з візуалом</span>}</div>
                  <b>{p.topic}</b>
                  {p.brief?.angle && <span className="smm-muted">{p.brief.angle}</span>}
                  {p.brief?.key_points?.length > 0 && <ul className="smm-plan-points">{p.brief.key_points.map((k, i) => <li key={i}>{k}</li>)}</ul>}
                  {p.visual_brief && <span className="smm-muted">Візуал: {p.visual_brief}</span>}
                </div>
              ))}
            </div>
            <div className="smm-form-foot">
              <button type="button" className="smm-btn smm-btn--primary" disabled={busyId === 'plan' + plan.id} onClick={() => approvePlan(plan)}><ActionIcon name="select" size={18} />{busyId === 'plan' + plan.id ? 'Передаємо…' : 'Схвалити план'}</button>
              <button type="button" className="smm-btn smm-btn--danger" onClick={() => setPrompt({ plan, kind: 'reject_plan' })}><ActionIcon name="close" size={18} />Відхилити план</button>
            </div>
          </section>
        );
      })}

      {producing.length > 0 && (
        <section className="smm-block">
          <h3>У виробництві <span className="smm-count-pill">{producing.length}</span></h3>
          <div className="smm-list">
            {producing.map((p) => {
              const tasks = postTasks.filter((t) => t.post_id === p.id);
              const failed = tasks.filter((t) => t.status === 'failed');
              const textDone = !!(p.body || '').trim();
              const visualDone = !p.needs_visual || !!p.visual_prompt;
              return (
                <div key={p.id} className="smm-row">
                  <NetworkBadge platform={p.platform} />
                  <span className="smm-row-title"><b>{p.topic || 'Без теми'}</b><span className="smm-muted">{fmtWhen(p.scheduled_for)}{p.rounds ? ` · доопрацювань: ${p.rounds}` : ''}</span></span>
                  <span className="smm-stages">
                    <Stage done={textDone} active={!textDone} label="Текст" />
                    {p.needs_visual && <Stage done={visualDone} active={!visualDone} label="Візуал" />}
                    <Stage done={false} active={p.status === 'qc'} label="Контроль" />
                  </span>
                  {failed.map((t) => (
                    <div key={t.id} className="smm-row-note smm-error">
                      {agentName(t.agent_id)}: {t.error || 'помилка'}{' '}
                      <button type="button" className="smm-link-btn" disabled={busyId === 'task' + t.id} onClick={() => retry(t)}>Повторити</button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="smm-block">
        <h3>На перевірці <span className="smm-count-pill">{review.length}</span></h3>
        {review.length === 0 && <p className="smm-empty smm-empty--big">Черга порожня. Запустіть стратега на сторінці «Агенти».</p>}
        <div className="smm-queue">
          {review.map((p) => (
            <article key={p.id} className="smm-review">
              <header><NetworkBadge platform={p.platform} /><span className="smm-when">{fmtWhen(p.scheduled_for)}</span>{p.source === 'agent' && <span className="smm-agent-tag">написав агент</span>}</header>
              <h4>{p.topic || 'Без теми'}</h4>
              <PostBody p={p} />
              <footer>
                <button type="button" className="smm-btn smm-btn--primary" disabled={busyId === p.id} onClick={() => act(p, 'approve')}><ActionIcon name="select" size={18} />Схвалити</button>
                <button type="button" className="smm-btn" onClick={() => onEdit(p)}><ActionIcon name="edit" size={18} />Редагувати</button>
                <button type="button" className="smm-btn smm-btn--danger" disabled={busyId === p.id} onClick={() => setPrompt({ post: p, kind: 'reject' })}><ActionIcon name="close" size={18} />Відхилити</button>
              </footer>
            </article>
          ))}
        </div>
      </section>

      {approved.length > 0 && (
        <section className="smm-block">
          <h3>Схвалені: опублікуйте вручну <span className="smm-count-pill">{approved.length}</span></h3>
          <div className="smm-queue">
            {approved.map((p) => (
              <article key={p.id} className="smm-review smm-review--approved">
                <header><NetworkBadge platform={p.platform} /><span className="smm-when">{fmtWhen(p.scheduled_for)}</span><StatusChip status={p.status} /></header>
                <h4>{p.topic || 'Без теми'}</h4>
                <PostBody p={p} />
                <footer>
                  <button type="button" className="smm-btn smm-btn--primary" disabled={busyId === p.id} onClick={() => setPrompt({ post: p, kind: 'publish' })}><ActionIcon name="upload" size={18} />Опубліковано</button>
                  <button type="button" className="smm-btn" disabled={busyId === p.id} onClick={() => act(p, 'reopen')}>Повернути на перевірку</button>
                </footer>
              </article>
            ))}
          </div>
        </section>
      )}

      {drafts.length > 0 && (
        <section className="smm-block">
          <h3>Чернетки <span className="smm-count-pill">{drafts.length}</span></h3>
          <div className="smm-list">
            {drafts.map((p) => (
              <div key={p.id} className="smm-row">
                <NetworkBadge platform={p.platform} /><span className="smm-row-title">{p.topic || p.body.slice(0, 80)}</span>
                <button type="button" className="smm-btn" onClick={() => act(p, 'reopen')}>На перевірку</button>
                <button type="button" className="smm-btn" onClick={() => onEdit(p)}>Редагувати</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {closed.length > 0 && (
        <section className="smm-block">
          <h3>Останні рішення</h3>
          <div className="smm-list">
            {closed.map((p) => (
              <div key={p.id} className="smm-row">
                <NetworkBadge platform={p.platform} /><span className="smm-row-title">{p.topic || p.body.slice(0, 80)}</span>
                <StatusChip status={p.status} />
                {p.status === 'rejected' && p.review_note && <span className="smm-muted smm-row-note">Причина: {p.review_note}</span>}
                {p.status === 'published' && p.published_url && <a className="smm-link" href={p.published_url} target="_blank" rel="noreferrer noopener">Відкрити пост</a>}
                {p.status === 'rejected' && p.body && <button type="button" className="smm-btn" onClick={() => act(p, 'reopen')}>Повернути</button>}
              </div>
            ))}
          </div>
        </section>
      )}

      {prompt && (
        <TextPromptDialog
          title={prompt.kind === 'reject_plan' ? 'Відхилити план тижня' : prompt.kind === 'reject' ? 'Відхилити пост' : 'Пост опубліковано'}
          label={prompt.kind === 'publish' ? 'Посилання на опублікований пост (необовʼязково)' : 'Причина (її врахують стратег і копірайтер)'}
          placeholder={prompt.kind === 'publish' ? 'https://' : 'Наприклад: надто рекламно, немає конкретики'}
          required={prompt.kind !== 'publish'}
          confirmLabel={prompt.kind === 'publish' ? 'Підтвердити' : 'Відхилити'}
          onClose={() => setPrompt(null)}
          onSubmit={submitPrompt}
        />
      )}
    </>
  );
}
