import FitText from '../FitText';
import { Bubble, Kicker, Logo, Metrics, Person, TitleLines } from '../parts';

// Catalog cover: big two-tone headline on the left, chat bubbles + metrics
// below it, cut-out portrait standing on the bottom-right.
export default function ServicePortrait({ c, images, kTitle }) {
  return (
    <>
      <div className="cv-bg" />
      <Person src={images.person} className="cv-sp-person" />
      <div className="cv-sp-col">
        <Logo />
        <Kicker>{c.kicker}</Kicker>
        <FitText className="cv-title" max={74} min={38} maxH={232} k={kTitle}>
          <TitleLines title={c.title} accent={c.accent} />
        </FitText>
        {String(c.subtitle || '').trim() && <p className="cv-sub">{c.subtitle}</p>}
      </div>
      <div className="cv-sp-deco" aria-hidden="true">
        <Bubble tone="mag" style={{ left: 0, top: 0, width: 224, height: 68 }} />
        <Bubble kind="dots" tone="gold" style={{ left: 242, top: 18, width: 112, height: 50 }} />
        <Bubble tone="mag2" tail="r" style={{ left: 136, top: 78, width: 208, height: 54 }} />
      </div>
      <div className="cv-sp-metrics"><Metrics items={c.metrics} /></div>
    </>
  );
}
