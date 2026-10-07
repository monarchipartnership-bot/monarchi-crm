import { useCallback, useEffect, useMemo, useState } from 'react';
import { SOURCES } from './clientTypeAndSource';
import { fetchCustomTags, saveCustomTag } from './api/customTags';

// Lead channels (a.k.a. "Source"): the built-in NetHunt-era list plus any
// channel the team added from the UI. Added channels live in the shared
// custom_tags table under this context, so everyone sees them at once.
export const CHANNEL_CONTEXT = 'lead_channel';

// Built-in list first, then team-added channels (deduped, case-insensitive).
export function mergeChannels(custom) {
  const seen = new Set(SOURCES.map((s) => s.toLowerCase()));
  const extra = [];
  for (const c of custom || []) {
    const t = (c || '').trim();
    if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); extra.push(t); }
  }
  return [...SOURCES, ...extra];
}

export function useLeadChannels() {
  const [custom, setCustom] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetchCustomTags(CHANNEL_CONTEXT).then((rows) => { if (!cancelled) setCustom(rows); });
    return () => { cancelled = true; };
  }, []);
  const channels = useMemo(() => mergeChannels(custom), [custom]);
  const options = useMemo(() => channels.map((c) => ({ value: c, label: c })), [channels]);
  const addChannel = useCallback(async (label) => {
    const t = (label || '').trim();
    if (!t) return null;
    const existing = channels.find((c) => c.toLowerCase() === t.toLowerCase());
    if (existing) return existing;
    setCustom((prev) => [...prev, t]);
    await saveCustomTag(CHANNEL_CONTEXT, t);
    return t;
  }, [channels]);
  return { channels, options, addChannel };
}
