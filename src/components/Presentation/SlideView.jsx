import RichText, { PlainCell } from './RichText';
import { WordmarkWhite } from '../Logo/Logo';
import { plain } from '../../lib/presentation/textModel';
import metaCover from '../../assets/presentation/meta-cover.png';
import googleCover from '../../assets/presentation/google-cover.png';

export const COVERS = { meta: metaCover, google: googleCover };
export const SLIDE_W = 960;
export const SLIDE_H = 540;

// Which slides show the big cover picture on the right (the rest get a quiet plum background).
const COVER_TYPES = ['title', 'section', 'closing'];

const rid = (sid, path) => `${sid}:${path}`;

function Table({ head, rows, className = '', colClass = [] }) {
  return (
    <table className={'ps-table ' + className} data-pptx="table">
      <thead>
        <tr>{head.map((h) => <th key={h.id} className={h.cls}><PlainCell id={h.id} value={h.value} className="pc-h" placeholder="…" /></th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => <td key={c.id} className={(j === 0 ? 'ps-first ' : 'num ') + (colClass[j] || '')}><PlainCell id={c.id} value={c.value} placeholder="…" /></td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Heading({ slide, ph = 'Slide title' }) {
  return <RichText id={rid(slide.id, 'heading')} value={slide.data.heading} className="ps-h" placeholder={ph} />;
}

function Body({ slide, deck }) {
  const d = slide.data;
  const sid = slide.id;
  switch (slide.type) {
    case 'title':
      return (
        <div className="ps-cover-text">
          <RichText id={rid(sid, 'title1')} value={d.title1} className="ps-title1" placeholder="Title" />
          <RichText id={rid(sid, 'title2')} value={d.title2} className="ps-title2" placeholder="Subtitle" />
          <RichText id="meta:client" value={deck.meta.client} className="ps-client" placeholder="Client" />
          <RichText id="meta:period" value={deck.meta.period} className="ps-period" placeholder="Period" />
        </div>
      );
    case 'agenda':
      return (<><Heading slide={slide} /><RichText id={rid(sid, 'items')} value={d.items} className="ps-agenda" placeholder="Section name" /></>);
    case 'section':
      return (
        <div className="ps-section-text">
          <RichText id={rid(sid, 'heading')} value={d.heading} className="ps-section-h" placeholder="Slide title" />
          <RichText id={rid(sid, 'body')} value={d.body} className="ps-section-b" placeholder="A short line with the key message" />
        </div>
      );
    case 'closing':
      return (
        <div className="ps-section-text ps-closing">
          <RichText id={rid(sid, 'heading')} value={d.heading} className="ps-section-h" placeholder="Thank you" />
          <RichText id={rid(sid, 'body')} value={d.body} className="ps-section-b" placeholder="Contacts or a closing line" />
        </div>
      );
    case 'metricslist':
      return (
        <>
          <Heading slide={slide} />
          <div className="ps-metrics">
            {d.items.map((it, i) => (
              <div className="ps-metric" key={i}>
                <PlainCell id={rid(sid, `items.${i}.label`)} value={it.label} className="ps-m-label" placeholder="Metric" />
                <PlainCell id={rid(sid, `items.${i}.value`)} value={it.value} className="ps-m-value" placeholder="—" />
                {(it.delta || deck.meta.reportHasPrev) && <PlainCell id={rid(sid, `items.${i}.delta`)} value={it.delta} className="ps-m-delta" placeholder="" />}
              </div>
            ))}
          </div>
        </>
      );
    case 'kpigrid':
      return (
        <>
          <Heading slide={slide} />
          <div className={'ps-kpis n' + Math.min(d.cards.length, 6)}>
            {d.cards.map((it, i) => (
              <div className="ps-kpi" key={i}>
                <PlainCell id={rid(sid, `cards.${i}.label`)} value={it.label} className="ps-k-label" placeholder="Metric" />
                <PlainCell id={rid(sid, `cards.${i}.value`)} value={it.value} className="ps-k-value" placeholder="—" />
                {it.delta ? <PlainCell id={rid(sid, `cards.${i}.delta`)} value={it.delta} className="ps-k-delta" /> : null}
              </div>
            ))}
          </div>
        </>
      );
    case 'campaignTable':
      return (
        <>
          <Heading slide={slide} />
          <Table
            className="ps-table-wide"
            head={[{ id: rid(sid, 'corner'), value: d.corner, cls: 'ps-first' }, ...d.columns.map((c, i) => ({ id: rid(sid, `columns.${i}`), value: c, cls: 'num' }))]}
            rows={d.rows.map((r, i) => [{ id: rid(sid, `rows.${i}.label`), value: r.label }, ...r.cells.map((c, j) => ({ id: rid(sid, `rows.${i}.cells.${j}`), value: c }))])}
          />
        </>
      );
    case 'dynamicsTable':
      return (
        <>
          <Heading slide={slide} />
          <Table
            className="ps-table-dyn"
            head={d.headers.map((h, i) => ({ id: rid(sid, `headers.${i}`), value: h, cls: i === 0 ? 'ps-first' : 'num' }))}
            rows={d.rows.map((r, i) => ['label', 'prev', 'change', 'cur'].map((k) => ({ id: rid(sid, `rows.${i}.${k}`), value: r[k] })))}
          />
        </>
      );
    case 'table':
      return (
        <>
          <Heading slide={slide} />
          <Table
            className="ps-table-wide"
            head={d.header.map((h, i) => ({ id: rid(sid, `header.${i}`), value: h, cls: i === 0 ? 'ps-first' : 'num' }))}
            rows={d.rows.map((r, i) => r.map((c, j) => ({ id: rid(sid, `rows.${i}.${j}`), value: c })))}
          />
        </>
      );
    case 'bullets':
      return (<><Heading slide={slide} /><RichText id={rid(sid, 'list')} value={d.list} className="ps-list" placeholder="List item" /></>);
    case 'paragraph':
      return (<><Heading slide={slide} /><RichText id={rid(sid, 'body')} value={d.body} className="ps-body" placeholder="Text" /></>);
    default:
      return <Heading slide={slide} />;
  }
}

// One slide at its real size (960x540). Scaled by the parent with CSS transform; the
// slide itself never knows its on-screen size.
export default function SlideView({ slide, deck, pageNo }) {
  const { platform, style } = deck.meta;
  const cover = COVER_TYPES.includes(slide.type);
  const footer = [plain(deck.meta.client), plain(deck.meta.period)].filter(Boolean).join('  ·  ');
  return (
    <div className="pres-slide" data-style={style} data-platform={platform} data-type={slide.type} data-cover={cover ? '1' : '0'} data-image={slide.image?.src ? '1' : '0'} style={{ width: SLIDE_W, height: SLIDE_H }}>
      <div className="ps-bg" data-pptx-bg style={cover ? { '--ps-cover': `url(${COVERS[platform] || COVERS.meta})` } : undefined} />
      <div className="ps-brand">
        <WordmarkWhite className="ps-logo" />
        <i />
      </div>
      <div className="ps-content">
        <Body slide={slide} deck={deck} />
      </div>
      {slide.image?.src && <div className="ps-image" data-pptx-img><img src={slide.image.src} alt="" /></div>}
      {slide.type !== 'title' && footer && <div className="ps-footer"><span>{footer}</span></div>}
      {pageNo ? <div className="ps-page">{pageNo}</div> : null}
    </div>
  );
}
