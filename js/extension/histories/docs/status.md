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

- No runtime extension code exists yet.
- No manifest exists yet.
- Storage route selected for implementation: IndexedDB primary backend with a portable search index.
- SQLite WASM + OPFS is verified in Chrome but rejected as the common Chrome + Firefox backend after Firefox probe failure.
- No UI has been rebuilt.
- A real external History Trends Unlimited backup file has been structurally verified and round-trip hashed, but it must stay outside the repository.

## Blockers Before Coding Compatibility

- If multiple HTU versions produce different formats, each format needs a fixture.
- Import/export tests must be written before parser implementation is considered complete.
- IndexedDB bulk import throughput must be validated against the external backup size before building the UI around it.

## Working Assumptions

- HTU 1.8.9 exports backup/transfer TSV as 4 columns: `URL`, `U<visit_time>`, `transition_id`, `title`.
- HTU 1.8.9 exports analysis/search/trends TSV as 8 columns: `URL`, `host`, `domain`, `visit_time`, `local_time`, `weekday`, `transition_text`, `title`.
- Import compatibility must accept HTU 3-column, 4-column, and 8-column TSV variants.
- Firefox compatibility is a hard requirement, so the architecture cannot depend on Chrome-only extension APIs.

## Next Work

1. Implement HTU TSV parser/serializer as an isolated module.
2. Add tests for 3-column, 4-column, and 8-column import/export formats.
3. Run parser/serializer round-trip tests against the external full backup file.
4. Prototype IndexedDB bulk import and portable search index throughput.
