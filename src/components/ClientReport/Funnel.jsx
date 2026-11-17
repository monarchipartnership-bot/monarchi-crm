import { useLayoutEffect, useRef, useState } from 'react';
import { Box, Sec } from './kit';
import { LangProvider, useLang, useT } from './langContext';
import { fmtValue, metricInfo } from '../../lib/clientReport';
import { localeOf, normLang } from '../../lib/clientLang';
import { funnelModel } from '../../lib/reportFunnel';

// The funnel of a report (variant C, chosen by the owner 2026-11-03): one smooth silhouette, the layers go from light lilac to dark plum, the step conversion sits in
// callouts, the weakest step is amber. The widths are not the data (the picture would be unreadable at 1%): the numbers and percentages are.
// Two drawings of the same picture: wide (callouts to the right of the silhouette) and compact (a phone: the callouts sit between the layers), so the text keeps a readable size.
const FROM = [215, 169, 220]; // #D7A9DC
const TO = [82, 27, 82]; // #521B52
const COMPACT_BELOW = 520; // px of the box

const mix = (t) => `rgb(${FROM.map((a, i) => Math.round(a + (TO[i] - a) * t)).join(',')})`;
// numbers are written like in the tables of the report's language (12,480 and 12.3% / 12 480 і 12,3%)
const pctIn = (lang) => (n) => `${Number(n).toLocaleString(localeOf(lang), { maximumFractionDigits: 1 })}%`;
const cut = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export const SAMPLE_TOTAL = { x_view_content: 1000, x_add_to_cart: 100, x_initiate_checkout: 80, x_g_fn_view: 1000, x_g_fn_cart: 100, x_g_fn_checkout: 80, purchases: 10 };

function Layer({ s, i, n, cx, y, wt, wb, layer, big, small, stroke }) {
  const lang = useLang();
  const t = n > 1 ? i / (n - 1) : 0;
  const fill = mix(t);
  const dark = t < 0.4;
  return (
    <g>
      <path d={`M${cx - wt / 2} ${y} L${cx + wt / 2} ${y} L${cx + wb / 2} ${y + layer} L${cx - wb / 2} ${y + layer} Z`} fill={fill} stroke={fill} strokeWidth={stroke} strokeLinejoin="round" />
      <text x={cx} y={y + layer * 0.4} textAnchor="middle" fontSize={small} fill={dark ? '#4a1d4d' : '#ffffff'}>{cut(s.label, 26)}</text>
      <text x={cx} y={y + layer * 0.75} textAnchor="middle" fontSize={i === n - 1 ? big - 4 : big} fontWeight="600" fill={dark ? '#3b1a3d' : '#ffffff'}>{fmtValue(s.key, s.value, 'number', undefined, lang)}</text>
    </g>
  );
}

// wide: 680 units across, the callouts to the right
function WideChart({ model, sample }) {
  const t = useT();
  const pct = pctIn(useLang());
  const stepNote = (s) => (s.fromPrev > 100 ? t('more than at the step before') : t('go on to {label}', { label: s.label }));
  const W = 680; const CX = 230; const TOP = 28; const LAYER = 72; const GAP = 20;
  const n = model.steps.length;
  const step = Math.min(70, (300 - 130) / n);
  const height = TOP + n * (LAYER + GAP) + 30;
  const widthAt = (i, bottom) => 330 - i * step - (bottom ? step * 0.8 : 0);
  const yOf = (i) => TOP + i * (LAYER + GAP);
  const overall = model.steps[n - 1].fromFirst;
  return (
    <svg className="fnl" viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={t('Funnel of the stages with the share that goes on at every step')}>
      <title>{t('Funnel')}</title>
      {model.steps.map((s, i) => <Layer key={s.key} s={s} i={i} n={n} cx={CX} y={yOf(i)} wt={widthAt(i, false)} wb={widthAt(i, true)} layer={LAYER} big={22} small={12} stroke={10} />)}
      {model.steps.slice(1).map((s, k) => {
        const i = k + 1;
        const gapY = yOf(i) - GAP / 2;
        const edge = CX + (widthAt(i - 1, true) + widthAt(i, false)) / 4 + 8;
        const weak = s.weakest;
        return (
          <g key={`c-${s.key}`}>
            <path d={`M${edge} ${gapY} L440 ${gapY}`} stroke="#C9A3CE" strokeWidth="1" strokeDasharray="3 3" fill="none" />
            <rect x="440" y={gapY - 23} width="214" height="46" rx="12" fill={weak ? '#FFF1D6' : '#F3E3F7'} stroke={weak ? '#F0B955' : '#E0C2E6'} />
            <text x="456" y={gapY - 3} fontSize="15" fontWeight="600" fill={weak ? '#6b4300' : '#682768'}>{s.fromPrev == null ? '—' : pct(s.fromPrev)}{weak && <tspan fontSize="11" fontWeight="500"> · {t('biggest drop')}</tspan>}</text>
            <text x="456" y={gapY + 14} fontSize="11" fill={weak ? '#6b4300' : '#682768'}>{cut(stepNote(s), 34)}</text>
          </g>
        );
      })}
      {overall != null && <text x="440" y={height - 14} fontSize="12" fill="#7a5a7d">{t('Overall: {p} go all the way', { p: pct(overall) })}</text>}
      {sample && <text x="24" y="18" fontSize="11" fill="#7a5a7d">{t('Example: the real numbers appear with the data')}</text>}
    </svg>
  );
}

// compact: 300 units across (about a phone), the callout sits in the gap under the layer it follows
function CompactChart({ model, sample }) {
  const t = useT();
  const pct = pctIn(useLang());
  const W = 300; const CX = 150; const TOP = sample ? 22 : 4; const LAYER = 62; const GAP = 40;
  const n = model.steps.length;
  const step = Math.min(30, (280 - 170) / n);
  const height = TOP + n * LAYER + (n - 1) * GAP + 30;
  const widthAt = (i, bottom) => 280 - i * step - (bottom ? step * 0.8 : 0);
  const yOf = (i) => TOP + i * (LAYER + GAP);
  const overall = model.steps[n - 1].fromFirst;
  return (
    <svg className="fnl" viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={t('Funnel of the stages with the share that goes on at every step')}>
      <title>{t('Funnel')}</title>
      {sample && <text x="150" y="13" textAnchor="middle" fontSize="11" fill="#7a5a7d">{t('Example: the real numbers appear with the data')}</text>}
      {model.steps.map((s, i) => <Layer key={s.key} s={s} i={i} n={n} cx={CX} y={yOf(i)} wt={widthAt(i, false)} wb={widthAt(i, true)} layer={LAYER} big={20} small={12} stroke={8} />)}
      {model.steps.slice(1).map((s, k) => {
        const i = k + 1;
        const mid = yOf(i) - GAP / 2;
        const weak = s.weakest;
        const text = s.fromPrev == null ? '—' : s.fromPrev > 100 ? `${pct(s.fromPrev)} · ${t('more than before')}` : `${t('{p} go on', { p: pct(s.fromPrev) })}${weak ? ` · ${t('biggest drop')}` : ''}`;
        return (
          <g key={`c-${s.key}`}>
            <rect x="40" y={mid - 12} width="220" height="24" rx="12" fill={weak ? '#FFF1D6' : '#F3E3F7'} stroke={weak ? '#F0B955' : '#E0C2E6'} />
            <text x={CX} y={mid + 4.5} textAnchor="middle" fontSize="12" fontWeight="600" fill={weak ? '#6b4300' : '#682768'}>{text}</text>
          </g>
        );
      })}
      {overall != null && <text x={CX} y={height - 10} textAnchor="middle" fontSize="12" fill="#7a5a7d">{t('Overall: {p} go all the way', { p: pct(overall) })}</text>}
    </svg>
  );
}

export function FunnelChart({ model, sample = false }) {
  const box = useRef(null);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => { // measured before the first paint: a phone never flashes the wide drawing
    const el = box.current;
    if (!el) return undefined;
    const read = () => setCompact(el.getBoundingClientRect().width < COMPACT_BELOW);
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div ref={box} style={{ width: '100%' }}>{compact ? <CompactChart model={model} sample={sample} /> : <WideChart model={model} sample={sample} />}</div>;
}

// The box a report shows. `view.funnel` is the layout's setting ({ enabled, stages }); the numbers come from the totals of the report. Nothing is drawn when the funnel is off or has fewer than
// two numbers. In the builder (`builder`) a funnel without data is drawn with example numbers, so the person sees what the client will see.
export default function FunnelBox({ view, custom = [], builder = false, hint = false, section = false }) {
  const f = view?.funnel;
  if (!f?.enabled) return null;
  const lang = normLang(view?.lang);
  const labelOf = (k) => metricInfo(k, custom, '', lang).label;
  const real = funnelModel({ stages: f.stages, total: view.total, prev: view.prev?.total || null, custom, labelOf });
  const sample = !real && builder ? funnelModel({ stages: f.stages, total: SAMPLE_TOTAL, custom, labelOf }) : null;
  const model = real || sample;
  // the team's views say why there is no picture; the client's page just does not show an empty box
  if (!model) return hint ? <div className="pacc-hint" role="note">Воронка ввімкнена, але в цьому звіті немає чисел етапів (перегляди, кошик, оформлення). Оновіть цифри кнопкою «Підтягнути з кабінетів»: стовпці воронки вже додано.</div> : null;
  return (
    <LangProvider lang={lang}>
      <FunnelBoxInner model={model} sample={!real} section={section} />
    </LangProvider>
  );
}

// `section`: the client's page draws it as a section of its own (a heading, then the picture in a card), the builder keeps the plain box.
function FunnelBoxInner({ model, sample, section }) {
  const t = useT();
  if (section) {
    return (
      <Sec id="funnel" icon="bars" title={t('Funnel')} sub={t('Where the customers drop off')}>
        <div className="rf cx-card cx-fn"><div className="gx"><FunnelChart model={model} sample={sample} /></div></div>
      </Sec>
    );
  }
  return (
    <Box icon="bars" title={t('Funnel')} sub={t('Where the customers drop off')}>
      <div className="gx"><FunnelChart model={model} sample={sample} /></div>
    </Box>
  );
}
