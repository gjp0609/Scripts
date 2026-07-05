# Implementation Plan

## Phase 0: Compatibility Evidence

- Keep the inspected HTU 1.8.9 source notes in `docs/htu-source-analysis.md`.
- Collect real History Trends Unlimited export files.
- Record HTU version and browser version for each fixture.
- Write parser/serializer tests before implementing runtime import/export.

## Phase 1: Project Skeleton

- Select build tool.
- Create shared TypeScript source tree.
- Generate Chrome and Firefox manifests.
- Add basic extension shell with history-only pages.
- Add automated lint/build commands.

## Phase 2: Data Layer

- Implement IndexedDB schema and migrations for `pages`, minimal `visits`, `jobs`, and `search_snapshot`.
- Import all browser history with `startTime: 0`.
- Add event listeners for new visits, title changes, and removals.
- Add recovery and re-sync logic.
- Keep the sync hot path small: write page metadata, minimal visit rows, and queued search snapshot updates only.

## Phase 3: HTU Import/Export

- Implement compatibility parser.
- Implement compatibility serializer.
- Add fixtures and round-trip tests.
- Add import/export UI and progress reporting.

## Phase 4: Search

- Implement SQLite WASM `:memory:` FTS5 trigram search over title and URL text.
- Persist and restore the SQLite FTS database through an IndexedDB snapshot.
- Implement keyword-only page-level search.
- Implement keyword plus visit-time range search by intersecting FTS page ids with IndexedDB visit indexes.
- Add performance tests using the external full HTU backup file.

## Phase 5: Statistics

- Match History Trends Unlimited statistics views.
- Generate statistics asynchronously on demand.
- Back aggregates with staleable materialized stores.
- Do not add day/month/hour fields to every visit on the sync hot path unless a later benchmark proves it is required.
- Add validation tests against fixture data.

## Phase 6: Browser Verification

- Build Chrome package.
- Build Firefox package.
- Manually load unpacked extensions.
- Verify initial import, search, import/export, and stats on both browsers.

## Immediate Next Step

Start with the current verified route:

- build extension skeleton
- implement IndexedDB `pages` and minimal `visits`
- implement SQLite WASM FTS snapshot search module
- implement visit-time range filtering before statistics UI
