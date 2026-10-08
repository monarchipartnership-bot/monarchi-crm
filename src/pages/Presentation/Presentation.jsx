import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Builder from '../../components/Presentation/Builder';
import useDeckHistory from '../../components/Presentation/useDeckHistory';
import { buildDeckFromReport } from '../../lib/presentation/buildDeck';
import { emptyDeck, ensureDeck } from '../../lib/presentation/deckModel';
import { setMeta } from '../../lib/presentation/deckOps';
import { fontsReady } from '../../lib/presentation/fonts';
import { fetchDeck, saveDeck } from '../../lib/api/projectDecks';
import { fetchProjectReports } from '../../lib/api/projectReportStore';
import { fetchProjectById } from '../../lib/api/projects';
import { fetchCustomMetrics } from '../../lib/api/projectReportStore';
import { periodFromPicker } from '../../lib/periodReport';
import { computeWeeksForMonth, defaultWeekIndexFor, isoDate } from '../../lib/dateHelpers';
import { useAuth } from '../../contexts/AuthContext';
import '../../styles/presentationSlides.css';
import '../../styles/presentationBuilder.css';

function initialSel(params) {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let weekIndex = defaultWeekIndexFor(computeWeeksForMonth(year, month));
  const periodType = params.get('type') === 'monthly' ? 'monthly' : 'weekly';
  const start = params.get('start');
  if (/^\d{4}-\d{2}-\d{2}$/.test(start || '')) {
    year = Number(start.slice(0, 4));
    month = Number(start.slice(5, 7));
    const weeks = computeWeeksForMonth(year, month);
    weekIndex = weeks.find((w) => isoDate(w.start.getFullYear(), w.start.getMonth() + 1, w.start.getDate()) === start)?.index || 1;
  }
  return {
    projectId: params.get('project') || null, periodType, year, month, weekIndex,
    platform: params.get('platform') === 'google' ? 'google' : 'meta', lang: 'en',
  };
}

// «Презентація»: the client deck built from a saved weekly / monthly report, edited slide by
// slide, exported to PDF or PPTX and saved with the report.
export default function Presentation() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { email } = useAuth();
  const [sel, setSel] = useState(() => initialSel(params));
  const api = useDeckHistory(emptyDeck());
  const { deck, update, reset } = api;

  const [report, setReport] = useState(null);
  const [reportState, setReportState] = useState('idle'); // idle | loading | ready | none
  const [project, setProject] = useState(null);
  const [custom, setCustom] = useState([]);
  const [building, setBuilding] = useState(false);
  const [message, setMessage] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [savedAt, setSavedAt] = useState(null);
  const savedDeck = useRef(null);
  const loadKey = useRef('');
  const loadedSel = useRef(sel);
  const period = useMemo(() => periodFromPicker(sel.periodType, sel), [sel]);
  const dirty = deck.slides.length > 0 && deck !== savedDeck.current;

  // Report + saved deck for the picked project, period and platform.
  useEffect(() => {
    let off = false;
    if (!sel.projectId) { setReport(null); setReportState('idle'); setProject(null); reset(emptyDeck()); savedDeck.current = null; return undefined; }
    const key = `${sel.projectId}|${sel.periodType}|${period.start}|${sel.platform}`;
    if (loadKey.current === key) return undefined;
    if (dirty && !window.confirm('Є незбережені зміни в презентації. Перейти без збереження?')) { setSel(loadedSel.current); return undefined; }
    loadKey.current = key;
    loadedSel.current = sel;
    setReportState('loading');
    setMessage('');
    (async () => {
      try {
        const [rows, proj, cm, saved] = await Promise.all([
          fetchProjectReports(sel.projectId, sel.periodType), fetchProjectById(sel.projectId), fetchCustomMetrics(sel.projectId),
          fetchDeck(sel.projectId, sel.periodType, period.start, sel.platform),
        ]);
        if (off) return;
        const row = rows.find((r) => r.period_start === period.start) || null;
        setProject(proj);
        setCustom(cm);
        setReport(row);
        setReportState(row ? 'ready' : 'none');
        if (saved?.deck?.slides?.length) {
          const d = ensureDeck(saved.deck);
          reset(d);
          savedDeck.current = d;
          setSavedAt(saved.updated_at);
        } else {
          const d = emptyDeck({ platform: sel.platform, lang: sel.lang });
          reset(d);
          savedDeck.current = d;
          setSavedAt(null);
        }
        // A report that has data for only one platform: switch to it.
        const have = row ? Object.keys(row.data?.platforms || {}) : [];
        if (row && have.length && !have.includes(sel.platform)) setSel((s) => ({ ...s, platform: have[0] }));
      } catch (e) {
        if (!off) { setReportState('none'); setMessage(e.message || 'Не вдалося завантажити дані.'); }
      }
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.projectId, sel.periodType, sel.platform, period.start]);

  const platforms = report ? Object.keys(report.data?.platforms || {}) : null;

  async function build() {
    if (!report || !project) return;
    if (deck.slides.length && !window.confirm('Усі слайди буде замінено новою презентацією зі звіту, включно з ручними правками. Це можна скасувати кнопкою «Скасувати». Продовжити?')) return;
    setBuilding(true);
    setMessage('');
    try {
      const next = buildDeckFromReport({
        project, report, platform: sel.platform, style: deck.meta.style, lang: deck.slides.length ? deck.meta.lang : sel.lang, custom,
      });
      if (!next.slides.length) { setMessage('У звіті немає даних для цієї платформи.'); return; }
      update(() => next);
    } catch (e) {
      setMessage(e.message || 'Не вдалося створити презентацію.');
    } finally {
      setBuilding(false);
    }
  }

  const save = useCallback(async () => {
    if (!deck.slides.length || !sel.projectId) return;
    setSaveBusy(true);
    try {
      const row = await saveDeck({
        projectId: Number(sel.projectId), reportId: report?.id || deck.meta.reportId, periodType: sel.periodType,
        periodStart: period.start, periodEnd: period.end, platform: sel.platform, style: deck.meta.style, lang: deck.meta.lang,
        deck, createdBy: email,
      });
      savedDeck.current = deck;
      setSavedAt(row.updated_at);
      setMessage('');
    } catch (e) {
      setMessage((e.message || 'Не вдалося зберегти.') + ' Якщо це перше збереження, перевірте, що застосовано міграцію 20261009000000.');
    } finally {
      setSaveBusy(false);
    }
  }, [deck, sel, period, report, email]);

  // Autosave a few seconds after the last change.
  useEffect(() => {
    if (!dirty || saveBusy || savedAt == null) return undefined;
    const t = setTimeout(save, 3000);
    return () => clearTimeout(t);
  }, [dirty, deck, saveBusy, savedAt, save]);

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function exportDeck(kind, opts = {}) {
    setExportBusy(true);
    setExportMessage('');
    try {
      await fontsReady();
      const name = `${(project?.name || 'presentation').replace(/[^\wЀ-ӿ-]+/g, '_')}_${period.start}_${deck.meta.platform}`;
      if (kind === 'pdf') {
        const { exportPdf } = await import('../../lib/presentation/exportPdf');
        await exportPdf(deck, name);
      } else {
        const { exportPptx } = await import('../../lib/presentation/exportPptx');
        await exportPptx(deck, name, opts);
      }
    } catch (e) {
      console.error('export failed', e);
      setExportMessage(`Не вдалося створити файл: ${e.message || 'невідома помилка'}. Презентація не втрачена, спробуйте ще раз.`);
    } finally {
      setExportBusy(false);
    }
  }

  const saveLabel = saveBusy ? 'Збереження…' : !deck.slides.length ? '' : dirty ? 'Є незбережені зміни' : savedAt ? 'Збережено' : 'Не збережено';

  const dataProps = {
    sel, setSel: (next) => setSel(next), report, reportState, platforms, building, message,
    onBuild: build, onLang: (lang) => { setSel((s) => ({ ...s, lang })); if (deck.slides.length) update((d) => setMeta(d, { lang }), 'meta:lang'); },
  };

  return (
    <div className="pres-page">
      <Builder
        api={api} dataProps={dataProps} onBack={() => navigate(-1)}
        onSave={save} saveLabel={saveLabel} saveBusy={saveBusy}
        onExport={exportDeck} exportBusy={exportBusy} exportMessage={exportMessage}
        onStyle={(style) => update((d) => setMeta(d, { style }))}
      />
    </div>
  );
}
