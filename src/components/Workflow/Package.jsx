import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pill } from './parts';
import { PACK_BLOCKS, blockOfTarget, buildPack, plural, remarksText, reviewState } from '../../lib/workflow/pack';
import { decideApproval, fetchPackage, recordClientAnswer } from '../../lib/api/workflow';

const dmy = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('.') : iso || '');
const STATUS = { ready: ['ok', 'Готово'], planned: ['mute', 'Заплановано'], producing: ['info', 'Генерується'], failed: ['bad', 'Не вдалося'], needs_check: ['warn', 'Потрібна перевірка'] };

// An ad as it will look in the feed: the page, the text, the picture, the headline and the button. The tag under it is what the Media buyer reads later.
function Ad({ c, page, review }) {
  const [tone, label] = STATUS[c.status] || ['mute', c.status || ''];
  const target = 'creative:' + c.id;
  const remark = review?.remarks.find((r) => r.target === target);
  return (
    <div className={'wf-ad2' + (remark ? ' flag' : '')}>
      <div className="hd"><span className="av" /><div><b>{page}</b><div className="wf-muted" style={{ fontSize: 11.5 }}>Реклама</div></div></div>
      <div className="tx">{c.primary_text || c.tag}</div>
      {c.image_url ? <img src={c.image_url} alt={c.headline || c.tag} loading="lazy" /> : <div className={'im ' + (c.status === 'failed' ? 'bad' : c.status === 'needs_check' ? 'warn' : '')}>{c.status === 'failed' ? 'Картинки немає' : c.status === 'producing' ? 'Генерується…' : c.missing ? 'Креатив не знайдено' : 'Картинки ще немає'}</div>}
      <div className="ft"><b>{c.headline}</b>{c.cta && <span className="cta">{c.cta}</span>}</div>
      <div className="adm">
        <div className="wf-row"><Pill tone={tone}>{label}</Pill>{c.version > 1 && <span className="wf-chip">версія {c.version}</span>}</div>
        <div className="wf-tag">{c.tag}</div>
        {(c.problems || []).map((p, i) => <div key={i} className="wf-lock" style={{ margin: 0 }}>{p}</div>)}
        {c.note && <div className="wf-muted" style={{ fontSize: 12 }}>{c.note}</div>}
        {remark && <div className="wf-cm"><b>Зауваження</b>{remark.text}</div>}
        {review && !c.missing && <button type="button" className="wf-btn sm" onClick={() => review.onOpen(target)}>{remark ? 'Змінити зауваження' : 'Зауваження'}</button>}
        {review?.open === target && <Composer label={`Що змінити в «${c.goal || c.tag}»`} initial={remark?.text || ''} onAdd={(t) => review.onAdd(target, t)} onCancel={() => review.onOpen(null)} onRemove={remark ? () => review.onRemove(target) : null} />}
      </div>
    </div>
  );
}

function Composer({ label, initial, onAdd, onCancel, onRemove }) {
  const [text, setText] = useState(initial || '');
  const [err, setErr] = useState('');
  return (
    <div className="wf-composer">
      <label className="wf-muted" style={{ fontSize: 12.5 }}>{label}<textarea className="wf-cmt" value={text} onChange={(e) => setText(e.target.value)} autoFocus /></label>
      {err && <div className="wf-err" role="alert">{err}</div>}
      <div className="wf-row">
        <button type="button" className="wf-btn p sm" onClick={() => { if (!text.trim()) { setErr('Напишіть, що змінити.'); return; } onAdd(text.trim()); }}>Додати зауваження</button>
        <button type="button" className="wf-btn sm" onClick={onCancel}>Скасувати</button>
        {onRemove && <button type="button" className="wf-btn sm d" onClick={onRemove}>Прибрати</button>}
      </div>
    </div>
  );
}

// a block of the package; with a review it gets «Усе добре» and «Є зауваження»
function Block({ k, title, review, children, hero }) {
  const has = review?.remarks.some((r) => blockOfTarget(r.target) === k);
  const ok = review?.reviewed[k];
  const own = review?.remarks.find((r) => r.target === k);
  return (
    <div id={'pk-' + k} className={'wf-blk' + (hero ? ' hero' : '') + (has ? ' flag' : ok ? ' okd' : '')}>
      <div className="wf-row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, color: hero ? 'inherit' : undefined }}>{title}</h3>
        {review && (
          <div className="wf-row">
            <button type="button" className="wf-btn sm" aria-pressed={!!ok} onClick={() => review.onOk(k)}>{ok ? '✓ Добре' : 'Усе добре'}</button>
            <button type="button" className="wf-btn sm" onClick={() => review.onOpen(k)}>{own ? 'Змінити зауваження' : 'Є зауваження'}</button>
          </div>
        )}
      </div>
      {children}
      {own && <div className="wf-cm"><b>Зауваження</b>{own.text}</div>}
      {review?.open === k && <Composer label={`Що змінити в блоці «${title}»`} initial={own?.text || ''} onAdd={(t) => review.onAdd(k, t)} onCancel={() => review.onOpen(null)} onRemove={own ? () => review.onRemove(k) : null} />}
    </div>
  );
}

// The package exactly as the client will see it. Without `review` it is only read (the page of the section «Стратегія»).
export function PackageView({ pack, page, review }) {
  const { summary: s, priorities, scheme, money, timeline, optimisation } = pack;
  const pct = (x) => (money.daily ? Math.round(((x || 0) / money.daily) * 100) : 0);
  return (
    <div className="wf-pk">
      <Block k="summary" title="Підсумок" review={review} hero>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Стратегія першого місяця{page ? ` для «${page}»` : ''}</div>
        <div style={{ opacity: .85 }}>{s.geo ? s.geo + ' · ' : ''}версія {pack.version}{pack.rework ? ` · за коментарем: «${pack.rework.comment}»` : ''}</div>
        <div className="wf-big">
          <div><b>{s.goal || '—'}</b><span>ціль із брифу</span></div>
          <div><b>{s.monthly != null ? `${s.monthly} ${s.currency}` : '—'}</b><span>на місяць</span></div>
          <div><b>{s.daily != null ? `${s.daily} ${s.currency}` : '—'}</b><span>на день · кампаній {s.campaigns}</span></div>
        </div>
        {s.text && <div style={{ opacity: .95 }}>{s.text}</div>}
        {s.base && <div style={{ opacity: .85, fontSize: 13 }}>Базовий сценарій: близько {s.base.orders_at_target} замовлень при цільовому CPA, беззбиткових {s.base.orders_to_break_even}.</div>}
      </Block>

      <Block k="priorities" title="Що просуваємо" review={review}>
        {priorities.list.length ? (
          <div className="wf-col">{priorities.list.map((p, i) => (
            <div key={i}><div className="wf-row"><span className="wf-chip">{i + 1}. {p.product}{p.margin_pct != null ? ` · маржа ${p.margin_pct}%` : ''}</span><span className="wf-muted" style={{ fontSize: 12.5 }}>{priorities.source === 'client' ? 'за вказівкою клієнта' : 'за маржею з Unit Economy'}</span></div>
              {p.reason && <div style={{ marginTop: 4 }}>{p.reason}</div>}{p.warning && <div className="wf-lock">{p.warning}</div>}</div>
          ))}</div>
        ) : <div className="wf-muted">Пріоритетні товари не визначено.</div>}
        {priorities.notes.map((n, i) => <div key={i} className="wf-lock">{n}</div>)}
      </Block>

      <Block k="scheme" title="Схема першого місяця і реклама" review={review}>
        {scheme.branch === 'B' && <div className="wf-lock">Матеріалів недостатньо: креативи створюються після отримання матеріалів. Клієнт отримує ТЗ на зйомку разом зі стратегією.</div>}
        {scheme.campaigns.map((c, i) => (
          <div key={i} className="wf-camp">
            <div className="wf-row" style={{ justifyContent: 'space-between' }}><b>{c.name}</b>{c.daily_budget != null && <span className="wf-chip">{c.daily_budget} {s.currency} на день</span>}</div>
            {c.why && <div className="wf-muted">{c.why}{c.products?.length ? ` Товари: ${c.products.join(', ')}.` : ''}</div>}
            {c.groups.map((g, k) => (
              <div key={k} className="wf-grp">
                <div className="wf-row"><b style={{ fontSize: 13 }}>Група «{g.name}»</b>{g.segment && <span className="wf-muted" style={{ fontSize: 12 }}>аудиторія: {g.segment}</span>}</div>
                {g.ads.length ? <div className="wf-ads">{g.ads.map((a) => <Ad key={a.id} c={a} page={page} review={review} />)}</div> : <div className="wf-muted" style={{ fontSize: 13 }}>Креативів у групі поки немає.</div>}
              </div>
            ))}
          </div>
        ))}
        {scheme.unplaced.length > 0 && (
          <div className="wf-camp"><b>Креативи без групи</b><div className="wf-ads">{scheme.unplaced.map((a) => <Ad key={a.id} c={a} page={page} review={review} />)}</div></div>
        )}
      </Block>

      <Block k="money" title="Куди йдуть гроші" review={review}>
        {money.daily != null ? (
          <>
            <div className="wf-bar" role="img" aria-label={money.campaigns.map((c) => `${c.name} ${c.daily_budget}`).join(', ')}>
              {money.campaigns.map((c, i) => <div key={i} style={{ width: pct(c.daily_budget) + '%', opacity: 1 - i * 0.22 }} title={c.name}>{c.name} · {c.daily_budget}</div>)}
            </div>
            <div className="wf-muted">{money.daily} {money.currency} на день; мінімум на кампанію {money.min_daily}; бюджет дозволяє кампаній до {money.max_campaigns}.</div>
            {money.scenarios.length > 0 && <div className="wf-tblwrap"><table className="wf-tbl"><thead><tr><th>Сценарій</th><th>На місяць</th><th>Замовлень при цільовому CPA</th></tr></thead><tbody>{money.scenarios.map((x) => <tr key={x.name}><td>{x.name}</td><td>{x.monthly_budget}</td><td>{x.orders_at_target}</td></tr>)}</tbody></table></div>}
          </>
        ) : <div className="wf-muted">Місячний бюджет не вказано.</div>}
      </Block>

      <Block k="timeline" title="Перший місяць за датами" review={review}>
        <div className="wf-tl">{timeline.milestones.map((m, i) => (
          <div key={i} className={'m' + (m.client ? ' cl' : '')}><b>{m.date ? dmy(m.date) : m.title}</b>{m.date ? m.title : m.note}{m.client && <span className="wf-muted" style={{ fontSize: 11.5 }}>клієнт</span>}</div>
        ))}</div>
        <div className="wf-muted" style={{ fontSize: 12.5 }}>Дати для клієнта запропоновано системою: узгодьте їх з клієнтом.</div>
        {timeline.remarketing && <div>{timeline.remarketing.enabled ? 'Ремаркетинг: бюджет достатній, вмикаємо після того, як холодні кампанії наберуть аудиторію.' : `Ремаркетинг: поки не вмикаємо, бюджет на день менший за ${timeline.remarketing.from_daily ?? '—'}.`}</div>}
        {(timeline.remarketing?.stages || []).filter((x) => x.message).map((x) => <div key={x.stage} className="wf-muted">{x.label}: {x.message}</div>)}
        {timeline.seasonal.map((x, i) => <div key={i} className="wf-muted">Сезонне: {x.what} ({x.when})</div>)}
      </Block>

      <Block k="optimisation" title="Як оптимізуємо" review={review}>
        <ul className="wf-nlist">{optimisation.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
        {optimisation.assumptions.map((a, i) => <div key={i} className="wf-muted" style={{ fontSize: 12.5 }}>{a}</div>)}
      </Block>
    </div>
  );
}

// The review of the package: the blocks with «Усе добре» / «Є зауваження», the steps on top, the check and the decision on the right. mode «manager» = Апрув 1;
// mode «client» = the manager records the answer of the client on the same blocks. Only the pinned items go back to the agents.
export function PackageReview({ item, email, onDone, projectName }) {
  const client = item.kind === 'client';
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => { try { setData(await fetchPackage(item.projectId, client ? null : item.id)); } catch (e) { setErr(e.message || String(e)); } }, [item.projectId, item.id, client]);
  useEffect(() => { load(); }, [load]);
  if (err && !data) return <div className="wf-err" role="alert">{err}</div>;
  if (!data) return <div className="wf-load">Завантаження пакета…</div>;
  return <ReviewBoard item={item} data={data} email={email} onDone={onDone} projectName={projectName} />;
}

// the board itself (data already loaded): `api` can be replaced in a test bench
export function ReviewBoard({ item, data, email, onDone, projectName, api = { decideApproval, recordClientAnswer } }) {
  const client = item.kind === 'client';
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState({});
  const [remarks, setRemarks] = useState([]);
  const [open, setOpen] = useState(null);
  const [done, setDone] = useState('');
  const pack = useMemo(() => (data?.strategy ? buildPack(data.strategy.content, data.creatives?.content) : null), [data]);
  const state = reviewState(reviewed, remarks);
  const creatives = data?.creatives?.content?.items || [];
  const warnings = [...(data?.approval?.subject?.warnings || []), ...(pack?.warnings || [])];

  const goNext = (key) => { const i = PACK_BLOCKS.findIndex((b) => b.key === key); const next = PACK_BLOCKS[i + 1]; document.getElementById(next ? 'pk-' + next.key : 'pk-rail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const review = {
    reviewed, remarks, open,
    onOk: (k) => { setReviewed((r) => ({ ...r, [k]: !r[k] })); if (!reviewed[k]) goNext(k); },
    onOpen: (t) => setOpen((o) => (o === t ? null : t)),
    onAdd: (t, text) => { setRemarks((r) => [...r.filter((x) => x.target !== t), { target: t, text }]); setReviewed((r) => ({ ...r, [blockOfTarget(t)]: false })); setOpen(null); },
    onRemove: (t) => { setRemarks((r) => r.filter((x) => x.target !== t)); setOpen(null); },
  };

  async function decide(status) {
    setBusy(true); setErr('');
    try {
      const text = remarksText(remarks, creatives);
      if (client) await api.recordClientAnswer(item.projectId, status, text, email, status === 'returned' ? remarks : []);
      else await api.decideApproval({ id: item.id, project_id: item.projectId, kind: item.kind, subject: data?.approval?.subject }, status, text, email, status === 'returned' ? remarks : []);
      setDone(status === 'approved' ? (client ? 'Відповідь клієнта записано: погодив. Запуск піде на Апрув 2.' : 'Апрув 1 отримано. Пакет можна відправляти клієнту.') : `Повернуто: агенти отримали лише ${remarks.length} ${plural(remarks.length, 'зауваження', 'зауваження', 'зауважень')}, решта лишається як є.`);
      onDone?.();
    } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  }

  if (!pack) return <div className="wf-card"><div className="wf-empty">Стратегії ще немає: пакет з’явиться, коли Стратег її складе.</div></div>;

  return (
    <div className="wf-col">
      <div className="wf-row">
        <Pill tone={client ? 'info' : 'warn'}>{client ? 'Відповідь клієнта' : 'Апрув 1'}</Pill>
        <span className="wf-muted">{client ? 'Клієнт відповів: запишіть його відповідь по блоках пакета. «Усе добре» там, де погодив, «Є зауваження» там, де просить правки.' : 'Ви перевіряєте пакет у тому вигляді, в якому його побачить клієнт.'}</span>
      </div>
      <div className="wf-steps2" role="list" aria-label="Кроки перевірки">
        {PACK_BLOCKS.map((b, i) => {
          const st = state.withRemark.has(b.key) ? 'flag' : reviewed[b.key] ? 'ok' : '';
          return <button key={b.key} type="button" role="listitem" className={'stp ' + st} onClick={() => document.getElementById('pk-' + b.key)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><span className="n">{st === 'ok' ? '✓' : st === 'flag' ? '!' : i + 1}</span>{b.step}</button>;
        })}
        <button type="button" role="listitem" className="stp" onClick={() => document.getElementById('pk-rail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><span className="n">{PACK_BLOCKS.length + 1}</span>Рішення</button>
      </div>
      <div className="wf-grid wf-g2pk">
        <PackageView pack={pack} page={projectName || item.project} review={review} />
        <div className="wf-rail" id="pk-rail">
          <div className="wf-card">
            <h3>{client ? 'Підсумок відповіді' : 'Перевірка і рішення'}</h3>
            {!client && <div className="wf-okb">Автоматична перевірка пройдена: цифри в розділах сходяться.</div>}
            {!client && warnings.map((w, i) => <div key={i} className="wf-lock" style={{ marginTop: 6 }}>{w}</div>)}
            <div className="wf-muted" style={{ margin: '10px 0 4px' }}>Переглянуто {state.answered} з {state.total} блоків · зауважень: {remarks.length}</div>
            <div className="wf-prog"><i style={{ width: Math.round((state.answered / state.total) * 100) + '%' }} /></div>
            <div className="wf-col" style={{ marginTop: 10 }}>
              {remarks.map((r) => <div key={r.target} className="wf-cm"><b>{String(r.target).startsWith('creative:') ? 'Креатив «' + (creatives.find((c) => c.id === r.target.slice(9))?.goal || r.target) + '»' : PACK_BLOCKS.find((b) => b.key === r.target)?.step}</b>{r.text}<button type="button" className="wf-btn sm" onClick={() => review.onRemove(r.target)}>Прибрати</button></div>)}
            </div>
            {err && <div className="wf-err" role="alert" style={{ marginTop: 8 }}>{err}</div>}
            {done ? <div className="wf-okb" style={{ marginTop: 10 }}>{done}</div> : (
              <>
                <div className="wf-row" style={{ marginTop: 12 }}>
                  <button type="button" className="wf-btn p" disabled={busy || !state.canApprove} onClick={() => decide('approved')}>{client ? 'Клієнт погодив усе' : 'Затвердити'}</button>
                  <button type="button" className="wf-btn d" disabled={busy || !state.canReturn} onClick={() => decide('returned')}>{client ? 'Клієнт повернув з правками' : 'Повернути з коментарями'}</button>
                </div>
                <div className="wf-muted" style={{ fontSize: 12.5, marginTop: 6 }}>{state.canApprove ? 'Усе переглянуто, зауважень немає: можна затверджувати.' : remarks.length ? 'Є зауваження: поверніть пакет, або приберіть їх.' : `Затвердити можна, коли всі блоки позначені «Усе добре» (лишилось ${state.pending.length}). Щоб повернути, додайте хоча б одне зауваження.`}</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// The page of the section «Стратегія» in the dossier: the same package, only for reading (the creatives are those of the section «Креативи (готові)»).
export function StrategyPage({ projectId, content, projectName }) {
  const [creatives, setCreatives] = useState(null);
  useEffect(() => { let on = true; fetchPackage(projectId).then((d) => { if (on) setCreatives(d.creatives?.content || {}); }).catch(() => { if (on) setCreatives({}); }); return () => { on = false; }; }, [projectId]);
  const pack = useMemo(() => buildPack(content, creatives || {}), [content, creatives]);
  if (!creatives) return <div className="wf-load">Завантаження…</div>;
  return <PackageView pack={pack} page={projectName} />;
}

// The page of the section «Креативи (готові)»: every creative as an ad of the feed, with the state, the tag and the cost of the pictures.
export function CreativesPage({ content, projectName }) {
  const items = content.items || [];
  return (
    <div className="wf-col">
      {content.branch === 'B' && <div className="wf-lock">{content.note || 'Матеріалів недостатньо: креативи ще не створюються.'}</div>}
      {items.length > 0 && <div className="wf-muted">Витрачено на картинки {Number(content.spent_usd || 0).toFixed(2)} USD з ліміту проєкту {Number(content.limit_usd || 0).toFixed(2)}.</div>}
      <div className="wf-ads">{items.map((c) => <Ad key={c.id} c={c} page={projectName} />)}</div>
      {(content.open || []).length > 0 && <div className="wf-muted" style={{ fontSize: 12.5 }}>Відкриті питання: {content.open.join(' ')}</div>}
    </div>
  );
}
