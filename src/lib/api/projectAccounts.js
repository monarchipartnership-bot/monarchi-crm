import { supabase } from '../supabaseClient';

// Ad accounts linked to projects (table project_ad_accounts, one per platform
// per project). The read helpers return [] instead of throwing if the table
// isn't there yet, so the Projects pages keep working before the migration
// 20261007000000_project_ad_accounts.sql has been applied.

export async function fetchProjectAccounts(projectId) {
  const { data, error } = await supabase.from('project_ad_accounts').select('*').eq('project_id', projectId).order('created_at', { ascending: true });
  if (error) { console.warn('fetchProjectAccounts failed', error); return []; }
  return data ?? [];
}

export async function fetchAllProjectAccounts() {
  const { data, error } = await supabase.from('project_ad_accounts').select('*');
  if (error) { console.warn('fetchAllProjectAccounts failed', error); return []; }
  return data ?? [];
}

// `account` is the plain object from lib/adAccounts.js ({ id, name, currency, timezone, status }).
export async function addProjectAccount({ projectId, platform, account, createdBy }) {
  const { error } = await supabase.from('project_ad_accounts').insert({
    project_id: projectId,
    platform,
    account_id: account.id,
    account_name: account.name,
    currency: account.currency,
    timezone: account.timezone,
    account_status: account.status,
    synced_at: new Date().toISOString(),
    created_by: createdBy || null,
  });
  if (error) {
    // 23505 = unique violation: this account is already linked to some project.
    if (error.code === '23505') throw new Error('Цей кабінет уже привʼязано до проєкту.');
    throw error;
  }
}

export async function refreshProjectAccount(id, account) {
  const { error } = await supabase.from('project_ad_accounts').update({
    account_name: account.name,
    currency: account.currency,
    timezone: account.timezone,
    account_status: account.status,
    synced_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

export async function removeProjectAccount(id) {
  const { error } = await supabase.from('project_ad_accounts').delete().eq('id', id);
  if (error) throw error;
}
