import { supabase } from '../supabaseClient';

// Reuses the existing `client-files` public bucket (see clientFiles.js)
// under its own path prefix, instead of provisioning a new bucket.
const BUCKET = 'client-files';

export async function uploadDealNoteImage(dealId, file) {
  const path = `deal-notes/${dealId}/${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) { console.warn('uploadDealNoteImage failed', error); return null; }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
