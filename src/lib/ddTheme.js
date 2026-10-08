// Dropdown menus are portaled to <body>, so they can't inherit a page theme from CSS.
// A page opts in with data-dd="plum" on a wrapper; the component reads it from its own trigger.
export const ddTheme = (ref) => {
  const t = ref.current?.closest('[data-dd]')?.getAttribute('data-dd');
  return t ? ' dd-' + t : '';
};
