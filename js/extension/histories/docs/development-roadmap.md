# Histories Development Roadmap

Updated: 2026-07-06

## Current Baseline

Verified:

- HTU 1.8.9 TSV format behavior.
- External full backup round-trip compatibility.
- Firefox cannot use SQLite OPFS VFS in the tested extension context.
- SQLite WASM itself works in Chrome and Firefox.
- SQLite WASM `:memory:` + FTS5 `trigram` works for title/URL substring search.
- SQLite FTS snapshot can be saved to and loaded from IndexedDB.
- HTU bulk import uses chunked page and visit storage; per-record IndexedDB writes are too slow at the full backup scale.

Current committed runtime code:

- HTU TSV parser/serializer module.
- HTU TSV tests.
- WXT extension skeleton.
- Background runtime adapter.
- Options page shell.
- IndexedDB schema bootstrap and basic status readout.
- IndexedDB helper APIs for pages, visits, jobs, snapshots, and indexed visit range scans.
- HTU import core for parse, exact-URL page aggregation, page chunks, visit chunks, and progress callbacks.
- Chunk reader APIs for page chunk decoding, stable page-id lookup, visit chunk decoding, and time-range visit scans.
- Search engine core for SQLite FTS schema setup, page-chunk rebuild, snapshot save/load, keyword search, and IndexedDB snapshot storage adapter.
- Browser-page SQLite WASM runtime adapter with bundled `sqlite3.js/sqlite3.wasm` assets and real browser smoke coverage.
- Options page task flow for HTU import, snapshot rebuild, job listing, and snapshot-backed search.
- HTU import module worker client/worker path with persisted job updates and cancellation support.
- Search rebuild classic-worker path with worker-side SQLite WASM initialization, persisted job updates, and cancellation support.

## Milestone 1: Project Skeleton

Deliverables:

- Build tool selected and configured.
- Shared TypeScript source tree.
- Generated Chrome manifest.
- Generated Firefox manifest.
- Basic extension page shell.
- Worker/service architecture skeleton.
- Lint/build/test commands.

Acceptance:

- Chrome package builds. Done.
- Firefox package builds. Done.
- Both load as unpacked/temporary extensions. Pending manual browser load check.
- A placeholder history page can message the background/runtime layer. Done in the options page.

## Milestone 2: Core Storage

Deliverables:

- IndexedDB wrapper with schema migrations.
- `pages` store.
- `page_chunks` store for bulk imports.
- minimal `visits` store.
- `visit_chunks` store for bulk imports and time scans.
- `jobs` store.
- `search_snapshot` store.
- browser API compatibility adapter.

Acceptance:

- Can write/read pages and visits in a browser IndexedDB context. Done in Chrome/Edge smoke test harness.
- Can range-scan `visits.visit_time`. Done in browser smoke test.
- Can query `[page_id, visit_time]`. Done in browser smoke test.
- Can query `[transition, visit_time]`. Done in browser smoke test.
- Can recover from interrupted job state. API added; resume semantics pending import/sync jobs.
- Can read bulk-import chunks for export/search/time filters. Done for page chunks and visit chunks.

## Milestone 3: HTU Import Pipeline

Deliverables:

- Import worker using the existing HTU TSV parser.
- Bulk page aggregation.
- Bulk visit writes.
- Import progress UI.
- External backup test command using `HISTORIES_HTU_BACKUP`.

Acceptance:

- Imports the external backup without URL/title logging. Done in full-browser benchmark.
- Preserves all 4-column rows structurally. Parser/export round-trip done.
- Writes expected page and visit counts. Done: `887,561` visits and `384,065` exact-URL pages.
- Applies configurable page and visit chunk sizes on the chunk storage path. Done in browser smoke coverage.
- Can run as a module worker job with progress, persisted job records, and cancellation. Done for HTU import.
- Can resume or restart safely after cancellation. Restart is supported by starting a new job; resumable cursor state is still pending.

## Milestone 4: SQLite FTS Search Module

Deliverables:

- SQLite WASM loader.
- Browser-page SQLite WASM loader. Done.
- FTS5 trigram schema. Done in search engine core.
- Build FTS from page chunks. Done in search engine core.
- Save FTS snapshot to IndexedDB. Done through the storage adapter contract.
- Load FTS snapshot from IndexedDB. Done through the storage adapter contract.
- Dirty snapshot tracking.
- Keyword search API. Done at page-result level.

Acceptance:

- Snapshot loads in Chrome and Firefox.
- Queries such as `ifen`, `yifen`, `yifeng`, `feng`, `ruan` work.
- Typical query time stays under target on the external backup scale.
- Snapshot corruption triggers rebuild, not data loss.
- Runtime adapter can be tested without SQLite WASM by injecting a fake runtime. Done.
- Real browser-page SQLite WASM runtime path is verified. Done.
- Real worker-side SQLite WASM runtime path is verified by using a classic worker URL with `sqlite3.dir` query parameters. Done.

## Milestone 5: Keyword + Time Search

Deliverables:

- Search planner.
- Keyword-only page search. Done.
- Time-only visit search. Chunk primitives done; dedicated UI/query mode still pending.
- Keyword plus time-range search. Done at page-result level through FTS/page-id and visit-chunk intersection.
- Transition filter support.
- Domain/host filter support.

Acceptance:

- Time-only queries use IndexedDB visit-time indexes.
- Keyword plus time range intersects FTS page ids with visit-time results. Done.
- Narrow time ranges avoid scanning all visits.
- Result semantics are explicit: page-level when no visit filter is active, visit-level when time/transition filters are active.
  Current implementation still returns page-level rows with `matchedVisitCount` and `matchedVisitTime` metadata when a time filter is active.

## Milestone 6: Browser History Sync

Deliverables:

- Initial full sync using `startTime: 0`.
- New visit listener.
- Title update handling.
- Deletion handling.
- Snapshot dirty/save scheduling.
- Status reporting.

Acceptance:

- Full sync captures all available browser history.
- New visits appear in search after sync.
- Snapshot is not rewritten for every single visit.
- Deletions are reflected in pages, visits, and FTS.

## Milestone 7: HTU Export

Deliverables:

- 4-column archived/backup export.
- 8-column analysis/search/trends export.
- Export filters.
- Download handling for Chrome and Firefox.
- Round-trip tests.

Acceptance:

- 4-column export can be imported by HTU.
- Export format preserves CRLF, `U` timestamps, transition ids, and empty title behavior.
- External backup round-trip hash test remains green where no data changes are applied.

## Milestone 8: Search UI

Deliverables:

- Search page.
- Keyword input.
- Time range controls.
- Domain/host/transition filters.
- Result list.
- Page detail/timeline view.
- Loading/error/empty states.

Acceptance:

- Search is usable with the external backup scale.
- Long operations show progress.
- Results do not expose debug logs or private data.
- Text fits and layout works on desktop and mobile extension pages.

## Milestone 9: Statistics

Deliverables:

- On-demand statistics jobs.
- Staleable `stats_*` stores.
- HTU-compatible statistics views.
- Domain/time trend views.

Acceptance:

- Opening statistics does not block sync/search.
- Stats can rebuild in the background.
- Stats can be invalidated after history changes.

## Milestone 10: Packaging and Verification

Deliverables:

- Chrome build verification.
- Firefox build verification.
- Manual install notes.
- Test checklist.
- Release notes.

Acceptance:

- Chrome and Firefox packages build reproducibly.
- Import/search/export/sync work in both browsers.
- Known limitations are documented.

## Immediate Development Order

1. Build skeleton.
2. IndexedDB core storage.
3. HTU import pipeline.
4. SQLite FTS search module.
5. Keyword plus time-range search.
6. HTU export.
7. Browser history sync.
8. Search UI.

Do not start statistics UI until sync and search are working against the external full backup scale.
