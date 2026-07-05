# Histories

Histories is planned as a Chrome and Firefox compatible replacement for History Trends Unlimited.

The old implementation has been removed. The new scope is history-only:

- full browser history import and continuous synchronization
- fast local search over large history sets
- History Trends Unlimited compatible import and export
- statistics and analysis views matching History Trends Unlimited behavior
- Chrome and Firefox support from one source tree

Non-goals:

- new tab replacement
- QR code tools
- translation tools
- generic test pages from the previous extension

## Current Phase

The documentation and compatibility analysis are in place. Runtime implementation has started with a WXT skeleton, background adapter, options page, and IndexedDB schema bootstrap.

Read in order:

1. `docs/status.md`
2. `docs/architecture-design.md`
3. `docs/development-roadmap.md`
4. `docs/technical-analysis.md`
5. `docs/verification.md`
6. `docs/htu-compatibility.md`
7. `docs/htu-source-analysis.md`
8. `docs/implementation-plan.md`
