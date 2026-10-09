// Wiring of the shared model client for the server: the real Anthropic SDK (our API key from the
// environment) and the usage log in Supabase, written with the signed-in person's own token so the
// normal row-level security applies. Endpoints call getModelClient(token).callModel({...}).
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { createModelClient } from './modelClient.js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

export function createSupabaseStore(accessToken) {
  const db = createClient(SUPA_URL, SUPA_KEY, { global: { headers: { Authorization: 'Bearer ' + accessToken } }, auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async recordCall(row) {
      const { error } = await db.from('ai_calls').insert(row);
      if (error) throw error;
    },
    async limits() {
      const { data, error } = await db.from('ai_budgets').select('scope, period, limit_usd').eq('enabled', true);
      if (error) throw error;
      return data || [];
    },
    async spentSince(sinceIso, agentKey) {
      const { data, error } = await db.rpc('ai_spent_since', { since: sinceIso, agent: agentKey });
      if (error) throw error;
      return Number(data) || 0;
    },
  };
}

let sdk = null;
const getSdk = () => {
  if (!sdk) sdk = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: 120000 }); // retries are ours, so they are counted
  return sdk;
};

export function getModelClient(accessToken) {
  return createModelClient({ getSdk, store: createSupabaseStore(accessToken) });
}
