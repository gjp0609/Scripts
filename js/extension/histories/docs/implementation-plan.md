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

- Decide SQLite WASM + OPFS vs IndexedDB/search-index after Firefox verification.
- Implement schema and migrations.
- Import all browser history with `startTime: 0`.
- Add event listeners for new visits, title changes, and removals.
- Add recovery and re-sync logic.

## Phase 3: HTU Import/Export

- Implement compatibility parser.
- Implement compatibility serializer.
- Add fixtures and round-trip tests.
- Add import/export UI and progress reporting.

## Phase 4: Search

- Implement compatibility search mode.
- Implement improved search mode.
- Add tokenizer tests for ASCII, URL components, and Chinese text.
- Add performance tests with large generated history sets.

## Phase 5: Statistics

- Match History Trends Unlimited statistics views.
- Back aggregates with materialized stores.
- Add validation tests against fixture data.

## Phase 6: Browser Verification

- Build Chrome package.
- Build Firefox package.
- Manually load unpacked extensions.
- Verify initial import, search, import/export, and stats on both browsers.

## Immediate Next Step

Start with Phase 0 and Phase 1 together:

- add build skeleton
- add empty parser module and tests
- add fixture folder
- block final HTU compatibility implementation until real fixture files are available
