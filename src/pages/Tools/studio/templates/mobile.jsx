import FitText from '../FitText';
import {
  Bar, Kicker, Logo, Metrics, PhoneMock, TitleLines,
} from '../parts';

const Sub = ({ c }) => (String(c.subtitle || '').trim() ? <p className="cv-sub">{c.subtitle}</p> : null);
const shots = (images) => [images.main, images.s2, images.s3];

// Mobile Split: colour wedge behind a fan of three phones, copy on the left.
export function MobileSplit({ c, images, kTitle }) {
  return (
    <>
      <div className="cv-bg" />
      <div className="cv-ms-wedge" />
      <div className="cv-ms-fan">
        {shots(images).map((src, i) => <PhoneMock key={i} n={i + 1} src={src} />)}
      </div>
      <div className="cv-ms-col">
        <Logo />
        <Kicker>{c.kicker}</Kicker>
        <Bar />
        <FitText className="cv-title" max={54} min={32} maxH={210} k={kTitle}><TitleLines title={c.title} accent={c.accent} /></FitText>
        <Sub c={c} />
      </div>
      <div className="cv-ms-metrics"><Metrics items={c.metrics} /></div>
    </>
  );
}

// Mobile Poster: three phones across the top, poster-size headline below.
export function MobilePoster({ c, images, kTitle }) {
  return (
    <>
      <div className="cv-bg" />
      <Logo className="cv-mp-logo" />
      <div className="cv-mp-kicker"><Kicker>{c.kicker}</Kicker></div>
      <div className="cv-mp-row">
        {shots(images).map((src, i) => <PhoneMock key={i} n={i + 1} src={src} />)}
      </div>
      <div className="cv-mp-col">
        <FitText className="cv-title" max={62} min={34} maxH={128} k={kTitle}><TitleLines title={c.title} accent={c.accent} /></FitText>
        <Sub c={c} />
      </div>
      <div className="cv-mp-foot"><Metrics items={c.metrics} variant="plain" /></div>
    </>
  );
}

// Code Terminal: the case is described as a TypeScript object; the three
// phones sit above the window.
export function CodeTerminal({ c, images }) {
  const name = [c.title, c.accent].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
  const stats = (c.metrics || []).filter((m) => String(m.v || '').trim());
  const role = String(c.subtitle || '').trim();
  return (
    <>
      <div className="cv-bg" />
      <div className="cv-grid cv-grid--soft" />
      <Logo className="cv-ct-logo" />
      <div className="cv-ct-kicker"><Kicker>{c.kicker}</Kicker></div>
      <div className="cv-ct-row">
        {shots(images).map((src, i) => <PhoneMock key={i} n={i + 1} src={src} />)}
      </div>
      <div className="cv-ct-win">
        <div className="cv-ct-bar"><i /><i /><i /><span>service.ts — monarchi / services</span></div>
        <div className="cv-ct-code">
          <div><span className="k">export const</span> <span className="v">service</span> = {'{'}</div>
          <div className="ind">name: <span className="s">&quot;{name}&quot;</span>,</div>
          {role && <div className="ind">role: <span className="s">&quot;{role}&quot;</span>,</div>}
          {stats.length > 0 && <div className="ind">stats: {'{'}</div>}
          {stats.map((m, i) => (
            <div className="ind2" key={i}><span className="p">&quot;{m.l || 'metric'}&quot;</span>: <span className="s">&quot;{m.v}&quot;</span>,</div>
          ))}
          {stats.length > 0 && <div className="ind">{'}'},</div>}
          <div>{'};'}</div>
        </div>
      </div>
    </>
  );
}
