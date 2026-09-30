import { fetchClientById } from './clients';
import { fetchDealsForClient } from './deals';
import { fetchTasksForClient } from './tasks';
import { fetchConversations } from './aiConversations';

// Deterministic aggregation step for the AI Account Manager agent —
// pulls a client's existing data across tables that already exist
// (clients, deals, tasks, ai_agent_conversations), all via already-proven
// fetch functions other pages already use. No new API, no new tables.
export async function fetchClientBriefingData(clientId) {
  const [client, deals, tasks, conversations] = await Promise.all([
    fetchClientById(clientId),
    fetchDealsForClient(clientId),
    fetchTasksForClient(clientId),
    fetchConversations(clientId),
  ]);
  return { client, deals, tasks, conversations };
}
