import { forwardRef } from 'react';
import { TEMPLATE_BY_ID } from './templates';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './studio.css';
import './templates.css';

// One 1000x750 cover. Everything inside is plain DOM/CSS laid out in the
// cover's own pixel space; the palette arrives as CSS variables so every
// template shares the same colour controls.
const Cover = forwardRef(function Cover({ template, c, colors, images, sizes }, ref) {
  const t = TEMPLATE_BY_ID[template];
  if (!t) return null;
  const T = t.component;
  const k = (key) => (sizes?.[key] ?? 100) / 100;
  const vars = {
    '--bgA': colors.bgA, '--bgB': colors.bgB, '--glow': colors.glow, '--gold': colors.gold, '--mag': colors.mag,
    '--text': colors.text || '#ffffff', '--mut': colors.mut || '#CBA6CB',
    '--k-sub': k('sub'), '--k-tags': k('tags'), '--k-num': k('num'),
  };
  return (
    <div ref={ref} className={'cv cv-' + t.id} style={vars}>
      <T c={c} images={images} kTitle={k('title')} />
    </div>
  );
});

export default Cover;
