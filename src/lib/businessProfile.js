import { supabase } from './supabaseClient';

// The business profile lives on BOTH a contact (clients) and each of its deals
// under the same column names, and the app keeps the two in step:
//   - a new deal starts as a copy of its client's profile (createDeal),
//   - editing a field on a deal also writes it to the client,
//   - editing it on the client also writes it to the client's still-open deals
//     (won / lost / archived deals keep the values they closed with).
// Last edit wins on either side; there is no merge.
export const BUSINESS_FIELDS = [
  'business_category', 'niche', 'service_tag_ids', 'promo_geo', 'goals', 'previous_results', 'other_notes',
];

export function pickBusinessFields(obj) {
  const out = {};
  for (const k of BUSINESS_FIELDS) if (obj && k in obj) out[k] = obj[k];
  return out;
}

// Fire-and-forget: a mirror hiccup must never fail the edit the user just made.
export async function mirrorDealPatchToClient(dealId, patch) {
  const fields = pickBusinessFields(patch);
  if (!Object.keys(fields).length) return;
  try {
    const { data: deal } = await supabase.from('deals').select('client_id').eq('id', dealId).maybeSingle();
    if (!deal?.client_id) return;
    const { error } = await supabase.from('clients').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', deal.client_id);
    if (error) console.warn('mirrorDealPatchToClient failed', error);
  } catch (e) { console.warn('mirrorDealPatchToClient failed', e); }
}

export async function mirrorClientPatchToOpenDeals(clientId, patch) {
  const fields = pickBusinessFields(patch);
  if (!Object.keys(fields).length) return;
  try {
    const { data: deals, error } = await supabase
      .from('deals').select('id, deal_stages(is_won, is_lost)').eq('client_id', clientId).eq('archived', false);
    if (error) { console.warn('mirrorClientPatchToOpenDeals failed', error); return; }
    const openIds = (deals || []).filter((d) => !d.deal_stages?.is_won && !d.deal_stages?.is_lost).map((d) => d.id);
    if (!openIds.length) return;
    const { error: upErr } = await supabase.from('deals').update({ ...fields, updated_at: new Date().toISOString() }).in('id', openIds);
    if (upErr) console.warn('mirrorClientPatchToOpenDeals update failed', upErr);
  } catch (e) { console.warn('mirrorClientPatchToOpenDeals failed', e); }
}

// The client's current profile, used to seed a freshly created deal. Returns {}
// when the client can't be read (e.g. before the migration is applied).
export async function fetchClientBusinessProfile(clientId) {
  if (!clientId) return {};
  const { data, error } = await supabase.from('clients').select([...BUSINESS_FIELDS, 'source'].join(', ')).eq('id', clientId).maybeSingle();
  if (error) { console.warn('fetchClientBusinessProfile failed', error); return {}; }
  return data || {};
}
