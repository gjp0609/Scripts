# Histories Architecture Design

Updated: 2026-07-05

## 2026-08-17 Frozen Phase-One Decisions

### Extension storage and search

- Chrome and Firefox extension origins both persisted the full `900,177`-visit dataset and a `602,546,176`-byte SQLite snapshot across browser restarts.
- Chrome reported about 64 GiB quota with `persisted=false`; Firefox reported about 100 GiB with `persisted=true`. The current full dataset used about 428 MiB and 412 MiB respectively according to `navigator.storage.estimate()`.
- Search snapshot loading validates schema version, byte length, and FTS page count. A missing or corrupt snapshot is an index failure, never a main-data failure.
- MV3 extension pages require `script-src 'self' 'wasm-unsafe-eval'` for SQLite WASM.
- FTS rebuild inserts run in one explicit SQLite transaction. Per-row auto-commit is not viable at full scale.

### Stable time pagination

- The stable order is `(matchedVisitTime DESC, pageId DESC)`.
- The first query freezes an `endTime` watermark. Every following cursor carries the same watermark so newly arriving visits cannot shift an active result set.
- Visit chunks are loaded once, sorted by `minVisitTime`, and retained as typed arrays while the search engine is active.
- Each page scans visits backward until it finds `limit + 1` distinct candidate pages, including all candidates tied at the boundary timestamp. It then counts visits only for the selected page ids.
- FTS returns page-id candidates only. Candidate membership is stored as a cached `Uint8Array` bitmap; page metadata is fetched from SQLite only for selected ids.
- Full-data measurements: time-only first page `0.8-25.6 ms`, ordinary cold keyword pages `18.8-68 ms`, and ten sequential `github` pages P50 `16.3 ms`. The extreme high-hit cold `google` query was `120.5 ms`; subsequent pages use the cache and remain about `15-18 ms`.

### Browser visit identity

- `history.onVisited` emits a page summary, not a visit record. It exposes no `visitId` or transition in either verified browser.
- After `onVisited`, the collector must call `history.getVisits({ url })` and ingest unseen visit records from a safe overlap window.
- Browser-source identity is `(sourceInstanceId, visitId)` when `visitId` is present. Exact URL, visit time, and transition form a cross-channel compatibility fingerprint for scans, retries, and HTU rows.
- Title, `typedCount`, `isLocal`, and `referringVisitId` are source metadata, not canonical identity fields.
- Chrome exposed separate link and reload visits. Firefox coalesced the tested reload and did not expose a second reload visit. The collector must preserve what the browser API reports and must not synthesize unavailable visits.
- Chromium exposed `typedCount` on history items and `isLocal` on visits; Firefox did not consistently expose those fields. Shared storage cannot require them.
- Browser page identity keeps the exact browser URL (including hash) for collection/deduplication; HTU page normalization remains hash-free for archive compatibility. This prevents two exact browser fragment URLs from collapsing while preserving legacy HTU behavior.
- Background collection serializes generation publication. `history.onVisited` is coalesced for 250 ms, then `getVisits` completion supplies visit records. Incremental scans use a 5-second overlap and activation uses parent-generation compare-and-swap, so stale concurrent jobs fail safely instead of overwriting newer data.

### Unified durable layout

- Main data uses versioned generations. An active-generation pointer is the atomic publication boundary.
- Page and visit segments are immutable once published. Both HTU batches and browser increments use the same segment encoding.
- Visits have a time-sorted segment representation for queries and a page/time/transition identity representation for merge deduplication.
- Small real-time writes first enter durable delta segments. Import or compaction builds a new generation from the active generation plus staged input, then atomically switches the active pointer.
- Search snapshots, page aggregates, candidate bitmaps, and statistics are derived data and never participate in the main-data commit decision.
- Database v6 stores `historyGenerations`, `generationPageChunks`, and `generationVisitChunks`; legacy `pages`, `visits`, `pageChunks`, and `visitChunks` remain read-only compatibility fallbacks until the next successful generation publication.
- Each activation assigns a monotonically increasing generation revision and atomically writes its dirty-page records. Internal `generationId` and segment ordinal fields never escape public chunk readers.
- Failed staging writes abort their IndexedDB transaction. A generation that fails before activation remains invisible and can be removed by stale-generation cleanup without touching the active generation.
- A browser profile owns a random persistent history source referenced by `historyMetadata.localBrowserSource`. Browser visit source keys are `sourceInstanceId:visitId`; missing native visit ids use the compatibility fingerprint fallback.
- Resumable jobs use owner leases. Terminal jobs release owner and lease fields, and synchronization writes its committed `nextStartTime` only after active-generation publication.
- HTU file sources use `source:htu:<sha256>` identities. Import batches retain per-file format, row/time-range, added, duplicate, ignored, and error counts.
- Visit segments encode HTU provenance compactly: a per-segment source-id dictionary, one offset array, and a flat source-reference array. A duplicate visit can therefore retain all contributing files without repeating 64-character hashes on every row.
- Empty-library multi-file imports sort a flat visit array and collapse adjacent fingerprints; non-empty imports merge against the active generation. Both paths choose deterministic titles/source ownership so reversing file order produces the same canonical history.

## Goal

Build a Chrome and Firefox compatible history extension that can replace History Trends Unlimited.

Primary goals:

- Import all browser history and keep it synchronized.
- Search large history sets quickly by title and URL.
- Support keyword plus time-range queries.
- Import and export HTU-compatible TSV files.
- Preserve HTU-compatible behavior where compatibility matters.

Non-goals:

- New tab replacement.
- QR code tools.
- Translation tools.
- Reusing the removed extension runtime code.

## Architecture Overview

The implementation uses two storage/search layers:

- IndexedDB is the durable source of truth.
- SQLite WASM `:memory:` with FTS5 `trigram` is the search engine.

SQLite OPFS is not required. Chrome can use SQLite OPFS, but Firefox extension pages do not expose the conditions needed by SQLite OPFS VFS in the verified environment.

High-level flow:

```text
Browser history API / HTU import
  -> normalize URL/page/visit records
  -> IndexedDB pages + minimal visits
  -> SQLite FTS in worker for title+URL search
  -> SQLite FTS snapshot stored in IndexedDB
```

Startup flow:

```text
open extension
  -> open IndexedDB
  -> load latest SQLite FTS snapshot
  -> create SQLite :memory: database from snapshot bytes
  -> search is ready
```

If no snapshot exists:

```text
open extension
  -> build FTS from IndexedDB pages
  -> save snapshot
```

## Browser Model

Use generated browser-specific manifests:

- Chrome: Manifest V3 with `background.service_worker`.
- Firefox: Firefox-compatible WebExtension manifest with supported background scripts/pages.

Shared source should not depend directly on `chrome.*` or `browser.*`. Use a small compatibility adapter for:

- history API
- runtime messaging
- storage permissions
- downloads
- i18n

## Data Model

### `pages`

Durable URL-level metadata.

Required fields:

- `id`
- `url`
- `normalized_url`
- `title`
- `host`
- `domain`
- `visit_count`
- `last_visit_time`
- `created_at`
- `updated_at`

Indexes:

- `normalized_url`, unique
- `host`
- `domain`
- `last_visit_time`

### `visits`

Minimal visit records. Keep the sync hot path small.

Required fields:

- `id`
- `page_id`
- `visit_time`
- `transition`

Indexes:

- `visit_time`
- `[page_id, visit_time]`
- `[transition, visit_time]`

Do not store `day`, `month`, `weekday`, or `hour` on every visit by default. Those values are low-frequency statistics derivatives.

### `search_snapshot`

Stores the serialized SQLite FTS database.

Required fields:

- `key`
- `schema_version`
- `sqlite_version`
- `created_at`
- `source_revision`
- `bytes`
- `page_count`
- `snapshot_size`

### `jobs`

Tracks resumable imports, exports, sync jobs, FTS rebuilds, and statistics builds.

Required fields:

- `id`
- `type`
- `status`
- `started_at`
- `updated_at`
- `cursor`
- `progress`
- `error`

### `stats_*`

Statistics are generated on demand and cached.

Examples:

- `stats_daily`
- `stats_domain`
- `stats_hourly`
- `stats_weekday`

Statistics stores are staleable. History mutations should mark relevant stats stale instead of recomputing them synchronously.

## Search Design

SQLite FTS table:

```sql
CREATE VIRTUAL TABLE pages_fts USING fts5(
  search_text,
  page_id UNINDEXED,
  visit_count UNINDEXED,
  last_visit_time UNINDEXED,
  tokenize = 'trigram'
);
```

`search_text` contains normalized title and URL text:

- title
- original URL
- decoded URL
- host/domain/path/query text

The exact fields should be tuned to reduce snapshot size while preserving match quality.

Search modes:

- Keyword-only: SQLite FTS returns page-level results.
- Time-only: IndexedDB `visits.visit_time` returns visit-level results.
- Keyword plus time range: intersect SQLite FTS page ids with IndexedDB visit-time range results.
- Keyword plus transition: intersect SQLite FTS page ids with IndexedDB transition/time indexes.

Query planning:

- Narrow time range: scan IndexedDB visit-time range first, then intersect with FTS page ids.
- Broad time range or no range: run FTS first, then filter visits.
- Result rows should be visit-level when a visit filter is active; otherwise page-level results are acceptable.

## Synchronization Design

Initial sync:

```text
history.search({ text: "", startTime: 0, maxResults: large })
  -> page upsert
  -> minimal visit insert where available
  -> FTS update queue
  -> snapshot save after batch/import completes
```

Continuous sync:

- New visit: upsert page, insert visit, update in-memory FTS, mark snapshot dirty.
- Title change: update page title, update FTS row, mark snapshot dirty.
- Delete URL: delete page/visits/FTS row or mark tombstone depending on browser event detail.
- Delete range/all: remove affected visits, update page aggregates, update FTS if page no longer has visits.

Snapshot policy:

- Save immediately after initial import.
- Save after HTU import.
- Save on idle after batches of incremental changes.
- Avoid writing a 500MB snapshot for every single visit.

## HTU Compatibility Design

Compatibility parser and serializer stay independent from browser runtime and storage.

Supported import formats:

- 3-column archived format.
- 4-column archived/backup/transfer format.
- 8-column analysis/search/trends format.

Export requirements:

- 4-column archived/backup TSV must round-trip byte-for-byte when data is unchanged.
- CRLF line endings.
- `U<visit_time>` timestamp prefix for archived export.
- Numeric transition ids for archived export.
- No TSV quoting/escaping, matching HTU behavior.

## UI Design

Primary screens:

- Search/list view.
- Visit detail/page timeline.
- Import/export.
- Sync/status/settings.
- Statistics/trends.

Search screen must prioritize:

- keyword input
- time range filter
- transition filter
- domain/host filter
- result type: page-level or visit-level

Statistics screen is lower priority than search and synchronization.

## Reliability

Required recovery points:

- Initial browser-history import cursor.
- HTU import cursor.
- FTS rebuild status.
- Snapshot dirty flag.
- Last successful snapshot metadata.

If FTS snapshot is missing or corrupt:

- keep IndexedDB source data intact
- rebuild FTS from `pages`
- save a new snapshot

## Performance Targets

Targets based on the external full HTU backup:

- Parse HTU TSV under 5 seconds.
- First FTS build preferably under 2 minutes.
- Snapshot load under 5 seconds.
- Keyword search under 100 ms for common queries.
- Keyword plus time-range search under 200 ms for typical filters.
- Sync single new visit without UI-visible delay.

## Open Risks

- Extension-context quota for a roughly 558 MB search snapshot must be verified.
- Snapshot size needs reduction.
- Visit-level keyword plus time-range intersection must be benchmarked.
- Firefox and Chrome background lifecycle differences can affect long imports and snapshot saves.
- FTS snapshot updates must avoid excessive writes.
