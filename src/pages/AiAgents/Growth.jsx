import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../components/common/ConfirmDialog';
import { pickApi } from '../../lib/api/growth';
import { ACTIONS, LEVELS, UNLOCK_AFTER, actionOfChannel, emptyRecord, levelsFor } from '../../lib/growth/autonomy';
import { CASES, caseFacts } from '../../lib/growth/cases';
import { checkDraft, languageFor, stripFooter } from '../../lib/growth/draftRules';
import { SOURCE_LABEL, buildQueue, capsuleOf, monthStats } from '../../lib/growth/leadFlow';
import { allowedQuotes } from '../../lib/growth/prompts';
import { findingText } from '../../lib/growth/siteFindings';
import '../../styles/growth.css';

// The window «Зростання» (variant A of the mockup docs/mockups/growth-team-mockup.html, picked by the owner 2026-11-26): one page, first what waits for the person, the decisions one by one,
// the settings of automation behind the plain question «хто надсилає?». The data and the decisions: lib/api/growth.js (the dev fixture has the same shape).
const IC = {
  growth: '<path d="M4 17l5-5 4 4 7-8"/><path d="M15 8h5v5"/>', lead: '<path d="M16 8a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3 3 15 0 18"/><path d="M12 3c-3 3-3 15 0 18"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4"/><path d="M15.4 6.5l-6.8 4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/>',
  send: '<path d="M21 3 10 14"/><path d="M21 3l-7 18-4-7-7-4 18-7Z"/>', lock: '<rect x="6" y="11" width="12" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', chat: '<path d="M4 5h16v11H9l-5 4V5Z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/>',
};
const Ic = ({ n }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: IC[n] }} />;
const Med = ({ children, p = 100, tone = '', s = 48, halo = false, plain = false }) => <span className={'gr-med ' + tone + (halo ? ' halo' : '') + (plain ? ' plain' : '')} style={{ '--p': p, '--s': s + 'px' }}><span>{children}</span></span>;
const Cap = ({ tone = '', children }) => <span className={'gr-cap ' + tone}><i />{children}</span>;
const pl = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
const ini = (name) => String(name || '?').split(/[\s.]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const toneOfVerdict = (v) => (v === 'ok' ? 'ok' : v === 'ask' ? 'warn' : v === 'no' ? 'bad' : 'mute');
const money = (n) => '$' + (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n || 0).toFixed(2).replace('.', ','));
const ENDED = ['rejected', 'skipped', 'failed'];
const SOURCE_URL_LABEL = { upwork: 'Відкрити оголошення', linkedin: 'Відкрити профіль' };

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    try { return document.execCommand('copy'); } catch { return false; } finally { ta.remove(); }
  }
}

function LeadMed({ lead, s = 42 }) {
  return <Med s={s} p={lead.score == null ? 30 : lead.verdict === 'no' ? 100 : lead.score} tone={toneOfVerdict(lead.verdict)}>{lead.score == null ? <Ic n="clock" /> : lead.verdict === 'no' ? <Ic n="lock" /> : ini(lead.name)}</Med>;
}
function LeadRow({ lead, drafts, onOpen }) {
  const c = capsuleOf(lead, drafts);
  return (
    <button type="button" className="gr-lead" onClick={() => onOpen(lead)}>
      <LeadMed lead={lead} />
      <span className="t"><b>{lead.name}</b><small>{[lead.country, SOURCE_LABEL[lead.source], lead.score != null && lead.verdict !== 'no' ? `підходить на ${lead.score}%` : null].filter(Boolean).join(' · ')}</small><span className="cp"><Cap tone={c.tone}>{c.label}</Cap></span></span>
    </button>
  );
}

// a sheet over the window: Esc closes it (and the window below keeps open), focus goes into it
function Sheet({ onClose, side = false, label, children }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.querySelector('button, input, textarea')?.focus(); }, []);
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; document.addEventListener('keydown', k, true); return () => document.removeEventListener('keydown', k, true); }, [onClose]);
  return <div className={'gr-ov' + (side ? ' side' : '')} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} className="gr-sheet" role="dialog" aria-modal="true" aria-label={label}>{children}</div></div>;
}
const SheetHead = ({ med, title, sub, onClose }) => <div className="gr-sh">{med}<div><h3>{title}</h3>{sub && <div className="small muted">{sub}</div>}</div><button type="button" className="x" onClick={onClose} aria-label="Закрити">×</button></div>;

// what the lead is: the score in plain words, what the code read on the site, the case
function LeadFacts({ lead }) {
  const finding = (lead.findings || []).find((f) => f.id === lead.finding_id);
  const c = lead.case_key ? CASES[lead.case_key] : null;
  return (
    <>
      {lead.score != null && lead.verdict !== 'no' && <div className="row"><Med s={56} p={lead.score} tone={toneOfVerdict(lead.verdict)}>{lead.score}</Med><div><b style={{ fontSize: 15 }}>Підходить на {lead.score} із 100</b><div className="small muted">Оцінку рахує код за нашими правилами, не модель</div></div></div>}
      {lead.verdict === 'no' && <div className="gr-note bad">{lead.reject_reason || 'Не підходить за нашими правилами.'}</div>}
      {(lead.score_parts || []).length > 0 && <ul className="gr-why">{lead.score_parts.map((p) => <li key={p.key} className={p.good ? '' : 'no'}><Ic n={p.good ? 'check' : 'clock'} /><span>{p.label}</span></li>)}</ul>}
      {(lead.flags || []).map((f, i) => <div key={i} className="gr-note warn">{f}</div>)}
      {(lead.missing || []).length > 0 && <div className="small muted">Невідомо: {lead.missing.join(', ')}.</div>}
      {finding && <div className="gr-note">Що перевірено на сайті: {findingText(finding, 'uk')}.</div>}
      {lead.status !== 'new' && lead.verdict !== 'no' && (c ? <div className="small"><span className="muted">Кейс у листі:</span> {c.client}: {caseFacts(c, 'uk')}</div> : <div className="gr-note warn">Опублікованого кейса для цієї ніші немає. Агент не підбирає чужий і каже про це чесно.</div>)}
    </>
  );
}

// one text waiting for the person: read it, change it, approve it (copied to the clipboard) or skip it
function DraftView({ draft, lead, busy, onApprove, onSkip }) {
  const [text, setText] = useState(draft.body);
  const [editing, setEditing] = useState(false);
  const finding = (lead.findings || []).find((f) => f.id === lead.finding_id) || null;
  const lang = draft.lang || languageFor({ country: lead.country, leadLanguage: lead.language });
  const edited = text !== draft.body;
  // an unchanged text keeps the verdict of the server (it knew the words of the lead); an edited one is checked here, and the numbers of an incoming message cannot be checked here
  const issues = useMemo(() => {
    if (!edited) return draft.issues || [];
    const r = checkDraft(stripFooter(text), { caseKey: draft.case_key, allowedText: allowedQuotes({ finding, lang, leadText: lead.raw_text }), channel: draft.channel, kind: draft.kind });
    return r.issues.filter((i) => !(draft.kind === 'reply' && i.code === 'numbers'));
  }, [edited, text, draft, finding, lang, lead.raw_text]);
  const rule = levelsFor(actionOfChannel(draft.channel)).locked[1];
  return (
    <>
      <div className="gr-q">{draft.kind === 'reply' ? 'Відповідь клієнту' : draft.kind === 'followup' ? 'Нагадування' : 'Лист'} {lang === 'uk' ? 'українською' : 'англійською'}, {edited ? 'змінено вами' : `${draft.words} ${pl(draft.words, 'слово', 'слова', 'слів')}`}</div>
      {draft.subject && <div className="small"><span className="muted">Тема:</span> {draft.subject}</div>}
      {editing ? <textarea className="gr-txt" value={text} onChange={(e) => setText(e.target.value)} aria-label="Текст повідомлення" /> : <div className="gr-txt">{text}</div>}
      {issues.map((i, k) => <div key={k} className="gr-note bad">{i.text}</div>)}
      {rule && <div className="gr-note warn">{rule}</div>}
      <div className="row">
        <button type="button" className="gr-btn p" disabled={busy || issues.length > 0} onClick={() => onApprove(text, edited)} title={issues.length ? 'Виправте текст або пропустіть' : undefined}>Затвердити й скопіювати</button>
        <button type="button" className="gr-btn" onClick={() => setEditing((v) => !v)}>{editing ? 'Готово' : 'Змінити текст'}</button>
        <button type="button" className="gr-btn" disabled={busy} onClick={onSkip}>Пропустити</button>
      </div>
    </>
  );
}

export default function Growth() {
  const { email } = useAuth();
  const [api, setApi] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [sheet, setSheet] = useState(null); // { type: 'review'|'lead'|'list'|'agent'|'budget'|'add', ... }
  const [session, setSession] = useState({ total: 0, done: 0 });
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => { pickApi().then(setApi); }, []);
  const load = useCallback(async () => { if (!api) return null; try { const d = await api.load(); setData(d); setErr(''); return d; } catch (e) { setErr(e.message || String(e)); return null; } }, [api]);
  useEffect(() => { load(); }, [load]);

  const leads = useMemo(() => data?.leads || [], [data]), drafts = useMemo(() => data?.drafts || [], [data]), settings = data?.settings;
  const queue = useMemo(() => buildQueue({ leads, drafts }), [leads, drafts]);
  const leadsById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const stats = useMemo(() => monthStats(leads), [leads]);
  const closeSheet = useCallback(() => setSheet(null), []);

  // runs one action with the busy mark and the error line, then reloads the data; returns the new data
  async function act(label, fn) {
    setBusy(label); setErr(''); setNote('');
    try { await fn(); return await load(); } catch (e) { setErr(e.message || String(e)); return null; } finally { setBusy(''); }
  }
  const openReview = (key = null) => { setSession({ total: queue.length, done: 0 }); setSheet({ type: 'review', key }); };
  const openLead = (lead) => { const item = queue.find((q) => q.leadId === lead.id); if (item) openReview(item.key); else setSheet({ type: 'lead', id: lead.id }); };
  const afterDecision = (d) => { setSession((s) => ({ ...s, done: s.done + 1 })); setSheet((s) => (d && buildQueue(d).length ? { ...s, key: null } : null)); };

  if (!api || (!data && !err)) return <div className="gr"><div className="gr-load">Завантаження…</div></div>;
  if (!data) {
    const missing = /gr_|relation|schema cache|does not exist/i.test(err);
    return <div className="gr"><div className={'gr-note ' + (missing ? 'warn' : 'bad')} role="alert">{missing ? 'Таблиці внутрішньої команди ще не створено: потрібно застосувати міграцію 20261076. Після цього вікно запрацює.' : err}</div></div>;
  }

  const stopped = !!settings?.stopped, budget = Number(settings?.monthly_budget_usd || 30), spent = Number(data.spent || 0);
  const active = leads.filter((l) => !ENDED.includes(l.status));
  const ended = leads.filter((l) => ENDED.includes(l.status));
  const kinds = { lead: queue.filter((q) => q.kind === 'lead').length, letter: queue.filter((q) => q.kind === 'letter').length, reply: queue.filter((q) => q.kind === 'reply').length };
  const pending = leads.filter((l) => l.status === 'new').length;
  const decided = drafts.filter((d) => ['approved', 'sent'].includes(d.status));
  const edited = decided.filter((d) => d.edited).length;

  // ---- the parts of the page
  const hero = queue.length > 0 ? (
    <div className="gr-hero">
      <Med s={76} tone="warn">{queue.length}</Med>
      <div className="tx"><h2>{queue.length} {pl(queue.length, 'рішення чекає', 'рішення чекають', 'рішень чекають')} на вас</h2>
        <p>{[kinds.lead && `ліди: ${kinds.lead}`, kinds.letter && `листи: ${kinds.letter}`, kinds.reply && `відповіді клієнтам: ${kinds.reply}`].filter(Boolean).join(', ')}. Це близько {Math.max(1, queue.length)} {pl(Math.max(1, queue.length), 'хвилини', 'хвилин', 'хвилин')}. Нічого не піде без вашого «так».</p></div>
      <div className="acts"><button type="button" className="gr-btn w" onClick={() => openReview()}>Розібрати по черзі</button><button type="button" className="gr-btn g" onClick={() => setSheet({ type: 'list' })}>Подивитись списком</button></div>
    </div>
  ) : leads.length === 0 ? (
    <div className="gr-hero"><Med s={76}><Ic n="lead" /></Med><div className="tx"><h2>Додайте перший лід</h2><p>Вставте посилання на оголошення на Upwork, профіль у LinkedIn або текст заявки. Аналітик прочитає сайт, код оцінить лід, а Автор підготує лист.</p></div><div className="acts"><button type="button" className="gr-btn w" onClick={() => setSheet({ type: 'add' })}>+ Додати лід</button></div></div>
  ) : (
    <div className="gr-hero calm"><Med s={76} tone="ok"><Ic n="check" /></Med><div className="tx"><h2>Усе розібрано</h2><p>Нових рішень немає. Агенти працюють, нові ліди й тексти з'являться тут.</p></div></div>
  );

  const fitShare = stats.newThisMonth ? Math.round((leads.filter((l) => String(l.created_at) >= new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString() && ['ok', 'ask'].includes(l.verdict)).length / stats.newThisMonth) * 100) : 0;
  const kpis = (
    <div className="gr-kpis">
      <div className="gr-kpi"><Med s={48} p={fitShare} tone="ok">{stats.newThisMonth}</Med><div><b>{stats.newThisMonth} {pl(stats.newThisMonth, 'новий лід', 'нові ліди', 'нових лідів')}</b><span>цього місяця, підходять {fitShare}%</span></div></div>
      <div className="gr-kpi"><Med s={48} p={stats.sent ? Math.round((stats.replied / stats.sent) * 100) : 0}>{stats.replied}</Med><div><b>{stats.replied} {pl(stats.replied, 'відповідь', 'відповіді', 'відповідей')}</b><span>на {stats.sent} {pl(stats.sent, 'надісланий лист', 'надіслані листи', 'надісланих листів')}</span></div></div>
      <button type="button" className="gr-kpi" style={{ border: 0, textAlign: 'left', color: 'inherit', cursor: 'pointer' }} onClick={() => setSheet({ type: 'budget' })}><Med s={48} p={Math.min(100, Math.round((spent / budget) * 100))} tone={spent / budget >= 0.8 ? 'warn' : ''}><Ic n="clock" /></Med><div><b>{money(spent)}</b><span>із {money(budget)} за місяць</span></div></button>
    </div>
  );

  const leadsBox = (
    <section className="gr-box">
      <div className="gr-bh"><Med><Ic n="lead" /></Med><div><h3>Нові клієнти</h3><small>{active.length} {pl(active.length, 'лід', 'ліди', 'лідів')} у роботі</small></div></div>
      <div className="gr-list">{active.slice(0, 6).map((l) => <LeadRow key={l.id} lead={l} drafts={drafts} onOpen={openLead} />)}{active.length === 0 && <div className="gr-empty">Лідів у роботі немає.</div>}</div>
      {ended.length > 0 && <details><summary className="small muted" style={{ cursor: 'pointer' }}>Відхилені й пропущені: {ended.length}</summary><div className="gr-list" style={{ marginTop: 8 }}>{ended.slice(0, 10).map((l) => <LeadRow key={l.id} lead={l} drafts={drafts} onOpen={openLead} />)}</div></details>}
      <div className="row"><button type="button" className="gr-btn sm" onClick={() => setSheet({ type: 'add' })}>+ Додати лід</button><span className="small muted">Посилання на оголошення, профіль або текст заявки.</span></div>
    </section>
  );
  const siteBox = (
    <section className="gr-box">
      <div className="gr-bh"><Med><Ic n="globe" /></Med><div><h3>Наш сайт</h3><small>Ще не підключено · наступний крок</small></div></div>
      <div className="gr-empty">Аналітик почне стежити за сайтом Mon'Archi: відвідуваність, запити з Google і одна річ на тиждень, яку варто виправити. Автор запропонує тексти, зміни вносите ви.</div>
    </section>
  );
  const socBox = (
    <section className="gr-box">
      <div className="gr-bh"><Med><Ic n="share" /></Med><div><h3>Соцмережі</h3><small>Ще не підключено · після продажів і сайту</small></div></div>
      <div className="gr-empty">План тижня й пости з'являться тут. Для публікації потрібні доступи до Instagram, Facebook і LinkedIn: заявки варто подати вже зараз, їх схвалюють тижнями.</div>
    </section>
  );
  const team = [
    { name: 'Аналітик', icon: 'eye', role: 'Тільки читає', tone: pending ? 'warn' : 'ok', text: pending ? `Оцінює ${pending} ${pl(pending, 'лід', 'ліди', 'лідів')}…` : `Оцінив ${leads.filter((l) => l.score != null).length} ${pl(leads.filter((l) => l.score != null).length, 'лід', 'ліди', 'лідів')}.` },
    { name: 'Автор', icon: 'pen', role: 'Готує чернетки', tone: 'ok', text: `Написав ${drafts.length} ${pl(drafts.length, 'текст', 'тексти', 'текстів')}.${decided.length ? ` Ви редагували ${edited} із ${decided.length}.` : ''}` },
    { name: 'Комунікатор', icon: 'chat', role: 'Спілкується з людьми', tone: queue.length ? 'warn' : 'ok', text: queue.length ? `Чекає вашого рішення: ${queue.length}.` : 'Усе, що можна, вже підготовлено.' },
  ];
  const teamBox = (
    <>
      <div className="gr-bh"><Med s={40}><Ic n="star" /></Med><div><h3>Команда</h3><small>Три агенти. Вони готують, ви вирішуєте.</small></div></div>
      <div className="gr-agents">{team.map((a, i) => <div key={a.name} className="gr-agent"><div className="top"><Med s={52} tone={a.tone}><Ic n={a.icon} /></Med><div><b>{a.name}</b><Cap tone="mute">{a.role}</Cap></div></div><p>{a.text}</p><div className="row"><button type="button" className="gr-btn sm" onClick={() => setSheet({ type: 'agent', i })}>Налаштувати</button></div></div>)}</div>
    </>
  );

  // ---- the sheets
  const reviewItem = sheet?.type === 'review' ? (queue.find((q) => q.key === sheet.key) || queue[0] || null) : null;
  const reviewSheet = sheet?.type === 'review' && (
    <Sheet onClose={closeSheet} label="Рішення">
      {!reviewItem ? (
        <><SheetHead med={<Med s={52} tone="ok"><Ic n="check" /></Med>} title="Усе розібрано" sub="Нових рішень немає" onClose={closeSheet} /><div className="row"><button type="button" className="gr-btn p" onClick={closeSheet}>Закрити</button></div></>
      ) : (() => {
        const lead = leadsById.get(reviewItem.leadId);
        const draft = reviewItem.draftId ? drafts.find((d) => d.id === reviewItem.draftId) : null;
        const total = Math.max(session.total, session.done + queue.length);
        return (
          <>
            <SheetHead med={<LeadMed lead={lead} s={52} />} title={lead.name} sub={[lead.country, SOURCE_LABEL[lead.source]].filter(Boolean).join(' · ')} onClose={closeSheet} />
            <div className="small muted">Рішення {Math.min(session.done + 1, total)} з {total}</div>
            <div className="gr-dots">{Array.from({ length: total }, (_, k) => <i key={k} className={k < session.done ? 'done' : k === session.done ? 'on' : ''} />)}</div>
            <LeadFacts lead={lead} />
            {err && <div className="gr-note bad" role="alert">{err}</div>}
            {reviewItem.kind === 'lead' && (
              <>
                <div className="gr-q">Писати цьому ліду?</div><div className="small muted">Оцінка посередині, тому рішення за вами.</div>
                <div className="row">
                  <button type="button" className="gr-btn p" disabled={!!busy} onClick={async () => { const d = await act('Автор пише лист…', () => api.approveLead(lead.id)); setSession((s) => ({ ...s, total: s.total + 1 })); afterDecision(d); }}>{busy ? <><span className="gr-spin" /> {busy}</> : 'Так, написати'}</button>
                  <button type="button" className="gr-btn" disabled={!!busy} onClick={async () => afterDecision(await act('', () => api.endLead(lead.id, 'skipped', email)))}>Пропустити</button>
                  <button type="button" className="gr-btn danger" disabled={!!busy} onClick={async () => afterDecision(await act('', () => api.endLead(lead.id, 'rejected', email)))}>Відхилити</button>
                </div>
              </>
            )}
            {draft && (
              <DraftView key={draft.id + ':' + draft.body} draft={draft} lead={lead} busy={!!busy}
                onApprove={async (body, edited) => { const ok = await copyText(body); const d = await act('', () => api.approveDraft({ draft, body, edited, by: email, settings })); setNote(ok ? 'Текст скопійовано. Надішліть його й позначте лід як «надіслано».' : 'Не вдалося скопіювати автоматично: текст є в картці ліда.'); afterDecision(d); }}
                onSkip={async () => afterDecision(await act('', () => api.skipDraft({ draft, by: email, settings })))} />
            )}
          </>
        );
      })()}
    </Sheet>
  );

  const leadSheetLead = sheet?.type === 'lead' ? leadsById.get(sheet.id) : null;
  const leadSheet = leadSheetLead && (() => {
    const lead = leadSheetLead;
    const mine = drafts.filter((d) => d.lead_id === lead.id);
    const approved = mine.find((d) => d.status === 'approved');
    return (
      <Sheet onClose={closeSheet} label={lead.name}>
        <SheetHead med={<LeadMed lead={lead} s={52} />} title={lead.name} sub={[lead.country, SOURCE_LABEL[lead.source], capsuleOf(lead, drafts).label].filter(Boolean).join(' · ')} onClose={closeSheet} />
        <LeadFacts lead={lead} />
        {lead.error && <div className="gr-note bad">{lead.error}</div>}
        {err && <div className="gr-note bad" role="alert">{err}</div>}
        {(lead.source_url || lead.website) && <div className="small">{lead.source_url && <a className="muted" href={lead.source_url} target="_blank" rel="noopener noreferrer">{SOURCE_URL_LABEL[lead.source] || 'Джерело'}</a>}{lead.source_url && lead.website && ' · '}{lead.website && <a className="muted" href={lead.website} target="_blank" rel="noopener noreferrer">Сайт ліда</a>}</div>}
        {approved && <><div className="gr-q">Затверджений текст</div><div className="gr-txt">{approved.body}</div></>}
        <div className="row">
          {lead.status === 'failed' && <button type="button" className="gr-btn p" disabled={!!busy} onClick={async () => { await act('Аналіз…', () => api.run(lead.id)); }}>{busy ? <span className="gr-spin" /> : 'Спробувати ще раз'}</button>}
          {lead.status === 'drafting' && <button type="button" className="gr-btn p" disabled={!!busy} onClick={async () => { await act('Автор пише…', () => api.run(lead.id)); }}>Дописати лист</button>}
          {lead.status === 'ready' && approved && <><button type="button" className="gr-btn" onClick={async () => setNote((await copyText(approved.body)) ? 'Текст скопійовано.' : 'Не вдалося скопіювати.')}>Скопіювати текст</button><button type="button" className="gr-btn p" disabled={!!busy} onClick={async () => { await act('', () => api.markSent({ lead, draft: approved })); closeSheet(); }}>Позначити як надіслане</button></>}
          {lead.status === 'sent' && <button type="button" className="gr-btn p" onClick={() => setSheet({ type: 'reply', id: lead.id })}>Лід відповів</button>}
          {lead.status === 'replied' && !queue.some((q) => q.leadId === lead.id) && <><button type="button" className="gr-btn" onClick={() => setSheet({ type: 'reply', id: lead.id })}>Підготувати відповідь</button><button type="button" className="gr-btn p" disabled={!!busy} onClick={async () => { await act('', () => api.markWon(lead.id)); closeSheet(); }}>Угоду виграно</button></>}
          {lead.status === 'won' && <span className="small muted">Передачу виграної угоди в «Швидкий старт» проєкту зробимо наступним кроком.</span>}
        </div>
      </Sheet>
    );
  })();

  const replySheet = sheet?.type === 'reply' && leadsById.get(sheet.id) && (
    <ReplySheet lead={leadsById.get(sheet.id)} busy={busy} err={err} onClose={closeSheet} onSend={async (incoming) => { const lead = leadsById.get(sheet.id); if (lead.status === 'sent') await api.markReplied(lead.id); const d = await act('Автор пише відповідь…', () => api.makeDraft(lead.id, 'reply', incoming)); if (d) setSheet(null); }} />
  );

  const listSheet = sheet?.type === 'list' && (
    <Sheet onClose={closeSheet} label="Усі рішення">
      <SheetHead med={<Med s={48} tone="warn">{queue.length}</Med>} title="Усі рішення" sub="Натисніть, щоб відкрити" onClose={closeSheet} />
      <div className="gr-list">{queue.map((q) => { const l = leadsById.get(q.leadId); return <button key={q.key} type="button" className="gr-lead" onClick={() => { setSession({ total: queue.length, done: 0 }); setSheet({ type: 'review', key: q.key }); }}><LeadMed lead={l} /><span className="t"><b>{q.title}</b><small>{[l.country, SOURCE_LABEL[l.source]].filter(Boolean).join(' · ')}</small><span className="cp"><Cap tone={q.kind === 'lead' ? 'warn' : q.kind === 'reply' ? 'ok' : ''}>{q.sub}</Cap></span></span></button>; })}{queue.length === 0 && <div className="gr-empty">Рішень немає.</div>}</div>
    </Sheet>
  );

  const agentSheet = sheet?.type === 'agent' && (
    <Sheet side onClose={closeSheet} label={team[sheet.i].name}>
      <SheetHead med={<Med s={52} tone={team[sheet.i].tone}><Ic n={team[sheet.i].icon} /></Med>} title={team[sheet.i].name} sub={team[sheet.i].role} onClose={closeSheet} />
      {sheet.i < 2 ? (
        <><p className="muted">{sheet.i === 0 ? 'Аналітик нічого не надсилає й не змінює: тільки читає сайти й оцінює ліди.' : 'Автор тільки готує тексти. Нічого не надсилає сам.'}</p><div className="gr-note">Тут налаштувань немає: рішення завжди за вами.</div></>
      ) : (
        <>
          <p className="muted">Для кожної дії окремо оберіть, хто надсилає. Поки відправка не підключена, надсилаєте ви: агент готує текст.</p>
          {ACTIONS.map((a) => {
            const cfg = settings?.autonomy?.[a.key] || emptyRecord();
            const lv = levelsFor(a, { level: cfg.level || 0, record: cfg });
            return (
              <div key={a.key}>
                <div className="gr-q">{a.label} <span className="small muted">· {a.channel}</span></div>
                <div className="gr-opts" role="radiogroup" aria-label={a.label}>
                  {LEVELS.map((o) => { const locked = lv.locked[o.n]; return (
                    <button key={o.n} type="button" role="radio" className="gr-opt" aria-checked={lv.level === o.n} aria-disabled={!!locked} onClick={async () => { if (!locked && lv.level !== o.n) await act('', () => api.setLevel({ key: a.key, level: o.n, settings })); }}>
                      <Med s={38} plain><Ic n={locked ? 'lock' : o.n === 0 ? 'pen' : o.n === 1 ? 'send' : 'star'} /></Med><span><b>{o.label}</b><small>{locked || o.hint}</small></span>
                    </button>); })}
                </div>
                {a.maxLevel >= 2 && <div className="small muted" style={{ marginTop: 6 }}>Схвалено поспіль без правок: {Math.min(cfg.streak || 0, UNLOCK_AFTER)} із {UNLOCK_AFTER}.</div>}
              </div>
            );
          })}
          <div className="gr-note warn">Ціни, знижки, договірні умови й скарги завжди тільки з вашим підтвердженням, незалежно від налаштувань.</div>
        </>
      )}
    </Sheet>
  );

  const budgetSheet = sheet?.type === 'budget' && <BudgetSheet spent={spent} budget={budget} onClose={closeSheet} onSave={async (v) => { await act('', () => api.setBudget(v)); closeSheet(); }} />;
  const addSheet = sheet?.type === 'add' && (
    <AddSheet busy={busy} err={err} onClose={closeSheet}
      onAdd={async (payload) => { let lead = null; const d = await act('Аналітик читає лід і сайт. Це може зайняти до хвилини…', async () => { lead = (await api.add(payload)).lead; }); if (!d || !lead) return; const q = buildQueue(d).find((x) => x.leadId === lead.id); if (q) { setSession({ total: buildQueue(d).length, done: 0 }); setSheet({ type: 'review', key: q.key }); } else setSheet({ type: 'lead', id: lead.id }); }} />
  );

  return (
    <div className="gr">
      {confirmDialog}
      <div className="gr-head">
        <div className="ttl"><Med s={52}><Ic n="growth" /></Med><div><h2>Наше зростання</h2><div className="sub">Нові клієнти, наш сайт і соцмережі. Окрема команда, не змішується з клієнтськими проєктами.</div></div></div>
        <div className="row">
          <button type="button" className="gr-pillbtn" onClick={() => setSheet({ type: 'budget' })}><Med s={28} p={Math.min(100, Math.round((spent / budget) * 100))} />{money(spent)} із {money(budget)} за місяць</button>
          <button type="button" className={'gr-btn ' + (stopped ? 'p' : 'danger')} disabled={!!busy} onClick={async () => { if (!stopped && !(await confirm({ title: 'Зупинити внутрішню команду?', body: 'Нові ліди не оцінюватимуться, тексти не писатимуться. Клієнтські проєкти це не зачепить.', confirmLabel: 'Зупинити', danger: true }))) return; await act('', () => api.setStopped(!stopped, email)); }}>{stopped ? 'Відновити команду' : 'Зупинити команду'}</button>
        </div>
      </div>
      {stopped && <div className="gr-note warn" role="alert">Команду зупинено: нові кроки не запускаються, нічого не оцінюється й не пишеться.</div>}
      {note && <div className="gr-note" role="status">{note}</div>}
      {err && !sheet && <div className="gr-note bad" role="alert">{err}</div>}
      {hero}
      {kpis}
      <div className="gr-cols">{leadsBox}{siteBox}{socBox}</div>
      {teamBox}
      {reviewSheet}{leadSheet}{replySheet}{listSheet}{agentSheet}{budgetSheet}{addSheet}
    </div>
  );
}

function AddSheet({ busy, err, onClose, onAdd }) {
  const [text, setText] = useState('');
  const [website, setWebsite] = useState('');
  return (
    <Sheet onClose={busy ? () => {} : onClose} label="Додати лід">
      <SheetHead med={<Med s={48}><Ic n="lead" /></Med>} title="Додати лід" sub="Агент сам збере дані й оцінить" onClose={busy ? () => {} : onClose} />
      <label className="small muted" htmlFor="gr-add-text">Посилання на оголошення Upwork, профіль LinkedIn або текст заявки</label>
      <textarea id="gr-add-text" className="gr-txt" value={text} onChange={(e) => setText(e.target.value)} placeholder="Вставте сюди" disabled={!!busy} />
      <label className="small muted" htmlFor="gr-add-site">Сайт компанії, якщо знаєте (необов'язково)</label>
      <input id="gr-add-site" className="gr-txt" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" disabled={!!busy} />
      {err && <div className="gr-note bad" role="alert">{err}</div>}
      {busy && <div className="gr-note"><span className="gr-spin" /> {busy}</div>}
      <div className="row"><button type="button" className="gr-btn p" disabled={!!busy || (text.trim().length < 8 && !website.trim())} onClick={() => onAdd({ text: text.trim(), website: website.trim() })}>Додати й оцінити</button></div>
    </Sheet>
  );
}
function ReplySheet({ lead, busy, err, onClose, onSend }) {
  const [text, setText] = useState('');
  return (
    <Sheet onClose={busy ? () => {} : onClose} label="Відповідь ліда">
      <SheetHead med={<LeadMed lead={lead} s={48} />} title={`${lead.name}: що відповіли`} sub="Автор підготує відповідь" onClose={busy ? () => {} : onClose} />
      <label className="small muted" htmlFor="gr-reply-text">Вставте текст відповіді ліда</label>
      <textarea id="gr-reply-text" className="gr-txt" value={text} onChange={(e) => setText(e.target.value)} disabled={!!busy} />
      {err && <div className="gr-note bad" role="alert">{err}</div>}
      {busy && <div className="gr-note"><span className="gr-spin" /> {busy}</div>}
      <div className="row"><button type="button" className="gr-btn p" disabled={!!busy || text.trim().length < 3} onClick={() => onSend(text.trim())}>Підготувати відповідь</button></div>
    </Sheet>
  );
}
function BudgetSheet({ spent, budget, onClose, onSave }) {
  const [v, setV] = useState(String(budget));
  const n = Number(v);
  return (
    <Sheet onClose={onClose} label="Бюджет і ліміти">
      <SheetHead med={<Med s={48} p={Math.min(100, Math.round((spent / budget) * 100))} />} title="Бюджет і ліміти" sub={`${money(spent)} із ${money(budget)} за місяць`} onClose={onClose} />
      <div className="gr-bar" role="img" aria-label="Витрачено за місяць"><i style={{ width: Math.min(100, (spent / budget) * 100) + '%' }} /></div>
      <p className="small muted">Це моделі й картинки внутрішньої команди. Після ліміту команда зупиняється сама. Клієнтські запуски рахуються окремо й завжди йдуть першими.</p>
      <ul className="gr-why">
        <li><Ic n="check" /><span>Листи: до 10 на день у перший тиждень, далі до 20–30</span></li>
        <li><Ic n="check" /><span>LinkedIn: готуємо до 15 на день, надсилаєте ви</span></li>
        <li><Ic n="check" /><span>Upwork: до 5 відгуків на день (кожен коштує Connects)</span></li>
        <li><Ic n="check" /><span>Тихі години: з 20:00 до 08:00 за часом ліда</span></li>
      </ul>
      <label className="small muted" htmlFor="gr-budget">Бюджет на місяць, $</label>
      <input id="gr-budget" className="gr-txt" type="number" min="0" step="1" value={v} onChange={(e) => setV(e.target.value)} />
      <div className="row"><button type="button" className="gr-btn p" disabled={!Number.isFinite(n) || n < 0 || n === budget} onClick={() => onSave(n)}>Зберегти</button></div>
    </Sheet>
  );
}
