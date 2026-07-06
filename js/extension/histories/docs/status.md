# Histories Status

Updated: 2026-07-06

## Decision

The previous extension code has been discarded. The next version will be rewritten as a history-only extension targeting Chrome and Firefox.

## Removed Scope

- new tab page
- QR code page and context menu code
- translation page and context menu code
- placeholder test page
- previous SQLite-in-`chrome.storage.local` experiment
- bundled libraries that were only needed by removed features

## Product Goal

Replace History Trends Unlimited while improving search quality and performance.

Compatibility requirements:

- Chrome support
- Firefox support
- import History Trends Unlimited exports
- export files that History Trends Unlimited can import
- round-trip import/export compatibility must be tested at byte/field level
- search matching may be improved, but default compatibility behavior must remain available

## Current Implementation State

- WXT runtime skeleton exists.
- Chrome MV3 manifest generation has been verified.
- Firefox MV3 manifest generation has been verified.
- The options page can message the background/runtime layer.
- The options page opens the IndexedDB database and reports basic store counts.
- Core IndexedDB helper APIs now exist for page upsert, page chunk writes/reads, visit bulk writes, visit chunk writes/reads, visit time-range scans, page/time scans, transition/time scans, jobs, and search snapshots.
- Chunk reader APIs can decode page chunks, locate a page by stable chunk page id, prefilter visit chunks by time range, and decode inclusive time-range visit rows from chunk storage.
- Browser-level IndexedDB smoke test covers page upsert, visit writes, `visit_time`, `[page_id, visit_time]`, `[transition, visit_time]`, jobs, search snapshots, chunk page lookup, chunk visit decoding, and chunk time-range scans.
- HTU import core now parses HTU TSV text, aggregates pages by exact HTU URL, writes page chunks, writes visit chunks, and reports import progress.
- Browser-level smoke test covers a small HTU import into IndexedDB.
- Browser-level full backup import benchmark passed against the external HTU file: `887,561` rows, `384,065` pages, `887,561` visits, about `2.6s` import time and `3.2s` total browser-side time after fetch.
- Storage route selected for implementation: IndexedDB primary backend for structured history data and minimal visit-time indexes.
- Search route selected for implementation: SQLite WASM `:memory:` with FTS5 trigram, persisted as an IndexedDB snapshot.
- SQLite WASM + OPFS is verified in Chrome but rejected as the common Chrome + Firefox storage backend after Firefox OPFS probe failure.
- A real external History Trends Unlimited backup file has been structurally verified and round-trip hashed, but it must stay outside the repository.
- The search engine module is still a placeholder; SQLite WASM has not been promoted from probe code into runtime code.
- HTU import chunk size options now apply to chunk storage as well as record storage.
- The HTU import worker has not been implemented yet.

## Blockers Before Coding Compatibility

- If multiple HTU versions produce different formats, each format needs a fixture.
- Import/export tests must be written before parser implementation is considered complete.
- Extension-context IndexedDB quota must be validated for the SQLite FTS snapshot size.
- Structured visit-time indexes must be prototyped before building search filters.

## Working Assumptions

- HTU 1.8.9 exports backup/transfer TSV as 4 columns: `URL`, `U<visit_time>`, `transition_id`, `title`.
- HTU 1.8.9 exports analysis/search/trends TSV as 8 columns: `URL`, `host`, `domain`, `visit_time`, `local_time`, `weekday`, `transition_text`, `title`.
- Import compatibility must accept HTU 3-column, 4-column, and 8-column TSV variants.
- Firefox compatibility is a hard requirement, so the architecture cannot depend on Chrome-only extension APIs.

## Next Work

1. Move HTU import into a worker-facing job API with progress, cancellation, and restart state.
2. Promote SQLite WASM FTS snapshot search into production search modules.
3. Implement keyword plus time-range search planning on top of FTS page ids and chunk visit time ranges.
4. Implement HTU export from chunk storage.
5. Add browser history sync after import/search storage paths are stable.
