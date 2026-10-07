import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CASES_KEY, DEFAULT_COLORS, DEFAULT_SIZES, STORAGE_KEY, defaultState, loadCases, loadState,
} from './model';

// All editor state in one place: React state, debounced localStorage
// autosave (the status only says "saved" after setItem really succeeded) and
// the small helpers the panel needs.
export default function useStudio() {
  const [state, setState] = useState(loadState);
  const [cases, setCases] = useState(loadCases);
  const [status, setStatus] = useState('idle'); // idle | saved | error
  const dirty = useRef(false);

  const update = useCallback((fn) => {
    dirty.current = true;
    setState((prev) => fn(prev));
  }, []);

  useEffect(() => {
    if (!dirty.current) return undefined;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, 250);
    return () => clearTimeout(t);
  }, [state]);

  const actions = useMemo(() => ({
    setType: (type) => update((s) => ({ ...s, type })),
    setTemplate: (id) => update((s) => ({ ...s, templates: { ...s.templates, [s.type]: id } })),
    setColors: (colors) => update((s) => ({ ...s, colors: { ...colors } })),
    setColor: (key, value) => update((s) => ({ ...s, colors: { ...s.colors, [key]: value } })),
    resetColors: () => update((s) => ({ ...s, colors: { ...DEFAULT_COLORS } })),
    patchContent: (patch) => update((s) => ({ ...s, content: { ...s.content, ...patch } })),
    setMetric: (i, key, value) => update((s) => ({
      ...s,
      content: { ...s.content, metrics: s.content.metrics.map((m, j) => (j === i ? { ...m, [key]: value } : m)) },
    })),
    addTag: () => update((s) => ({ ...s, content: { ...s.content, tags: [...s.content.tags, { t: '', a: false }] } })),
    setTag: (i, patch) => update((s) => ({
      ...s,
      content: { ...s.content, tags: s.content.tags.map((t, j) => (j === i ? { ...t, ...patch } : t)) },
    })),
    removeTag: (i) => update((s) => ({ ...s, content: { ...s.content, tags: s.content.tags.filter((_, j) => j !== i) } })),
    setSize: (key, value) => update((s) => ({ ...s, sizes: { ...s.sizes, [key]: value } })),
    resetSizes: () => update((s) => ({ ...s, sizes: { ...DEFAULT_SIZES } })),
    setImage: (key, data) => update((s) => ({ ...s, images: { ...s.images, [key]: data } })),
    applyContent: (content) => update((s) => ({ ...s, content: JSON.parse(JSON.stringify(content)) })),
    resetAll: () => {
      dirty.current = false;
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
      setState(defaultState());
      setStatus('idle');
    },
  }), [update]);

  const persistCases = useCallback((next) => {
    setCases(next);
    try { localStorage.setItem(CASES_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  }, []);

  const saveCase = useCallback((name, content) => {
    const entry = { id: String(Date.now()), name: name.trim(), content: JSON.parse(JSON.stringify(content)) };
    persistCases([entry, ...cases].slice(0, 30));
  }, [cases, persistCases]);
  const deleteCase = useCallback((id) => persistCases(cases.filter((c) => c.id !== id)), [cases, persistCases]);

  return { state, status, actions, cases, saveCase, deleteCase };
}
