import { upsertClientDirectoryEntry } from './api/clients';
import { fetchOpenDealForClient, createDeal, updateDealFields } from './api/deals';
import { fetchPipelines } from './api/pipelines';
import { upsertDealNoteForDate } from './api/dealNotes';

// Syncs a report's own "Клієнти" mentions list into the real client
// directory and pipeline. Daily Report is the one true origin for this —
// it's called from every report type's autosave, but Weekly/Monthly are
// meant to be read-mostly rollups of Daily's own data (Weekly imports
// Daily's mentions, Monthly aggregates Weekly's), so re-running this for
// every row on every save there would just be redundant work against
// clients/deals Daily already created. Callers are expected to pre-filter
// to only what's genuinely new at their own level (WeeklyCreate.jsx passes
// only its non-`fromDaily` rows; MonthlyCreate.jsx doesn't call this at
// all any more).
//
// Each mentioned client gets upserted (matched by normalized name) with
// this mention's own platform/status/manager, and gets one open deal in
// the pipeline matching their platform if they don't already have one
// there (not a new deal per mention — fetchOpenDealForClient checks first,
// scoped per-pipeline since a client can genuinely have separate open
// deals across different platforms at once). The deal's title comes from
// the client row's own `title` field (e.g. the Upwork job post's own
// title). It's backfilled — not just set at creation — because a manager
// realistically fills Ім'я/Назва/Інформація one at a time, and each field
// change is its own debounced autosave: the very first save (name only)
// already creates the deal before Назва exists, so a later save still
// needs to fill the title in once it shows up. Only fills a title that's
// currently blank — never overwrites one someone already set, whether
// through this same flow earlier or by hand on the deal itself.
//
// Whatever's in the row's `text` ("Інформація") gets logged onto that deal
// as a note, upserted by `reportDate` so retyping the same day's text
// during autosave updates one note instead of spawning a new one each
// time. Best-effort and fire-and-forget — never throws, so a directory
// hiccup never blocks the report's own save from completing.
//
// `onLinked(rowId, clientId)` (optional) fires as soon as a row's client is
// resolved (whether just created or an existing match) — the caller uses it
// to backfill that row's own `clientId` in its local state, since this
// function only gets a snapshot of `clients` and can't update the caller's
// state itself. Without this, a row typed fresh (not picked from
// ClientNameField's directory search) would never get a real `clientId`
// locally, even though the directory/deal side is fully linked — leaving
// any "open the linked deal/contact" UI permanently unable to find it.
export function syncReportClientsToDirectory(clients, manager, reportDate, onLinked) {
  fetchPipelines().then((pipelines) => {
    clients.forEach((c) => {
      if (!c.name?.trim()) return;
      const pipeline = pipelines.find((p) => p.name === c.platform);
      if (!pipeline) return;
      upsertClientDirectoryEntry({ name: c.name, platform: c.platform, status: c.leadType, manager })
        .then(async (client) => {
          if (!client) return;
          if (c.id && client.id !== c.clientId) onLinked?.(c.id, client.id);
          let deal = await fetchOpenDealForClient(client.id, pipeline.id);
          if (!deal) {
            deal = await createDeal({ clientId: client.id, manager, pipelineId: pipeline.id, title: c.title });
          } else if (!deal.title?.trim() && c.title?.trim()) {
            await updateDealFields(deal.id, { title: c.title.trim() });
          }
          if (deal && reportDate && c.text?.trim()) {
            await upsertDealNoteForDate(deal.id, reportDate, c.text.trim(), manager);
          }
        })
        .catch(() => {});
    });
  });
}
