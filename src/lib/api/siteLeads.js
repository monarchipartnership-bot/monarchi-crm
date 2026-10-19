import { supabase } from '../supabaseClient';
import { authedPost } from '../adAccounts';

// Leads from the website forms (migration 20261024000000_site_leads.sql); the server side is api/site-lead.js (+ site-lead-admin.js).
const nowIso = () => new Date().toISOString();

export async function fetchSiteLeadSettings() {
  const { data, error } = await supabase.from('site_lead_settings').select('*').eq('id', 1).maybeSingle();
  if (error) { console.warn('fetchSiteLeadSettings failed', error); return null; }
  return data;
}
export async function saveSiteLeadSettings(patch, email) {
  const { data, error } = await supabase.from('site_lead_settings').update({ ...patch, updated_by: email || null, updated_at: nowIso() }).eq('id', 1).select().single();
  if (error) throw error;
  return data;
}
export async function fetchSiteLeads(limit = 40) {
  const { data, error } = await supabase.from('site_leads').select('*').order('received_at', { ascending: false }).limit(limit);
  if (error) { console.warn('fetchSiteLeads failed', error); return []; }
  return data ?? [];
}
export async function fetchPipelines() {
  const { data, error } = await supabase.from('pipelines').select('id, name, position').order('position', { ascending: true });
  if (error) { console.warn('fetchPipelines failed', error); return []; }
  return data ?? [];
}

export const telegramStatus = () => authedPost('/api/site-lead-admin', { action: 'status' });
export const telegramChats = () => authedPost('/api/site-lead-admin', { action: 'chats' });
export const telegramTest = (chatId) => authedPost('/api/site-lead-admin', { action: 'test', chatId });
export const newSiteKey = () => (globalThis.crypto?.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/-/g, '');
