import { supabase } from '../supabaseClient';
import { ALL_INPUT_KEYS, ASSET_KINDS, cleanSettings, manualInput } from '../agents/projectCreative';
import { BUCKET, FILE_TYPES, MAX_FILE_MB, safeName } from './creatives';

// «Креативи» of a project (migration 20261042): the client's materials, the brand and the rules, and the data other departments' agents deliver for the
// creative strategist. Reads and writes go through row-level security as the signed-in person.
const nowIso = () => new Date().toISOString();
const must = ({ data, error }) => { if (error) throw error; return data; };

export const DEFAULT_SETTINGS = { figma_url: '', cta_mode: 'always', cta_text: '', restrictions: '', inputs: {} };

// the ad accounts of the project (which cabinets the agents can read): only the platforms
export async function fetchProjectAccounts(projectId) {
  return must(await supabase.from('project_ad_accounts').select('platform').eq('project_id', projectId)) || [];
}

export async function fetchProjectCreative(projectId) {
  const [row, assets] = await Promise.all([
    supabase.from('project_creative').select('*').eq('project_id', projectId).maybeSingle(),
    supabase.from('project_creative_assets').select('*').eq('project_id', projectId).order('id', { ascending: true }),
  ]);
  return { settings: { ...DEFAULT_SETTINGS, ...(must(row) || {}) }, assets: must(assets) || [] };
}

async function upsert(projectId, patch, email) {
  return must(await supabase.from('project_creative').upsert({ project_id: projectId, ...patch, updated_by: email || null, updated_at: nowIso() }, { onConflict: 'project_id' }).select().single());
}

export const saveSettings = (projectId, input, email) => upsert(projectId, cleanSettings(input), email);

// One field of the data from other departments, written by hand: the rest of `inputs` is kept as it is. An empty text clears the field.
export async function saveInput(projectId, key, body, email) {
  if (!ALL_INPUT_KEYS.includes(key)) throw new Error('Невідоме поле.');
  const row = must(await supabase.from('project_creative').select('inputs').eq('project_id', projectId).maybeSingle());
  const inputs = { ...(row?.inputs || {}) };
  const item = manualInput(body, email);
  if (item) inputs[key] = item; else delete inputs[key];
  return upsert(projectId, { inputs }, email);
}

export async function uploadAsset(projectId, file, kind, email) {
  if (!FILE_TYPES.includes(file.type)) throw new Error('Підходять лише картинки PNG, JPG або WebP.');
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`Файл більший за ${MAX_FILE_MB} МБ.`);
  const path = `projects/${projectId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw new Error(up.error.message || 'Не вдалося завантажити файл.');
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return must(await supabase.from('project_creative_assets').insert({ project_id: projectId, kind: ASSET_KINDS[kind] ? kind : 'other', name: file.name.slice(0, 160), url: data.publicUrl, path, created_by: email || null }).select().single());
}

export async function deleteAsset(asset) {
  must(await supabase.from('project_creative_assets').delete().eq('id', asset.id).select());
  if (asset.path) await supabase.storage.from(BUCKET).remove([asset.path]).catch(() => {}); // the file may already be gone: the row is what matters
}
