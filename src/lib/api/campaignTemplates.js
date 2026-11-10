import { supabase } from '../supabaseClient';
import { createCampaign, launchCampaign, loadCampaignTeam, updateCampaign } from './campaigns';
import { saveAgent, kickQueue } from './agents';
import { saveCampaignMoney } from './campaignControl';
import { saveCreativeSetup } from './creatives';
import { cleanTemplate, planApply, platformsFor, snapshotOperation } from '../agents/campaignTemplates';

const must = ({ data, error }) => { if (error) throw error; return data; };
const NO_TABLE = 'Шаблони ще не підключені: потрібно застосувати міграцію 20261058_campaign_templates.';

export async function fetchTemplates() {
  const { data, error } = await supabase.from('ag_campaign_templates').select('*').order('created_at', { ascending: false });
  if (error) { if (/ag_campaign_templates|schema cache|does not exist/i.test(error.message || '')) return null; throw error; }
  return data || [];
}

// Saves how the operation is set up as a template. The client's own data (name, brief, goals) is not in it.
export async function saveTemplate({ campaign, name, description = '', withInstructions = true, email }) {
  const clean = String(name || '').trim();
  if (clean.length < 2) throw new Error('Дайте шаблону назву.');
  const team = await loadCampaignTeam(campaign, email);
  const payload = snapshotOperation({ campaign, agents: team.agents, withInstructions });
  const { data, error } = await supabase.from('ag_campaign_templates').insert({ name: clean.slice(0, 120), description: String(description).slice(0, 400), payload, created_by: email || null }).select().single();
  if (error) throw new Error(/ag_campaign_templates|schema cache|does not exist/i.test(error.message || '') ? NO_TABLE : error.message);
  return data;
}

export async function deleteTemplate(id) {
  must(await supabase.from('ag_campaign_templates').delete().eq('id', id).select('id'));
}

// A new operation for `project` set up like the template. → { campaign, dropped: [channels the project has no cabinet for], missing: [roles], launched }
// launch: also starts it (the server checks the rights; it costs money). A draft stays a draft otherwise.
export async function applyTemplate({ payload, project, name, email, launch = false }) {
  const template = cleanTemplate(payload);
  const { platforms, dropped } = platformsFor(template, project.accounts || []);
  if (!platforms.length) throw new Error('У проєкту немає жодного з каналів шаблону: привʼяжіть рекламний кабінет у картці проєкту.');
  let campaign = await createCampaign({ project, platforms, name: String(name || '').trim() || undefined, email });
  let team = await loadCampaignTeam(campaign, email);
  const plan = planApply({ ...template, platforms }, team.agents, { by: email });
  for (const p of plan.patches) {
    await saveAgent(p.id, { enabled: p.enabled, config: p.config, schedule: p.schedule }, email);
  }
  campaign = await updateCampaign(campaign.id, { config: { ...(campaign.config || {}), ...plan.config } });
  campaign = await saveCreativeSetup(campaign, template.creative, email);
  if (template.spendCapUsd != null || template.notifyStepUsd !== 2) await saveCampaignMoney(campaign.id, { capUsd: template.spendCapUsd == null ? '' : template.spendCapUsd, stepUsd: template.notifyStepUsd });
  if (launch) { await launchCampaign(campaign.id); kickQueue().catch(() => {}); }
  return { campaign, dropped, missing: plan.missing, launched: launch };
}

// «Копіювати на інший проєкт»: the same as a template, taken from a live operation (nothing is stored).
export async function copyOperation({ campaign, project, name, email, withInstructions = true, launch = false }) {
  const team = await loadCampaignTeam(campaign, email);
  return applyTemplate({ payload: snapshotOperation({ campaign, agents: team.agents, withInstructions }), project, name, email, launch });
}
