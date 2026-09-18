import { supabase } from '../supabaseClient';

// Reuses the existing `client-files` public bucket, same as
// dealNoteImages.js, under its own path prefix.
const BUCKET = 'client-files';

export async function uploadClientNoteImage(clientId, file) {
  const path = `client-notes/${clientId}/${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) { console.warn('uploadClientNoteImage failed', error); return null; }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
