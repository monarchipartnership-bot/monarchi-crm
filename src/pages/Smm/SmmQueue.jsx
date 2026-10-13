import { useState } from 'react';
import ActionIcon from '../../components/common/ActionIcon';
import { useAuth } from '../../contexts/AuthContext';
import { reviewPost } from '../../lib/api/smm';
import { fmtWhen } from '../../lib/smmDates';
import { NetworkBadge, StatusChip } from './smmCommon';
import { TextPromptDialog } from './SmmDialogs';

function PostBody({ p }) {
  return (
    <>
      <p className="smm-post-full">{p.body}</p>
      {p.hashtags && <p className="smm-tags">{p.hashtags}</p>}
      {p.visual_brief && <div className="smm-visual"><b>{p.format === 'video' || p.format === 'reel' ? 'Сценарій' : 'Візуал'}</b><span>{p.visual_brief}</span></div>}
      {p.fact_check && <div className="smm-warn"><b>Перевірте перед публікацією</b><span>{p.fact_check}</span></div>}
    </>
  );
}

// The approval queue: what the agent (or a person) wrote waits here until somebody reads it and decides.
export default function SmmQueue({ posts, onEdit, notify, reload }) {
  const { email } = useAuth();
  const [prompt, setPrompt] = useState(null); // { post, kind: 'reject' | 'publish' }
  const [busyId, setBusyId] = useState(null);
  const review = posts.filter((p) => p.status === 'needs_review');
  const approved = posts.filter((p) => p.status === 'approved');
  const drafts = posts.filter((p) => p.status === 'draft');
  const closed = posts.filter((p) => p.status === 'published' || p.status === 'rejected').sort((a, b) => (b.reviewed_at || '').localeCompare(a.reviewed_at || '')).slice(0, 10);

  async function act(p, action, extra) {
    setBusyId(p.id);
    try {
      await reviewPost(p.id, action, { ...extra, email });
      notify({ approve: 'Пост схвалено.', reject: 'Пост відхилено.', reopen: 'Пост повернуто на перевірку.', publish: 'Позначено як опубліковане.' }[action]);
      reload();
    } catch (e) { notify(e.message || 'Не вдалося виконати дію.', true); } finally { setBusyId(null); }
  }
  async function submitPrompt(text) {
    const { post, kind } = prompt;
    await reviewPost(post.id, kind, kind === 'reject' ? { note: text, email } : { url: text, email });
    notify(kind === 'reject' ? 'Пост відхилено.' : 'Позначено як опубліковане.');
    setPrompt(null); reload();
  }

  return (
    <>
      <p className="smm-muted">Агент нічого не публікує сам. Прочитайте пост, схваліть або відхиліть, а потім опублікуйте у мережі вручну і позначте тут.</p>

      <section className="smm-block">
        <h3>На перевірці <span className="smm-count-pill">{review.length}</span></h3>
        {review.length === 0 && <p className="smm-empty smm-empty--big">Черга порожня. Згенеруйте план на вкладці «Контент-план».</p>}
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
                {p.status === 'rejected' && <button type="button" className="smm-btn" onClick={() => act(p, 'reopen')}>Повернути</button>}
              </div>
            ))}
          </div>
        </section>
      )}

      {prompt && (
        <TextPromptDialog
          title={prompt.kind === 'reject' ? 'Відхилити пост' : 'Пост опубліковано'}
          label={prompt.kind === 'reject' ? 'Причина (щоб наступні пости виходили краще)' : 'Посилання на опублікований пост (необовʼязково)'}
          placeholder={prompt.kind === 'reject' ? 'Наприклад: надто рекламно, немає конкретики' : 'https://'}
          required={prompt.kind === 'reject'}
          confirmLabel={prompt.kind === 'reject' ? 'Відхилити' : 'Підтвердити'}
          onClose={() => setPrompt(null)}
          onSubmit={submitPrompt}
        />
      )}
    </>
  );
}
