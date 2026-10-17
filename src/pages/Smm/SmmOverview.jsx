import ActionIcon from '../../components/common/ActionIcon';
import { BRAND_FIELDS } from '../../lib/api/smm';
import { AgentStateChip, stateOf } from './agentUi';

// The state of the whole SMM team at a glance, and what to do next.
export default function SmmOverview({ brand, competitors, posts, plans, team, go, open }) {
  const filled = BRAND_FIELDS.filter((f) => (brand?.[f.key] || '').trim()).length;
  const count = (s) => posts.filter((p) => p.status === s).length;
  const month = Date.now() - 30 * 24 * 3600 * 1000;
  const publishedMonth = posts.filter((p) => p.status === 'published' && p.published_at && new Date(p.published_at).getTime() >= month).length;
  const working = team ? team.agents.filter((a) => stateOf(a, team).key === 'on').length : 0;
  const steps = [
    { done: filled >= 4, text: `Заповніть бренд-профіль (${filled} з ${BRAND_FIELDS.length} полів)`, tab: 'brand', cta: 'Відкрити профіль' },
    { done: competitors.length > 0, text: 'Додайте конкурентів', tab: 'brand', cta: 'Додати' },
    { done: working >= 4, text: 'Увімкніть агентів ланцюжка: стратег, копірайтер, візуал-агент, контроль якості', tab: 'agents', cta: 'До агентів' },
    { done: plans.length > 0, text: 'Запустіть стратега: він складе план тижня', tab: 'agents', cta: 'До агентів' },
    { done: count('approved') + count('published') > 0, text: 'Схваліть план і кілька готових постів у черзі', tab: 'queue', cta: 'До черги' },
  ];

  return (
    <>
      <div className="smm-stats">
        <button type="button" className="smm-stat" onClick={() => go('agents')}><b>{working} з {team?.agents.length ?? 0}</b><span>агентів працює</span></button>
        <button type="button" className="smm-stat" onClick={() => go('queue')}><b>{count('needs_review') + plans.filter((p) => p.status === 'awaiting_approval').length}</b><span>чекає вашого рішення</span></button>
        <button type="button" className="smm-stat" onClick={() => go('queue')}><b>{count('approved')}</b><span>схвалено, чекає публікації</span></button>
        <div className="smm-stat"><b>{publishedMonth}</b><span>опубліковано за 30 днів</span></div>
      </div>

      <section className="smm-block">
        <h3>З чого почати</h3>
        <ol className="smm-steps">
          {steps.map((s) => (
            <li key={s.text} className={s.done ? 'is-done' : ''}>
              <span className="smm-step-mark" aria-hidden="true">{s.done ? <ActionIcon name="select" size={16} /> : null}</span>
              <span className="smm-step-text">{s.text}</span>
              {!s.done && <button type="button" className="smm-btn" onClick={() => go(s.tab)}>{s.cta}</button>}
            </li>
          ))}
        </ol>
      </section>

      {team && (
        <section className="smm-block">
          <div className="smm-block-head"><h3>Команда SMM</h3><button type="button" className="smm-btn" onClick={() => go('agents')}>Усі агенти</button></div>
          <div className="smm-team">
            {team.agents.map((a) => (
              <article key={a.id} className="smm-agent">
                <header><h4><button type="button" className="smm-link-btn" onClick={() => open(a.role)}>{a.name}</button></h4><AgentStateChip state={stateOf(a, team)} /></header>
                <p>{a.description}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
