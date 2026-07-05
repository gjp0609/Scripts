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
- No storage engine has been selected in code.
- No UI has been rebuilt.
- No verified History Trends Unlimited export fixture is present.

## Blockers Before Coding Compatibility

- A real History Trends Unlimited export sample is required.
- If multiple HTU versions produce different formats, each format needs a fixture.
- Import/export tests must be written before parser implementation is considered complete.

## Working Assumptions

- Existing old code suggests one HTU-like TSV shape: `url`, `U<lastVisitTime>`, `typedCount`, `title`.
- That shape is not yet treated as the full specification.
- Firefox compatibility is a hard requirement, so the architecture cannot depend on Chrome-only extension APIs.

