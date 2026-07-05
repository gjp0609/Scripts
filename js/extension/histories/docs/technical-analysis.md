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

Chosen primary route:

- Use IndexedDB as the cross-browser durable storage backend.
- Keep a storage adapter boundary so a Chrome-only SQLite OPFS backend can be added later without changing import/export or UI code.
- Implement search as a portable index over IndexedDB data instead of depending on SQLite FTS5.
- Keep HTU SQLite/FTS5 behavior as a compatibility reference, not as a hard runtime dependency.

The chosen data layer must support:

- one row per visit
- URL-level metadata
- FTS-like search over URL and title
- materialized fields for date/year/month/month day/week day/hour
- import/export scans over large data sets
- Chrome MV3 service-worker constraints
- Firefox background/runtime constraints

Recommended IndexedDB object stores:

- `pages`: key by stable page id; unique index on normalized URL.
- `visits`: key by visit id; indexes on page id, visit time, transition, day, month, weekday, and hour.
- `terms`: search term dictionary.
- `postings`: inverted index entries keyed by term and page/visit references.
- `stats_daily`: materialized day-level aggregates.
- `stats_domain`: materialized host/domain aggregates.
- `jobs`: resumable import/export/sync job state.

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

Improved portable search index design:

- normalize title, URL, hostname, path, query, and decoded URL text
- tokenize ASCII words, URL segments, and CJK n-grams
- keep an exact substring fallback for compatibility
- rank by recency, token coverage, field weight, typed count, and visit count
- execute candidate retrieval through IndexedDB term postings and apply final matching in workers
- keep search jobs cancellable and chunked so large histories do not block the UI

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
