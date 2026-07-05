# Histories Status

Updated: 2026-07-05

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
- Core IndexedDB helper APIs now exist for page upsert, visit bulk writes, visit time-range scans, page/time scans, transition/time scans, jobs, and search snapshots.
- Storage route selected for implementation: IndexedDB primary backend for structured history data and minimal visit-time indexes.
- Search route selected for implementation: SQLite WASM `:memory:` with FTS5 trigram, persisted as an IndexedDB snapshot.
- SQLite WASM + OPFS is verified in Chrome but rejected as the common Chrome + Firefox storage backend after Firefox OPFS probe failure.
- A real external History Trends Unlimited backup file has been structurally verified and round-trip hashed, but it must stay outside the repository.
- The search engine module is still a placeholder; SQLite WASM has not been promoted from probe code into runtime code.
- Browser-level IndexedDB storage smoke tests have not been added yet.

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

1. Add browser-level storage tests around schema migrations and indexed range scans.
2. Build the HTU import worker on top of the existing parser/serializer.
3. Promote SQLite WASM FTS snapshot search into production search modules.
4. Implement keyword plus time-range search planning.
5. Add browser history sync after import/search storage paths are stable.
