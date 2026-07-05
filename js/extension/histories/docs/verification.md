# Verification Log

Updated: 2026-07-05

## Local Environment

- Node.js: `v26.1.0`
- npm: `11.14.1`
- Firefox: `Mozilla Firefox 140.5.0esr`
- Chrome executable: `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Chrome file version: `149.0.7827.201`

Chrome note:

- Running Chrome against the default profile failed because the profile lock/crashpad path is not writable in this session.
- Browser validation must use a temporary `--user-data-dir` profile.

## Extension Background Model

Verified from MDN:

- Chrome MV3 uses `background.service_worker`.
- Firefox does not support `background.service_worker`.
- For cross-browser MV3, a manifest can specify both `background.scripts` and `background.service_worker`; Chrome uses the service worker and Firefox uses scripts.

Implementation implication:

- Prefer a generated manifest or a shared MV3 manifest with both background entries if the build tool permits it.
- Avoid Chrome-only background assumptions in shared code.

## HTU Architecture Baseline

Verified from HTU 1.8.9 CRX source:

- Chrome MV3 service worker.
- SQLite WASM 3.46.1.
- OPFS-oriented persistence through SQLite WASM.
- Offscreen document for worker/blob/export flows.
- FTS5 table for URL/title search.

Implementation implication:

- SQLite WASM + FTS5 remains the closest compatibility target.
- Firefox must be tested before committing to this storage route.

## Browser Storage Probe

Probe:

- Local ignored probe directory: `probes/opfs-sqlite/`.
- SQLite WASM version: `3.46.1`.
- The probe checks extension-page worker startup, `navigator.storage.getDirectory`, SQLite WASM initialization, OPFS VFS availability, FTS5 table creation, and simple persistence.

Chrome result:

- Browser: Playwright Chromium cache `chromium-1187`.
- Manifest: MV3 service worker with COOP/COEP.
- `navigator.storage.getDirectory`: yes.
- `SharedArrayBuffer`: yes.
- `crossOriginIsolated`: yes.
- SQLite WASM loaded: yes.
- SQLite OPFS VFS enabled: yes.
- FTS5 virtual table creation: yes.
- Persistent reopen check: `persistedCount = 1`.
- FTS match check: `ftsMatchCount = 1`.
- Overall result: PASS.

Firefox result:

- Browser: Firefox `140.5.0esr`.
- Manifest: Firefox-compatible background scripts.
- `navigator.storage.getDirectory`: yes.
- `SharedArrayBuffer`: no.
- `crossOriginIsolated`: no.
- SQLite WASM loaded: yes.
- SQLite OPFS VFS enabled: no.
- FTS5 virtual table creation: no; opening `vfs: 'opfs'` failed with SQLite3Error.
- Overall result: FAIL for SQLite OPFS as a shared storage route.

Implementation implication:

- SQLite WASM + OPFS is viable for Chrome but not viable as the required Chrome + Firefox common storage engine in the tested Firefox extension context.
- The primary implementation should use a cross-browser IndexedDB-backed storage layer.
- SQLite OPFS may remain a Chrome-only experimental/performance backend later, but it must not be required for compatibility or core functionality.
- Search must be implemented above the storage layer with a portable index instead of depending on SQLite FTS5.

## External HTU Backup Fixture

Source file:

- `R:\Files\Data\BrowserHistories\htu_backup_20260705_134842.tsv`

Privacy handling:

- The source file is outside the repository and must not be copied into fixtures or committed.
- Verification records only aggregate structure, timestamps, counts, and hashes.
- Do not log or commit URL/title values from this file.

Observed format:

- File size: `151,883,442` bytes.
- Rows: `887,561`.
- Columns: all rows have 4 columns.
- Line ending: all rows use CRLF; file ends with CRLF.
- BOM: none.
- Timestamp format: all rows use the `U<unix_ms>` HTU transfer/backup format.
- Transition format: all transition values are numeric.
- Invalid URL/time/transition rows found by structural parser: `0`.
- Empty title rows: `25,932`.
- Duplicate `(URL, visit_time)` rows: `0`.
- Time range: `2016-11-03T13:42:31.623Z` to `2026-07-05T05:48:37.295Z`.

Transition distribution:

| transition_id | rows |
| --- | ---: |
| 0 | 667,411 |
| 1 | 27,220 |
| 2 | 8,999 |
| 3 | 92 |
| 4 | 2,607 |
| 5 | 15,748 |
| 6 | 19,217 |
| 7 | 59,070 |
| 8 | 87,149 |
| 9 | 48 |

Round-trip check:

- Source SHA-256: `12f73bee44a8f72e51a86151ff67417e082e5759ca7c68e49354ae1a57ee8fe4`.
- Re-serialized SHA-256: `12f73bee44a8f72e51a86151ff67417e082e5759ca7c68e49354ae1a57ee8fe4`.
- Exact byte-compatible round trip: yes.
- Automated parser/serializer test: `node --test js\extension\histories\tests\htu-tsv.test.mjs`.
- External full-backup test command: set `HISTORIES_HTU_BACKUP` to the source file path before running the same test command.
- Latest external round-trip test result: 7 passing tests, full backup round-trip completed in about 2.0 seconds.

Implementation implication:

- The first parser/serializer milestone must preserve this 4-column backup file byte-for-byte when no data changes are made.
- Import tests should use this file as an external local fixture path, not as a repository fixture.

## IndexedDB Search Probe

Probe:

- Local ignored probe directory: `probes/indexeddb-search/`.
- Storage: IndexedDB object stores for `pages`, `visits`, and `meta`.
- Search index: page-level `tokens` multiEntry index, with worker-side final matching and scoring.
- Data source: external HTU backup file listed above.
- Data privacy: query results are local browser state only; verification records aggregate timing and counts, not URL/title values.

Initial import result:

- Visits imported: `887,561`.
- Pages indexed: `384,065`.
- Import and index build time: `574,298 ms`.
- Interpretation: search latency is acceptable for the tested scale, but import/index build time needs optimization before production use.

Search result after exact-token candidate lookup:

| query | candidates | matches | returned | time |
| --- | ---: | ---: | ---: | ---: |
| `ruanyifeng` | 648 | 648 | 50 | 24.80 ms |
| `ruan` | 9 | 9 | 9 | 2.80 ms |

Problem found:

- Exact token lookup did not treat `ruan` as a prefix of longer tokens such as `ruanyifeng`.
- This is the kind of fuzzy/prefix behavior the rewrite must improve over HTU.

Search result after prefix-range lookup:

| query | candidates | matches | returned | time |
| --- | ---: | ---: | ---: | ---: |
| `ruan` | 789 | 789 | 50 | 34.80 ms |
| `ruanyifeng` | 648 | 648 | 50 | 14.60 ms |
| `feng` | 72 | 72 | 50 | 10.60 ms |

Implementation implication:

- IndexedDB `multiEntry` token indexes are viable for page-level candidate retrieval at the tested data size.
- ASCII prefix lookup should use an IndexedDB range query, for example `IDBKeyRange.bound(term, term + "\uffff")`.
- Final matching and ranking should remain worker-side so compatibility and improved-search modes can share the same storage.
- Production import must reduce index build cost, likely by chunking differently, reducing per-page token volume, and avoiding unnecessary visit writes for search-only workflows.

## Next Verification Steps

1. Optimize IndexedDB bulk import and index build throughput against the external HTU backup file.
2. Add CJK substring/ngram search cases to the IndexedDB probe.
3. Lock parser/serializer fixtures for HTU 3-column, 4-column, and 8-column TSV variants.
4. Promote the proven probe design into production storage/search modules.
