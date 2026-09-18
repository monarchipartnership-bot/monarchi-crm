import { supabase } from '../supabaseClient';

export async function fetchNotifications(email) {
  if (!email) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_email', email)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) { console.warn('fetchNotifications failed', error); return []; }
  return data ?? [];
}

export async function fetchUnreadCount(email) {
  if (!email) return 0;
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_email', email)
    .eq('read', false);
  if (error) { console.warn('fetchUnreadCount failed', error); return 0; }
  return count ?? 0;
}

// No-op for a self-mention — mentioning your own name shouldn't page you.
export async function createMentionNotification({ recipientEmail, senderEmail, dealId, noteExcerpt }) {
  if (!recipientEmail || recipientEmail === senderEmail) return;
  const { error } = await supabase.from('notifications').insert({
    recipient_email: recipientEmail,
    sender_email: senderEmail || null,
    type: 'mention',
    deal_id: dealId,
    note_excerpt: noteExcerpt || null,
  });
  if (error) console.warn('createMentionNotification failed', error);
}

// Unlike mentions, self-assignment is NOT skipped — setting a task/call on
// yourself ("нагадай мені...") is a normal way to use this, and should still
// leave a receipt in the notification feed alongside its later reminder
// (which never skips self-created items either).
// `dealTitle`/`clientLabel`/`scheduledAt` are snapshotted onto the row at
// creation time (same as the server-side reminder writer) so the bell panel
// can show "угода / клієнт / опис / час" without fetching deals itself.
export async function createTaskAssignedNotification({ recipientEmail, senderEmail, dealId, taskId, noteExcerpt, dealTitle, clientLabel, scheduledAt, activityType }) {
  if (!recipientEmail) return;
  const { error } = await supabase.from('notifications').insert({
    recipient_email: recipientEmail,
    sender_email: senderEmail || null,
    type: 'assigned',
    deal_id: dealId || null,
    task_id: taskId || null,
    note_excerpt: noteExcerpt || null,
    deal_title: dealTitle || null,
    client_label: clientLabel || null,
    task_scheduled_at: scheduledAt || null,
    activity_type: activityType || null,
  });
  if (error) console.warn('createTaskAssignedNotification failed', error);
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
  if (error) console.warn('markNotificationRead failed', error);
}

export async function markAllNotificationsRead(email) {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('recipient_email', email).eq('read', false);
  if (error) console.warn('markAllNotificationsRead failed', error);
}
