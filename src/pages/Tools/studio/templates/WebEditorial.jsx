import FitText from '../FitText';
import { BrowserWin, Kicker, Logo, Metrics, Tags, TitleLines } from '../parts';

// Web case cover: headline, summary and tech tags on the left, the site
// screenshot in a browser window on the right, three stat cards along the
// bottom.
export const WEB_TAGS_MAX = 6;

export default function WebEditorial({ c, images, kTitle }) {
  return (
    <>
      <div className="cv-bg" />
      <div className="cv-we-col">
        <Logo />
        <Kicker>{c.kicker}</Kicker>
        <FitText className="cv-title" max={56} min={32} maxH={190} k={kTitle}>
          <TitleLines title={c.title} accent={c.accent} />
        </FitText>
        {String(c.subtitle || '').trim() && <p className="cv-sub">{c.subtitle}</p>}
        <Tags items={c.tags} max={WEB_TAGS_MAX} />
      </div>
      <BrowserWin className="cv-we-browser" src={images.main} url={c.url} placeholder="DROP SCREENSHOT" />
      <div className="cv-we-nums"><Metrics items={c.metrics} variant="cards" /></div>
    </>
  );
}
