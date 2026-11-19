import { Pill } from './parts';

const fmt = (x, c = '') => (x == null ? '—' : `${x < 0 ? '−' : ''}${c === 'USD' ? '$' : ''}${Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 2 })}${c && c !== 'USD' ? ' ' + c : ''}`);

// The section «Unit Economy» as a page (step A4, variant B): the thresholds first, then the lines, the three budget scenarios and what is still to be confirmed.
// content = what the Researcher wrote (api/_lib/wf/skills/unitEconomyAgent.js).
export default function UnitEconomyView({ content }) {
  const t = content.thresholds;
  const c = t?.currency || content.inputs?.currency || 'USD';
  const lines = (content.lines || []).filter((l) => !l.blocked);
  return (
    <div className="wf-col">
      {t && (
        <div className="wf-ue-hero">
          <div className="wf-row" style={{ justifyContent: 'space-between' }}>
            <div><h2>Беззбитковий CPA {fmt(t.breakeven_cpa, c)}, цільовий {fmt(t.target_cpa, c)}</h2><p>Дорожче за {fmt(t.breakeven_cpa, c)} за замовлення реклама збиткова. Оптимізація вимикає й масштабує за цими числами (лінія «{t.basis}»).</p></div>
            {content.provisional && <span className="wf-st warn" style={{ background: '#fff' }}><i />Попередній розрахунок</span>}
          </div>
        </div>
      )}
      <div className="wf-card" style={{ boxShadow: 'none', padding: 0 }}>
        <div className="wf-h">Лінії</div>
        <div className="wf-tblwrap">
          <table className="wf-tbl">
            <thead><tr><th>Лінія</th><th>Клієнт платить</th><th>Внесок</th><th>Беззбитк. CPA</th><th>Беззбитк. ROAS</th><th>Цільовий CPA</th></tr></thead>
            <tbody>{lines.map((l) => (
              <tr key={l.kind + l.name}>
                <td><b>{l.name}</b>{l.kind === 'offer' && <> <Pill tone={l.approved ? 'ok' : 'warn'}>{l.approved ? 'погоджено' : 'рекомендація'}</Pill></>}{!l.sellable_alone && <> <Pill tone="bad">збиткова до реклами</Pill></>}</td>
                <td>{fmt(l.pays, c)}</td><td>{fmt(l.contribution, c)}</td><td>{fmt(l.breakeven_cpa, c)}</td><td>{l.breakeven_roas ?? '—'}</td><td>{fmt(l.target_cpa, c)}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <div className="wf-src" style={{ marginTop: 8 }}>Внесок до реклами = ціна − собівартість − комісії − доставка − повернення. Беззбитковий CPA = внесок. Беззбитковий ROAS = ціна / внесок. Цільовий CPA = ціна / цільовий ROAS ({t?.target_roas}).</div>
      </div>

      {content.scenarios?.length > 0 && (
        <div>
          <div className="wf-h">Три сценарії бюджету</div>
          <div className="wf-tiles">
            {content.scenarios.map((s, i) => (
              <div key={s.name} className={'wf-tile' + (i === 1 ? ' main' : '')}>
                <span className="k">{s.name} · {fmt(s.monthly_budget, c)}/міс ({fmt(s.daily_budget, c)}/день)</span>
                <b>{s.orders_at_target} замовлень на цілі</b>
                <span className="k">до беззбитковості {s.orders_to_break_even} · виторг {fmt(s.revenue_at_target, c)} · після реклами {fmt(s.profit_after_ads_at_target, c)}{s.clicks_needed_at_target != null ? ` · кліків ≈ ${s.clicks_needed_at_target}` : ''}</span>
                <span className="k">{s.note}</span>
              </div>))}
          </div>
        </div>
      )}

      {(content.assumptions?.length > 0 || content.missing?.length > 0) && (
        <div>
          <div className="wf-h">Що треба підтвердити або додати</div>
          <div className="wf-col">
            {(content.assumptions || []).map((a, i) => <div key={'a' + i} className="wf-row"><Pill tone="warn">Припущення</Pill><span style={{ flex: 1, minWidth: 0 }}>{a}</span></div>)}
            {(content.missing || []).map((m, i) => <div key={'m' + i} className="wf-row"><Pill tone="info">Не вистачає</Pill><span style={{ flex: 1, minWidth: 0 }}>{m}</span></div>)}
          </div>
        </div>
      )}
    </div>
  );
}
