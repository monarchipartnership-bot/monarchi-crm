import { WORDMARK_DARK, WORDMARK_WHITE, MONO_KNOT } from './wordmarks';

export function WordmarkDark(props) {
  return <div {...props} dangerouslySetInnerHTML={{ __html: WORDMARK_DARK }} />;
}

export function WordmarkWhite(props) {
  return <div {...props} dangerouslySetInnerHTML={{ __html: WORDMARK_WHITE }} />;
}

export function MonoKnot(props) {
  return <div {...props} dangerouslySetInnerHTML={{ __html: MONO_KNOT }} />;
}
