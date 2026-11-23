import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { acceptProposal, fetchAnsweredProposals, fetchDossier, fetchVersions, rejectProposal, saveHumanVersion } from '../../lib/api/workflow';
import { agoText, openProposals, sectionRows } from '../../lib/workflow/view';
import { Pill } from './parts';
import BriefSheet from './BriefSheet';
import UnitEconomyView from './UnitEconomyView';
import AuditView from './AuditView';
import SiteView from './SiteView';
import AudienceView from './AudienceView';
import CompetitorsView from './CompetitorsView';
import { CreativesPage, StrategyPage } from './Package';

// «Досьє» of a project (screen 2 of step A3, the variant A of the mockup): the 10 sections on the left, the chosen one on the right with its versions
// and the proposals of the agents. A person's version is never replaced by an agent: the agent can only propose.
export default function Dossier({ projectId, initialKey }) {
  const { email } = useAuth();
  const [rows, setRows] = useState(null);
  const [key, setKey] = useState(initialKey || 'brief');
  const [versions, setVersions] = useState([]);
  const [answered, setAnswered] = useState(new Set());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [viewId, setViewId] = useState(null); // an older version that is being looked at
  const [asText, setAsText] = useState(false); // a structured section can also be read as its text
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const loadRows = useCallback(async () => { try { setRows(await fetchDossier(projectId)); } catch (e) { setErr(e.message || String(e)); } }, [projectId]);
  useEffect(() => { loadRows(); }, [loadRows]);
  const list = useMemo(() => sectionRows(rows || []), [rows]);
  const sec = list.find((s) => s.key === key) || list[0];

  const loadSection = useCallback(async () => {
    if (!sec) return;
    try {
      const [v, a] = await Promise.all([fetchVersions(sec.id), fetchAnsweredProposals(projectId, sec.key)]);
      setVersions(v); setAnswered(a); setErr('');
    } catch (e) { setErr(e.message || String(e)); }
  }, [sec?.id, sec?.key, projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setEditing(false); setViewId(null); setAsText(false); setVersions([]); if (rows) loadSection(); }, [sec?.key, sec?.id, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows) return <div className="wf wf-page">{err ? <div className="wf-err" role="alert">{err}</div> : <div className="wf-load">Завантаження…</div>}</div>;

  const real = versions.filter((v) => !v.is_proposal);
  const current = real.find((v) => v.id === (rows.find((r) => r.key === sec.key)?.current_version_id)) || real[0] || null;
  const shown = viewId ? versions.find((v) => v.id === viewId) || current : current;
  const proposals = openProposals(versions, answered);
  const humanEdited = real.some((v) => v.author_kind === 'human');

  async function run(fn) { setBusy(true); setErr(''); try { await fn(); await loadRows(); await loadSection(); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); } }
  const startEdit = () => { setDraft(current?.body || ''); setEditing(true); setViewId(null); };
  const save = () => run(async () => { await saveHumanVersion(projectId, sec.key, draft, email, null, sec.key === 'competitors' ? current?.content || {} : {}); setEditing(false); });
  const restore = (v) => run(() => saveHumanVersion(projectId, sec.key, v.body, email, `Відновлено версію ${v.version}`, v.content || {}));
  const saveBrief = (text, content) => run(async () => { await saveHumanVersion(projectId, 'brief', text, email, null, content); setEditing(false); });
  const isBrief = sec.key === 'brief';
  // the sections of the Researcher have their own pages (step A4, variants B of the mockup); anything else is shown as the text
  const c = shown?.content || {};
  const kind = sec.key === 'site' && c.schema && c.findings ? 'site' : sec.key === 'audience' && c.segments ? 'audience' : sec.key === 'competitors' && c.table ? 'competitors' : sec.key === 'strategy' && c.campaigns && c.budget ? 'strategy' : sec.key === 'creatives' && c.branch ? 'creatives' : null;
  // the ads a manager confirmed live in the structured part of the section: a new human version carries them
  const saveAds = async (ads) => {
    setBusy(true);
    try { await saveHumanVersion(projectId, 'competitors', current?.body || '', email, 'Підтверджено рекламу конкурента', { ...(current?.content || {}), ads }); await loadRows(); await loadSection(); } finally { setBusy(false); }
  };

  return (
    <div className="wf wf-page wf-dos">
      <div className="wf-card" role="tablist" aria-label="Розділи досьє" aria-orientation="vertical">
        <h3>Розділи досьє</h3>
        {list.map((s) => (
          <button key={s.key} type="button" role="tab" aria-selected={s.key === sec.key} className={'wf-sec' + (s.key === sec.key ? ' on' : '')} onClick={() => setKey(s.key)}>
            <span className="n">{s.name}<small>{s.who}{s.needsReapproval ? ' · потрібен новий апрув' : ''}</small></span>
            <Pill tone={s.tone}>{s.label}</Pill>
          </button>
        ))}
      </div>

      <div className="wf-grid">
        {err && <div className="wf-err" role="alert">{err}</div>}
        <div className="wf-card">
          <div className="wf-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>{sec.name}</h3>
            {!editing && <button type="button" className="wf-btn p sm" disabled={busy} onClick={startEdit}>Редагувати</button>}
          </div>
          {isBrief ? (
            editing
              ? <BriefSheet key={'e' + (current?.id || 0)} version={current} busy={busy} onSave={saveBrief} onCancel={() => setEditing(false)} />
              : (
                <>
                  {shown && <div className="wf-src">Версія {shown.version} · {shown.author_kind === 'human' ? shown.author : 'агент'} · {agoText(shown.created_at)}{shown.id !== current?.id ? ' · це не поточна версія' : ''}</div>}
                  <BriefSheet key={'r' + (shown?.id || 0)} version={shown} readOnly />
                </>
              )
          ) : editing ? (
            <>
              <label htmlFor="wf-body" className="wf-muted" style={{ fontSize: 12.5 }}>Текст розділу (нова версія буде вашою, агент її не замінить)</label>
              <textarea id="wf-body" className="wf-ta" value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="wf-row" style={{ marginTop: 10 }}>
                <button type="button" className="wf-btn p" disabled={busy || !draft.trim() || draft === (current?.body || '')} onClick={save}>Зберегти версію</button>
                <button type="button" className="wf-btn" disabled={busy} onClick={() => setEditing(false)}>Скасувати</button>
              </div>
            </>
          ) : shown ? (
            <>
              <div className="wf-src">Версія {shown.version} · {shown.author_kind === 'human' ? shown.author : 'агент'} · {agoText(shown.created_at)}{shown.id !== current?.id ? ' · це не поточна версія' : ''}{shown.sources?.length ? ` · джерела: ${shown.sources.map((s) => (typeof s === 'string' ? s : s.title || s.url || '')).filter(Boolean).join(', ')}` : ''}</div>
              {kind && <div className="wf-row" style={{ marginBottom: 10 }}><button type="button" className={'wf-btn sm' + (!asText ? ' p' : '')} onClick={() => setAsText(false)}>Огляд</button><button type="button" className={'wf-btn sm' + (asText ? ' p' : '')} onClick={() => setAsText(true)}>Текст</button></div>}
              {kind && !asText ? (kind === 'site' ? <SiteView key={shown.id} content={shown.content} /> : kind === 'audience' ? <AudienceView key={shown.id} content={shown.content} /> : kind === 'competitors' ? <CompetitorsView key={shown.id} content={shown.content} projectId={projectId} email={email} busy={busy || shown.id !== current?.id} onSaveAds={saveAds} /> : kind === 'strategy' ? <StrategyPage key={shown.id} projectId={projectId} content={shown.content} /> : <CreativesPage key={shown.id} content={shown.content} />) :
              shown.content?.lines ? <UnitEconomyView content={shown.content} /> : shown.content?.years && shown.content?.findings ? <AuditView content={shown.content} /> : <div className="wf-doc">{shown.body || '(порожньо)'}</div>}
            </>
          ) : <div className="wf-doc wf-muted">Розділ ще порожній. {sec.who === 'Менеджер' ? 'Натисніть «Редагувати» і заповніть його.' : `Його заповнить ${sec.who}, або ви можете написати самі.`}</div>}
          {humanEdited && !editing && <div className="wf-lock">Цей розділ редагувала людина. Агент надалі лише пропонує правки й не перезаписує їх.</div>}
        </div>

        <div className="wf-grid wf-g2e">
          <div className="wf-card">
            <h3>Версії</h3>
            {real.length === 0 ? <div className="wf-empty">Версій ще немає.</div> : real.map((v) => (
              <div key={v.id} className="wf-ver">
                <span className="v">v{v.version}</span>
                <span className="w">{v.author_kind === 'human' ? v.author : 'Агент'} · {agoText(v.created_at)}{v.note ? ` · ${v.note}` : ''}</span>
                {v.id === current?.id ? <Pill tone="ok">Поточна</Pill> : (
                  <span className="wf-row">
                    <button type="button" className="wf-btn sm" onClick={() => setViewId(v.id)}>Переглянути</button>
                    <button type="button" className="wf-btn sm" disabled={busy} onClick={() => restore(v)}>Відновити</button>
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="wf-card">
            <h3>Пропозиції агента</h3>
            {proposals.length === 0 ? <div className="wf-empty">Пропозицій немає.</div> : proposals.map((p) => (
              <div key={p.id} className="wf-col" style={{ marginBottom: 12 }}>
                <div className="wf-src">Версія {p.version}{p.note ? ` · ${p.note}` : ''} · {agoText(p.created_at)}</div>
                <div className="wf-diff"><div className="r">{current?.body || '(порожньо)'}</div><div className="a">{p.body}</div></div>
                <div className="wf-row">
                  <button type="button" className="wf-btn p sm" disabled={busy} onClick={() => run(() => acceptProposal(projectId, sec.key, p, email))}>Прийняти</button>
                  <button type="button" className="wf-btn sm" disabled={busy} onClick={() => run(() => rejectProposal(projectId, sec.key, p, email))}>Відхилити</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
