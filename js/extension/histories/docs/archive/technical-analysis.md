# Technical Analysis

## Browser Architecture

Chrome Manifest V3 requires extension background work to run in a service worker. Firefox WebExtensions support differs, especially around background execution. To keep one source tree without forcing one manifest to satisfy both browsers, use generated manifests:

- Chrome build: Manifest V3 with `background.service_worker`.
- Firefox build: Firefox-compatible WebExtension manifest using the supported background model for the selected target version.
- Shared source: TypeScript modules for history sync, storage, parser, search, and UI.

The build should produce two browser-specific extension directories.

## History Import

Initial sync must request all available history:

- `history.search({ text: "", startTime: 0, maxResults: largeOrUnlimited })`
- continue to listen to visit/title/delete events after initial sync
- persist an import cursor/checkpoint to recover from interruptions

Important point: using `text: ""` without `startTime: 0` is not sufficient for an unlimited-history replacement.

## Synchronization Model

Browser history APIs expose visits and history items differently across browsers. The internal model should separate:

- URL identity
- title history
- visit events
- aggregate counters
- deletion tombstones or cleanup events

Recommended tables:

- `pages`: stable URL-level metadata
- `visits`: one row per visit event where available
- `daily_stats`: materialized daily aggregates
- `domain_stats`: materialized domain aggregates
- `search_docs`: normalized searchable documents
- `import_jobs`: import/export job state

## Storage Engine

HTU 1.8.9 uses SQLite WASM and FTS5. That is the closest behavior match and gives a strong reference model for queries, import/export, and statistics.

Local probes changed the storage decision:

- Chrome extension pages can run SQLite WASM 3.46.1 with OPFS and FTS5.
- Firefox 140.5.0esr extension pages can load SQLite WASM, but the tested context does not provide `SharedArrayBuffer` or `crossOriginIsolated`, and SQLite OPFS VFS is not enabled.
- Therefore SQLite WASM + OPFS cannot be the required common storage engine for Chrome + Firefox.

Do not store a growing SQLite database as a single blob in `chrome.storage.local`. Exporting and rewriting the entire DB on every visit will become slow as history grows.

Chosen primary route after search probes:

- Use IndexedDB as the cross-browser durable structured storage backend.
- Keep a storage adapter boundary so a Chrome-only SQLite OPFS backend can be added later without changing import/export or UI code.
- Use SQLite WASM `:memory:` plus FTS5 `trigram` as the title/URL search engine.
- Persist the SQLite FTS database as an IndexedDB snapshot, not through OPFS.
- Keep HTU SQLite/FTS5 behavior as a compatibility reference and use FTS5 where it has been verified without OPFS.

The chosen data layer must support:

- one row per visit
- URL-level metadata
- SQLite FTS-backed search over URL and title
- fast visit-time range queries for sync, search filtering, and export
- import/export scans over large data sets
- Chrome MV3 service-worker constraints
- Firefox background/runtime constraints

Recommended IndexedDB object stores:

- `pages`: key by stable page id; unique index on normalized URL.
- `visits`: minimal visit rows keyed by visit id.
- `jobs`: resumable import/export/sync job state.
- `search_snapshot`: SQLite FTS snapshot bytes plus version/schema metadata.
- `stats_*`: optional staleable materialized aggregates generated only when statistics views need them.

Minimal visit row:

- `id`: stable visit id, for example `page_id + visit_time`.
- `page_id`: foreign key to `pages`.
- `visit_time`: original Unix timestamp in milliseconds, preserving fractional milliseconds when imported from HTU.
- `transition`: browser/HTU transition text.

Core visit indexes:

- `visit_time` for range filtering and export ordering.
- `[page_id, visit_time]` for page detail timelines.
- `[transition, visit_time]` for transition filters.

Statistics fields:

- Do not write `day`, `month`, `month_day`, `weekday`, or `hour` to every visit on the hot sync path.
- Derive those values in statistics jobs when the user opens statistics/trends views.
- Cache statistics in `stats_*` stores and mark them stale after history changes instead of synchronously recomputing them.
- Recording, sync, import/export, and search filtering have priority over low-frequency statistics.

## Search Strategy

The replacement needs two modes:

- compatibility mode: match History Trends Unlimited semantics as closely as possible
- improved mode: better tokenization, CJK handling, URL component matching, and ranking

HTU-compatible search should start from the HTU model:

- FTS5-style keyword query over `url` and `title`
- advanced title-only FTS
- date and time filters on stored visit fields
- domain filter over host/subdomain
- transition filter

Improved search design:

- normalize title, URL, hostname, path, query, and decoded URL text
- index title and URL text with SQLite FTS5 `trigram`
- support substring matches such as `ifen` matching `ruanyifeng`
- rank by recency, token coverage, field weight, typed count, and visit count
- execute FTS inside a worker using a SQLite WASM `:memory:` database restored from IndexedDB snapshot
- combine FTS page ids with IndexedDB time/domain/transition filters when filters are active
- keep search jobs cancellable and chunked so large histories do not block the UI

Combined keyword/time query strategy:

- Keyword-only query: run SQLite FTS first, rank page-level results, then fetch page metadata.
- Time-only query: scan IndexedDB `visits.visit_time` range and return visit-level rows.
- Keyword plus broad time range: run SQLite FTS for candidate page ids, then query IndexedDB visits by `[page_id, visit_time]` or page id batches and apply the time range.
- Keyword plus narrow time range: scan IndexedDB `visits.visit_time` range first, collect page ids, then intersect with SQLite FTS candidate page ids.
- Domain filters should use page metadata; transition and time filters should use visit indexes.
- The query planner can estimate selectivity from lightweight counts and last known FTS result size, but should not require precomputed statistics to search.
- Search result rows should represent visits when time filters are active and pages when no visit-level filter is active.

The old `%keyword%` SQL pattern is acceptable for small data sets but not enough for hundreds of thousands of rows.

## Import/Export Compatibility

Compatibility is a protocol, not a UI feature. Implement it as a standalone module:

- parser accepts byte input and returns structured rows plus warnings
- serializer accepts structured rows and emits exact target format
- fixtures lock line endings, column order, escaping, timestamp prefixes, encoding, and empty fields
- tests compare parsed rows and exported bytes

No compatibility claim should be made without fixtures from real HTU exports.

## UI Scope

Only history views are in scope:

- search
- filters
- detail/list view
- statistics matching HTU
- import/export
- settings for compatibility and search behavior

No new tab, QR code, translation, or unrelated side tools.
