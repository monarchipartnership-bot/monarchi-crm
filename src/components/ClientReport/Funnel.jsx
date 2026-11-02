import { Box } from './kit';
import { fmtValue, metricInfo } from '../../lib/clientReport';
import { funnelModel } from '../../lib/reportFunnel';

// The funnel of a report (variant C, chosen by the owner 2026-11-03): one smooth silhouette, the layers go from light lilac to dark plum, the step conversion sits in
// callouts on the right, the weakest step is amber. The widths are not the data (the picture would be unreadable at 1%): the numbers and percentages are.
const W = 680;
const CX = 230;
const TOP = 28;
const LAYER = 72;
const GAP = 20;
const FROM = [215, 169, 220]; // #D7A9DC
const TO = [82, 27, 82]; // #521B52

const mix = (t) => `rgb(${FROM.map((a, i) => Math.round(a + (TO[i] - a) * t)).join(',')})`;
const pct = (n) => `${String(n).replace('.', ',')}%`; // the report is read by people who write decimals with a comma

export const SAMPLE_TOTAL = { x_view_content: 1000, x_add_to_cart: 100, x_initiate_checkout: 80, purchases: 10 };

export function FunnelChart({ model, sample = false }) {
  const n = model.steps.length;
  const step = Math.min(70, (300 - 130) / n);
  const height = TOP + n * (LAYER + GAP) + 30;
  const widthAt = (i, bottom) => 330 - i * step - (bottom ? step * 0.8 : 0);
  const yOf = (i) => TOP + i * (LAYER + GAP);
  const last = model.steps[n - 1];
  const overall = last.fromFirst;
  return (
    <svg className="fnl" viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label="Funnel of the stages with the share that goes on at every step">
      <title>Funnel</title>
      {model.steps.map((s, i) => {
        const y = yOf(i);
        const t = n > 1 ? i / (n - 1) : 0;
        const wt = widthAt(i, false);
        const wb = widthAt(i, true);
        const fill = mix(t);
        const dark = t < 0.4;
        return (
          <g key={s.key}>
            <path d={`M${CX - wt / 2} ${y} L${CX + wt / 2} ${y} L${CX + wb / 2} ${y + LAYER} L${CX - wb / 2} ${y + LAYER} Z`} fill={fill} stroke={fill} strokeWidth="10" strokeLinejoin="round" />
            <text x={CX} y={y + 29} textAnchor="middle" fontSize="12" fill={dark ? '#4a1d4d' : '#ffffff'}>{s.label}</text>
            <text x={CX} y={y + 54} textAnchor="middle" fontSize={i === n - 1 ? 18 : 22} fontWeight="600" fill={dark ? '#3b1a3d' : '#ffffff'}>{fmtValue(s.key, s.value, 'number')}</text>
          </g>
        );
      })}
      {model.steps.slice(1).map((s, k) => {
        const i = k + 1;
        const gapY = yOf(i) - GAP / 2;
        const edge = CX + (widthAt(i - 1, true) + widthAt(i, false)) / 4 + 8;
        const weak = s.weakest;
        return (
          <g key={`c-${s.key}`}>
            <path d={`M${edge} ${gapY} L440 ${gapY}`} stroke="#C9A3CE" strokeWidth="1" strokeDasharray="3 3" fill="none" />
            <rect x="440" y={gapY - 23} width="214" height="46" rx="12" fill={weak ? '#FFF1D6' : '#F3E3F7'} stroke={weak ? '#F0B955' : '#E0C2E6'} />
            <text x="456" y={gapY - 3} fontSize="15" fontWeight="600" fill={weak ? '#6b4300' : '#682768'}>{s.fromPrev == null ? '—' : pct(s.fromPrev)}</text>
            <text x="456" y={gapY + 14} fontSize="11" fill={weak ? '#6b4300' : '#682768'}>{`go on to ${s.label}${weak ? ' · biggest drop' : ''}`.slice(0, 40)}</text>
          </g>
        );
      })}
      {overall != null && <text x="440" y={height - 14} fontSize="12" fill="#7a5a7d">{`Overall: ${pct(overall)} go all the way`}</text>}
      {sample && <text x="24" y="18" fontSize="11" fill="#7a5a7d">Example: the real numbers appear with the data</text>}
    </svg>
  );
}

// The box a report shows. `view.funnel` is the layout's setting ({ enabled, stages }); the numbers come from the totals of the report. Nothing is drawn when the funnel is off or has fewer than
// two numbers. In the builder (`builder`) a funnel without data is drawn with example numbers, so the person sees what the client will see.
export default function FunnelBox({ view, custom = [], builder = false, hint = false }) {
  const f = view?.funnel;
  if (!f?.enabled) return null;
  const labelOf = (k) => metricInfo(k, custom).label;
  const real = funnelModel({ stages: f.stages, total: view.total, prev: view.prev?.total || null, custom, labelOf });
  const sample = !real && builder ? funnelModel({ stages: f.stages, total: SAMPLE_TOTAL, custom, labelOf }) : null;
  const model = real || sample;
  // the team's views say why there is no picture; the client's page just does not show an empty box
  if (!model) return hint ? <div className="pacc-hint" role="note">Воронка ввімкнена, але в цьому звіті немає чисел етапів (перегляди, кошик, оформлення). Оновіть цифри кнопкою «Підтягнути дані»: стовпці воронки вже додано до кабінету.</div> : null;
  return (
    <Box icon="bars" title="Funnel" sub="Where the customers drop off">
      <div className="gx"><FunnelChart model={model} sample={!real} /></div>
    </Box>
  );
}
