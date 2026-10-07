import FitText from '../FitText';
import { Bar, ImageCard, Kicker, Logo, Metrics, TitleLines } from '../parts';

const Sub = ({ c }) => (String(c.subtitle || '').trim() ? <p className="cv-sub">{c.subtitle}</p> : null);

// Royal Editorial: text column on the left, tall framed image on the right,
// plain metric strip along the bottom.
export function RoyalEditorial({ c, images, kTitle }) {
  return (
    <>
      <div className="cv-bg" />
      <ImageCard className="cv-re-img" src={images.main} />
      <div className="cv-re-col">
        <Logo />
        <Kicker>{c.kicker}</Kicker>
        <Bar />
        <FitText className="cv-title" max={52} min={32} maxH={236} k={kTitle}><TitleLines title={c.title} accent={c.accent} /></FitText>
        <Sub c={c} />
      </div>
      <div className="cv-re-metrics"><Metrics items={c.metrics} variant="plain" /></div>
    </>
  );
}

// Diagonal Split: colour wedge behind a floating image card, chips below.
export function DiagonalSplit({ c, images, kTitle }) {
  return (
    <>
      <div className="cv-bg" />
      <div className="cv-ds-wedge" />
      <ImageCard className="cv-ds-img" src={images.main} />
      <div className="cv-ds-kicker"><Kicker>{c.kicker}</Kicker></div>
      <div className="cv-ds-col">
        <Logo />
        <Bar />
        <FitText className="cv-title" max={46} min={30} maxH={210} k={kTitle}><TitleLines title={c.title} accent={c.accent} /></FitText>
        <Sub c={c} />
      </div>
      <div className="cv-ds-metrics"><Metrics items={c.metrics} /></div>
    </>
  );
}

// Data Ledger: grid paper, ghost number from the first metric, metrics as
// ledger rows.
export function DataLedger({ c, images, kTitle }) {
  const first = (c.metrics || []).find((m) => String(m.v || '').trim());
  return (
    <>
      <div className="cv-bg" />
      <div className="cv-grid" />
      {first && <div className="cv-dl-ghost">{first.v}</div>}
      <ImageCard className="cv-dl-img" src={images.main} />
      <div className="cv-dl-col">
        <Logo height={44} />
        <Kicker>{c.kicker}</Kicker>
        <Bar />
        <FitText className="cv-title" max={44} min={30} maxH={150} k={kTitle}><TitleLines title={c.title} accent={c.accent} /></FitText>
        <Sub c={c} />
        <div className="cv-dl-rows"><Metrics items={c.metrics} variant="ledger" /></div>
      </div>
    </>
  );
}
