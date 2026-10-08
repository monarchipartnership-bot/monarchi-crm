import { useCallback, useRef, useState } from 'react';

const LIMIT = 100;
const COALESCE_MS = 700;

// The deck with undo / redo. Typing in one block is merged into one step
// (same `key` within COALESCE_MS); every toolbar command is its own step.
export default function useDeckHistory(initial) {
  const [state, setState] = useState({ deck: initial, past: [], future: [] });
  const last = useRef({ key: null, at: 0 });

  const update = useCallback((fn, key = null) => {
    setState((s) => {
      const next = typeof fn === 'function' ? fn(s.deck) : fn;
      if (next === s.deck) return s;
      const now = Date.now();
      const merge = key && last.current.key === key && now - last.current.at < COALESCE_MS && s.past.length;
      last.current = { key, at: now };
      return { deck: next, past: merge ? s.past : [...s.past, s.deck].slice(-LIMIT), future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    last.current = { key: null, at: 0 };
    setState((s) => (s.past.length ? { deck: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.deck, ...s.future] } : s));
  }, []);

  const redo = useCallback(() => {
    last.current = { key: null, at: 0 };
    setState((s) => (s.future.length ? { deck: s.future[0], past: [...s.past, s.deck], future: s.future.slice(1) } : s));
  }, []);

  // Replaces the deck without making an undo step (opening a saved deck).
  const reset = useCallback((deck) => {
    last.current = { key: null, at: 0 };
    setState({ deck, past: [], future: [] });
  }, []);

  return { deck: state.deck, update, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
