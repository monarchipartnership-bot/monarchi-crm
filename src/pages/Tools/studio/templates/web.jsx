import FitText from '../FitText';
import {
  Bar, BrowserWin, ImageCard, Kicker, Logo, Metrics, Person, Tags, TitleLines,
} from '../parts';

const Sub = ({ c }) => (String(c.subtitle || '').trim() ? <p className="cv-sub">{c.subtitle}</p> : null);

// Stat Hero: big numbers carry the cover, screenshot card on the right.
export function StatHero({ c, images, kTitle }) {
  return (
    <>
      <div className="cv-bg" />
      <ImageCard className="cv-sh-img" src={images.main} label="DROP SCREENSHOT" />
      <div className="cv-sh-col">
        <Logo />
        <Kicker>{c.kicker}</Kicker>
        <FitText className="cv-title" max={52} min={32} maxH={170} k={kTitle}><TitleLines title={c.title} accent={c.accent} /></FitText>
        <Sub c={c} />
        <Tags items={c.tags} max={4} />
      </div>
      <div className="cv-sh-nums"><Metrics items={c.metrics} variant="stat" /></div>
    </>
  );
}

// Accent Split: coloured slanted panel carries the copy, screenshot card sits
// on the dark side.
export function AccentSplit({ c, images, kTitle }) {
  return (
    <>
      <div className="cv-bg" />
      <div className="cv-as-panel" />
      <ImageCard className="cv-as-img" src={images.main} label="DROP SCREENSHOT" />
      <div className="cv-as-kicker"><Kicker>{c.kicker}</Kicker></div>
      <div className="cv-as-col">
        <Logo />
        <FitText className="cv-title" max={50} min={30} maxH={200} k={kTitle}><TitleLines title={c.title} accent={c.accent} /></FitText>
        <Sub c={c} />
        <Tags items={c.tags} max={4} />
      </div>
      <div className="cv-as-metrics"><Metrics items={c.metrics} variant="plain" /></div>
    </>
  );
}

// Web Poster: browser window on top, poster-size headline below.
export function WebPoster({ c, images, kTitle }) {
  return (
    <>
      <div className="cv-bg" />
      <Logo className="cv-wp-logo" />
      <div className="cv-wp-kicker"><Kicker>{c.kicker}</Kicker></div>
      <BrowserWin className="cv-wp-browser" src={images.main} url={c.url} placeholder="DROP SCREENSHOT" />
      <div className="cv-wp-col">
        <FitText className="cv-title" max={64} min={34} maxH={128} k={kTitle}><TitleLines title={c.title} accent={c.accent} /></FitText>
        <Sub c={c} />
      </div>
      <div className="cv-wp-foot"><Tags items={c.tags} max={4} /><Metrics items={c.metrics} variant="plain" /></div>
    </>
  );
}

// Portrait Left: personal-brand cover, cut-out portrait on the left, copy,
// tags and stat cards on the right.
export function PortraitLeft({ c, images, kTitle }) {
  return (
    <>
      <div className="cv-bg" />
      <Person src={images.person} className="cv-pl-person" />
      <div className="cv-pl-col">
        <Logo />
        <Kicker>{c.kicker}</Kicker>
        <FitText className="cv-title" max={56} min={32} maxH={210} k={kTitle}><TitleLines title={c.title} accent={c.accent} /></FitText>
        <Sub c={c} />
        <Tags items={c.tags} max={4} />
      </div>
      <div className="cv-pl-nums"><Metrics items={c.metrics} variant="cards" /></div>
    </>
  );
}

// Photo Backdrop: the uploaded image fills the cover, copy sits on a dark
// gradient at the bottom.
export function PhotoBackdrop({ c, images, kTitle }) {
  return (
    <>
      <div className="cv-bg" />
      {images.main ? <img className="cv-pb-photo" src={images.main} alt="" /> : <div className="cv-pb-ph"><ImageCard label="DROP IMAGE" /></div>}
      <div className="cv-pb-shade" />
      <div className="cv-pb-logo"><Logo height={44} /></div>
      <div className="cv-pb-kicker"><Kicker>{c.kicker}</Kicker></div>
      <div className="cv-pb-col">
        <FitText className="cv-title" max={48} min={30} maxH={112} k={kTitle}><TitleLines title={c.title} accent={c.accent} /></FitText>
        <Sub c={c} />
        <Bar />
        <Metrics items={c.metrics} variant="strip" />
      </div>
    </>
  );
}
