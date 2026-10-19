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
export const telegramMembers = (chatId) => authedPost('/api/site-lead-admin', { action: 'members', chatId });
export const telegramTest = (chatId, { template, showButton } = {}) => authedPost('/api/site-lead-admin', { action: 'test', chatId, template, showButton });

// The chats the bot has seen and the people in them (filled by the bot's webhook); `ping` = mentioned in every lead message and reminder.
export async function fetchTgChats() {
  const { data, error } = await supabase.from('tg_chats').select('*');
  if (error) { console.warn('fetchTgChats failed', error); return []; }
  return data ?? [];
}
export async function fetchTgMembers(chatId) {
  const { data, error } = await supabase.from('tg_members').select('*').eq('chat_id', String(chatId)).order('name', { ascending: true });
  if (error) { console.warn('fetchTgMembers failed', error); return []; }
  return data ?? [];
}
export async function setMemberPing(chatId, userId, ping) {
  const { error } = await supabase.from('tg_members').update({ ping }).eq('chat_id', String(chatId)).eq('user_id', userId);
  if (error) throw error;
}
export const newSiteKey = () => (globalThis.crypto?.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/-/g, '');
