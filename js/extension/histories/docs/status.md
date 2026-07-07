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
- The options page now opens the IndexedDB database, reports basic store counts, imports HTU TSV files, rebuilds the search snapshot, lists recent jobs, and runs keyword search against the snapshot.
- Keyword search now supports real visit-time intersection by combining SQLite FTS page matches with IndexedDB visit chunk stats for the requested time range.
- The options page now includes a direct 4-column HTU backup export button backed by chunk storage.
- Core IndexedDB helper APIs now exist for page upsert, page chunk writes/reads, visit bulk writes, visit chunk writes/reads, visit time-range scans, page/time scans, transition/time scans, jobs, and search snapshots.
- Chunk reader APIs can decode page chunks, locate a page by stable chunk page id, prefilter visit chunks by time range, and decode inclusive time-range visit rows from chunk storage.
- Visit chunks now preserve visit-level titles from HTU imports so archived export can reconstruct per-visit titles instead of collapsing to page-level metadata.
- Browser-level IndexedDB smoke test covers page upsert, visit writes, `visit_time`, `[page_id, visit_time]`, `[transition, visit_time]`, jobs, search snapshots, chunk page lookup, chunk visit decoding, and chunk time-range scans.
- HTU import core now parses HTU TSV text, aggregates pages by exact HTU URL, writes page chunks, writes visit chunks, and reports import progress.
- Browser-level smoke test covers a small HTU import into IndexedDB.
- Browser-level full backup import benchmark passed against the external HTU file: `887,561` rows, `384,065` pages, `887,561` visits, about `2.6s` import time and `3.2s` total browser-side time after fetch.
- HTU archived export core can now rebuild a 4-column backup TSV from page chunks plus visit chunks and preserve imported row order by `sourceIndex`.
- Storage route selected for implementation: IndexedDB primary backend for structured history data and minimal visit-time indexes.
- Search route selected for implementation: SQLite WASM `:memory:` with FTS5 trigram, persisted as an IndexedDB snapshot.
- SQLite WASM + OPFS is verified in Chrome but rejected as the common Chrome + Firefox storage backend after Firefox OPFS probe failure.
- A real external History Trends Unlimited backup file has been structurally verified and round-trip hashed, but it must stay outside the repository.
- The search engine module now has a production-facing SQLite FTS contract, page-chunk rebuild flow, snapshot save/load flow, keyword search API, IndexedDB storage adapter, and a real browser-page SQLite WASM runtime adapter.
- SQLite runtime assets are now bundled under `public/sqlite/` and confirmed in Chrome/Firefox WXT outputs.
- Real-browser SQLite WASM smoke coverage now verifies rebuild, snapshot load, and trigram search through the production adapter.
- HTU import now has a module-worker job path with persisted `jobs` records, progress updates, and cancellation.
- Search rebuild now has a classic-worker job path with persisted `jobs` records, progress updates, cancellation, and worker-side SQLite WASM initialization.
- The worker path relies on `search-rebuild-worker.js?sqlite3.dir=/sqlite` so the upstream `sqlite3.js` glue can resolve `sqlite3.wasm` correctly from a worker location.
- HTU import chunk size options now apply to chunk storage as well as record storage.

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

1. Move long-running import/search jobs behind background-controlled lifecycle instead of keeping them page-owned.
2. Move HTU export behind a worker/background-controlled path so large backups do not build on the options page thread.
3. Add browser history sync after import/search/export storage paths are stable.
4. Verify large-snapshot quota behavior in real extension contexts.
5. Move page-level search results toward visit-level result semantics when time filters are active.
6. Add exact export metadata for non-HTU-originated visits if browser-sync rows must preserve visit-level titles too.
