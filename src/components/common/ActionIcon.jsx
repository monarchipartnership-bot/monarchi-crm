// Canonical compact action icons (24x24 grid, 1.75px round stroke,
// currentColor) from the shared sprite at public/icons/action-icons.svg —
// the single source for repeating actions (create, generate, regenerate,
// copy, clear, select, edit, info, ...). Reuse by name; add a new symbol to
// the sprite instead of drawing one inline in a page. Decorative by
// default (aria-hidden): the button/link around it carries the text.
const SPRITE_URL = '/icons/action-icons.svg';

export default function ActionIcon({ name, size = 20, className }) {
  return (
    <svg
      className={'action-icon' + (className ? ' ' + className : '')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <use href={`${SPRITE_URL}#action-${name}`} />
    </svg>
  );
}
