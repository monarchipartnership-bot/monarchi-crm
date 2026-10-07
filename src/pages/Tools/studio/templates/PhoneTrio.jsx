import FitText from '../FitText';
import { Kicker, Logo, Person, PhoneMock, Squares, TitleLines } from '../parts';

// Mobile case cover: headline on the left, three phone screens below it and
// a cut-out portrait on the bottom-right.
export default function PhoneTrio({ c, images, kTitle }) {
  const shots = [images.main, images.s2, images.s3];
  return (
    <>
      <div className="cv-bg" />
      <Squares items={[[520, 48], [970, 330]]} />
      <Person src={images.person} className="cv-pt-person" />
      <div className="cv-pt-col">
        <Logo />
        <Kicker>{c.kicker}</Kicker>
        <FitText className="cv-title" max={62} min={30} maxH={150} k={kTitle}>
          <TitleLines title={c.title} accent={c.accent} />
        </FitText>
        {String(c.subtitle || '').trim() && <p className="cv-sub">{c.subtitle}</p>}
      </div>
      <div className="cv-pt-phones">
        {shots.map((src, i) => <PhoneMock key={i} n={i + 1} src={src} />)}
      </div>
    </>
  );
}
