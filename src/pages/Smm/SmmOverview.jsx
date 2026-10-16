import ActionIcon from '../../components/common/ActionIcon';
import { BRAND_FIELDS } from '../../lib/api/smm';
import SmmAutopilot from './SmmAutopilot';

// The team as it really is today: which assistants work, which wait for an access or a decision.
const TEAM = [
  { name: 'Контент-стратег і копірайтер', state: 'live', what: 'Складає тижневий план і пише пости під кожну мережу за бренд-профілем. Усе йде в чергу схвалення.' },
  { name: 'Моніторинг конкурентів', state: 'live', what: 'Читає публічні сайти конкурентів (головну, блог, послуги, кейси), складає аналіз і підкидає ідеї стратегу. Додайте адреси у вкладці «Бренд і конкуренти» і натисніть «Проаналізувати».' },
  { name: 'Аналітик сайту', state: 'wait', what: 'Щодня збиратиме відвідуваність і запити. Чекає доступ до Google Analytics 4 і Search Console.' },
  { name: 'SEO-оптимізатор', state: 'live', what: 'Читає публічні сторінки сайту, перевіряє технічне SEO і складає план із запропонованими title та description (вкладка «Сайт»). Правки вносите ви; для автоматичних правок знадобиться доступ до WordPress.' },
  { name: 'Публікатор', state: 'wait', what: 'Викладатиме схвалені пости через API мереж. Потрібні додатки Meta (Instagram, Facebook, Threads), LinkedIn і TikTok з їхнім схваленням.' },
  { name: 'Аналітик соцмереж', state: 'wait', what: 'Збиратиме статистику публікацій і повертатиме висновки стратегу. Стартує після публікатора.' },
];
const STATE = { live: ['Працює', 'ok'], next: ['Наступний крок', 'next'], wait: ['Чекає доступ', 'wait'] };

export default function SmmOverview({ brand, competitors, posts, settings, notify, reload, go, onGenerate }) {
  const filled = BRAND_FIELDS.filter((f) => (brand?.[f.key] || '').trim()).length;
  const count = (s) => posts.filter((p) => p.status === s).length;
  const month = Date.now() - 30 * 24 * 3600 * 1000;
  const publishedMonth = posts.filter((p) => p.status === 'published' && p.published_at && new Date(p.published_at).getTime() >= month).length;
  const steps = [
    { done: filled >= 4, text: `Заповніть бренд-профіль (${filled} з ${BRAND_FIELDS.length} полів)`, tab: 'brand', cta: 'Відкрити профіль' },
    { done: competitors.length > 0, text: 'Додайте конкурентів', tab: 'brand', cta: 'Додати' },
    { done: posts.length > 0, text: 'Згенеруйте перший тиждень постів', cta: 'Згенерувати', action: onGenerate },
    { done: count('approved') + count('published') > 0, text: 'Схваліть кілька постів у черзі', tab: 'queue', cta: 'До черги' },
  ];

  return (
    <>
      <div className="smm-stats">
        <button type="button" className="smm-stat" onClick={() => go('queue')}><b>{count('needs_review')}</b><span>на перевірці</span></button>
        <button type="button" className="smm-stat" onClick={() => go('queue')}><b>{count('approved')}</b><span>схвалено, чекає публікації</span></button>
        <div className="smm-stat"><b>{publishedMonth}</b><span>опубліковано за 30 днів</span></div>
        <div className="smm-stat"><b>{posts.length}</b><span>постів усього</span></div>
      </div>

      <section className="smm-block">
        <h3>З чого почати</h3>
        <ol className="smm-steps">
          {steps.map((s) => (
            <li key={s.text} className={s.done ? 'is-done' : ''}>
              <span className="smm-step-mark" aria-hidden="true">{s.done ? <ActionIcon name="select" size={16} /> : null}</span>
              <span className="smm-step-text">{s.text}</span>
              {!s.done && <button type="button" className="smm-btn" onClick={() => (s.action ? s.action() : go(s.tab))}>{s.cta}</button>}
            </li>
          ))}
        </ol>
      </section>

      <SmmAutopilot settings={settings} notify={notify} reload={reload} />

      <section className="smm-block">
        <h3>Команда SMM</h3>
        <div className="smm-team">
          {TEAM.map((a) => (
            <article key={a.name} className="smm-agent">
              <header><h4>{a.name}</h4><span className={'smm-state smm-state--' + STATE[a.state][1]}>{STATE[a.state][0]}</span></header>
              <p>{a.what}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
