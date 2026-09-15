import { supabase } from '../supabaseClient';

const BUCKET = 'client-files';

export async function uploadClientFile(clientId, file, uploadedBy) {
  const path = `clients/${clientId}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) { console.warn('uploadClientFile failed', uploadError); return null; }
  const { data, error } = await supabase.from('client_files').insert({
    client_id: clientId, path, file_name: file.name, size: file.size, mime_type: file.type, uploaded_by: uploadedBy || null,
  }).select().single();
  if (error) { console.warn('client_files insert failed', error); return null; }
  return data;
}

export async function fetchClientFiles(clientId) {
  const { data, error } = await supabase.from('client_files').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
  if (error) { console.warn('fetchClientFiles failed', error); return []; }
  return data ?? [];
}

export async function deleteClientFile(fileId, path) {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([path]);
  if (storageError) console.warn('storage remove failed', storageError);
  const { error } = await supabase.from('client_files').delete().eq('id', fileId);
  if (error) console.warn('client_files delete failed', error);
}

export function getClientFilePublicUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
