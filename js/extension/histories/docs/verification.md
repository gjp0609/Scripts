# Verification Log

Updated: 2026-07-06

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
- SQLite WASM itself is viable in both Chrome and Firefox.
- The primary durable data store should remain cross-browser IndexedDB.
- Search can use SQLite WASM `:memory:` plus FTS5 when the SQLite database is restored from an IndexedDB snapshot instead of OPFS.

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

## SQLite WASM FTS Snapshot Probe

Probe:

- Local ignored probe directory: `probes/sqlite-memory-fts/`.
- Engine: SQLite WASM `3.46.1`.
- Storage mode: SQLite `:memory:` database.
- Search index: FTS5 `trigram` tokenizer.
- Persistence: export SQLite database bytes and store the snapshot in IndexedDB; reload by creating a MEMFS file from the snapshot bytes.
- Indexed fields: one normalized `search_text` column containing title plus URL text; URL/title/count/time metadata are stored as unindexed FTS columns in the probe.
- OPFS is not used.

Search behavior verified:

- `title + url` substring search works through FTS5 trigram.
- Queries such as `yifeng`, `yifen`, and `ifen` can match longer strings such as `ruanyifeng`.
- Firefox search sample: `MATCH`, 765 matches, 50 returned, `10.00 ms`.

Chrome probe results:

| stage | result |
| --- | ---: |
| visits parsed | 887,561 |
| pages indexed | 384,065 |
| initial 3-column FTS build | 139,527 ms |
| optimized single-index-column FTS build | 79,528 ms |
| snapshot size | 559.4 MB |
| snapshot save | 2,299 ms |
| snapshot load | 1,251 ms |

Firefox probe results:

| stage | result |
| --- | ---: |
| visits parsed | 887,550 |
| pages indexed | 384,055 |
| optimized single-index-column FTS build | 33,789 ms |
| FTS insert portion | 30,802 ms |
| snapshot size | 558 MB |
| snapshot save | 3,770 ms |
| snapshot load | 2,638 ms |

Import bottleneck:

- TSV parsing and page aggregation are not the bottleneck; parsing took about 1.1-1.2 seconds.
- FTS insertion dominates first-build time.
- Snapshot load is fast enough for normal startup if quota permits storing the snapshot.

Implementation implication:

- Use IndexedDB for durable structured data, time indexes, visits, pages, aggregates, import/export state, and the SQLite FTS snapshot.
- Use SQLite WASM `:memory:` + FTS5 trigram for title/URL search after loading the snapshot from IndexedDB.
- Do not use IndexedDB `multiEntry` grams as the production full-text search engine.
- Do not depend on SQLite OPFS for Firefox compatibility.
- First import/rebuild can be slower; normal startup should load the SQLite snapshot.
- Time filters and statistics should not depend on FTS. They need their own IndexedDB indexes/materialized stores.
- Combined keyword plus time-range search must intersect SQLite FTS page-id candidates with IndexedDB visit-time ranges.

## Next Verification Steps

## WXT Skeleton Build

Commands:

- `npx wxt build js/extension/histories --browser chrome --mv3`
- `npx wxt build js/extension/histories --browser firefox --mv3`

Result:

- Chrome MV3 build passed.
- Firefox MV3 build passed.
- Firefox manifest includes `browser_specific_settings.gecko.data_collection_permissions.required = ["none"]` because this extension is designed to keep history data local and not transmit collected data outside the browser/extension.
- The options page bundle includes runtime ping and IndexedDB schema bootstrap.
- TypeScript check passed with WXT generated project config: `npx tsc --noEmit --pretty false --project js\extension\histories\.wxt\tsconfig.json`.
- After adding storage helper APIs, Chrome and Firefox MV3 builds still pass.

## IndexedDB Storage Smoke Test

Command:

- `node --test js\extension\histories\tests\storage-smoke.test.mjs`

Result:

- Browser smoke test passed with local Chrome.
- The test bundles `src/storage/database.ts` for a real browser context, starts a temporary local HTTP server, writes to browser IndexedDB, then deletes the test database.
- Covered behavior: page upsert by normalized URL, visit bulk writes, `visit_time` scans, `[page_id, visit_time]` scans, `[transition, visit_time]` scans, reverse limited scans, job round-trip, search snapshot round-trip, and database summary counts.
- The same browser smoke also covers a small HTU import through `importHtuText`, including parse, exact-URL page aggregation, configurable page chunk writes, configurable visit chunk writes, and progress stages.
- Chunk reader coverage includes page chunk decode, stable page-id lookup from chunks, visit chunk decode, overlapping visit chunk prefilter, inclusive chunk time-range scan, reverse chunk time-range scan, transition decode, and limit handling.

## HTU Import Core

Commands:

- `node --test js\extension\histories\tests\htu-import.test.mjs`

Result:

- Import planner and chunk builder tests passed.
- Covered behavior: exact-URL page aggregation for HTU compatibility, latest-page title selection for identical URLs, visit draft creation, page chunk construction, time-sorted typed-array visit chunks, and import cancellation through `AbortSignal`.
- Visit chunks now also preserve visit-level titles for later archived export.

## HTU Export Core

Command:

- `node --test js\extension\histories\tests\htu-export.test.mjs`

Result:

- HTU export core tests passed.
- Covered behavior: rebuilding 4-column archived TSV from page chunks and visit chunks, preserving source-row order through `sourceIndex`, preserving visit-level titles, and generating HTU-style backup filenames.

## Browser History Sync Core

Command:

- `node --test js\extension\histories\tests\history-sync.test.mjs`

Result:

- Browser history sync core tests passed.
- Covered behavior: full sync over `history.search({ text: "", startTime: 0 })`, exact page aggregation by normalized URL, stable visit-id generation from browser visit metadata, incremental filtering against `startTime`, ignoring future-skewed visits, next-sync cursor calculation, and chunk-backed merge without duplicating imported visits.

## Export Worker Browser Smoke

Command:

- `node --test js\extension\histories\tests\export-worker-browser.test.mjs`

Result:

- Browser export worker smoke test passed with local Chrome.
- Covered behavior: starting an HTU export through the `ExportWorkerClient`, executing the export in a module worker, persisting job records in IndexedDB, receiving job status updates on the page side, and preserving archived HTU bytes on the worker result path.

## Search Engine Core

Command:

- `node --test js\extension\histories\tests\search-engine.test.mjs`

Result:

- Search engine core tests passed.
- Covered behavior: keyword normalization, URL decode in search text, FTS MATCH quote escaping, page-chunk rebuild into FTS insert rows, snapshot metadata creation, progress stages, snapshot load, keyword-only search, keyword-plus-time-range intersection through chunk visit stats, result row mapping, and snapshot rebuild cancellation through `AbortSignal`.
- The test uses an injected fake SQLite runtime; real SQLite WASM browser execution remains a separate verification step.

## Search Engine Browser SQLite WASM Smoke

Command:

- `node --test js\extension\histories\tests\search-sqlite-browser.test.mjs`

Result:

- Real-browser SQLite WASM smoke test passed with local Chrome.
- Covered behavior: loading `sqlite/sqlite3.js` from the bundled asset path, wasm resolution to `sqlite/sqlite3.wasm`, rebuilding FTS from IndexedDB page chunks, saving/loading the SQLite snapshot through IndexedDB, and executing trigram MATCH searches with and without real visit-time-range intersection.
- The current runtime adapter is validated for browser page contexts. Worker-context loading is still a separate task.

## Import Worker Browser Smoke

Command:

- `node --test js\extension\histories\tests\import-worker-browser.test.mjs`

Result:

- Browser import worker smoke test passed with local Chrome.
- Covered behavior: starting an HTU import through the `ImportWorkerClient`, executing the import in a module worker, persisting job records in IndexedDB, receiving job status updates on the page side, and writing the expected page/visit counts.
- The smoke uses a small inline TSV source. Full external-backup import still uses the direct browser benchmark harness.

## Search Rebuild Worker Browser Smoke

Command:

- `node --test js\extension\histories\tests\search-rebuild-worker-browser.test.mjs`

Result:

- Search rebuild worker smoke test passed with local Chrome.
- Covered behavior: starting snapshot rebuild through the worker client, loading `sqlite3.js` inside a classic worker, resolving `sqlite3.wasm` through the worker query parameter `sqlite3.dir=/sqlite`, rebuilding the snapshot from IndexedDB page chunks, persisting the snapshot, and searching it from the page side after completion.

## HTU Full Browser Import Benchmark

Command:

- `$env:HISTORIES_HTU_BACKUP='R:\Files\Data\BrowserHistories\htu_backup_20260705_134842.tsv'; node --test js\extension\histories\tests\htu-import-full-browser.test.mjs`

Result:

- Browser: local Chrome through Playwright.
- Rows imported: `887,561`.
- Exact-URL pages imported: `384,065`.
- Visits imported: `887,561`.
- Fetch time: about `681 ms`.
- Import time: about `2,559 ms`.
- Total browser-side time after page load: about `3,240 ms`.

Performance finding:

- Per-visit IndexedDB records were too slow: `100,000` rows took about `65s`.
- Visit chunks reduced `300,000` rows to about `1.1s` import time.
- Page chunks are required too; page records with indexes made full import too slow.
- Current HTU import path writes page chunks and visit chunks by default. The per-record `pages` and `visits` stores remain for smaller browser-sync updates.

## Latest Automated Tests

Commands:

- `npx tsc --noEmit --pretty false --project js\extension\histories\.wxt\tsconfig.json`
- `node --test js\extension\histories\tests\htu-tsv.test.mjs`
- `node --test js\extension\histories\tests\htu-import.test.mjs`
- `node --test js\extension\histories\tests\htu-export.test.mjs`
- `node --test js\extension\histories\tests\history-sync.test.mjs`
- `node --test js\extension\histories\tests\search-engine.test.mjs`
- `node --test js\extension\histories\tests\search-sqlite-browser.test.mjs`
- `node --test js\extension\histories\tests\import-worker-browser.test.mjs`
- `node --test js\extension\histories\tests\export-worker-browser.test.mjs`
- `node --test js\extension\histories\tests\search-rebuild-worker-browser.test.mjs`
- `node --test js\extension\histories\tests\storage-smoke.test.mjs`
- `node --test js\extension\histories\tests\htu-import-full-browser.test.mjs` with `HISTORIES_HTU_BACKUP` set for the external full-backup run
- `$env:HISTORIES_HTU_BACKUP='R:\Files\Data\BrowserHistories\htu_backup_20260705_134842.tsv'; node --test js\extension\histories\tests\htu-tsv.test.mjs`

Result:

- Repository fixtures: 6 passed, 1 skipped when external backup is not configured.
- HTU import planner/chunks: 5 passed.
- HTU export core: 2 passed.
- Browser history sync core: 2 passed.
- Browser history sync core: 3 passed.
- Search engine core: 5 passed.
- Search engine browser SQLite WASM smoke: 1 passed.
- Import worker browser smoke: 1 passed.
- Export worker browser smoke: 1 passed.
- Search rebuild worker browser smoke: 1 passed.
- Storage smoke: 1 passed in local Chrome, including chunk reader coverage.
- Record-backed fallback coverage now verifies synthesized page/visit chunks, synthesized chunk time-range scans, and synthesized page-visit stats for empty non-import databases.
- Keyword + time-range search is covered in both unit tests and browser SQLite WASM smoke.
- TypeScript check passed.
- Chrome/Firefox WXT outputs now include `sqlite/sqlite3.js`, `sqlite/sqlite3.wasm`, and `search-rebuild-worker.js`.
- External full backup: 7 passed, full backup round-trip completed in about 2.0 seconds.
- External full backup latest run: 7 passed, full backup round-trip completed in about `2.37s`.
- External full backup latest rerun after export changes: 7 passed, full backup round-trip completed in about `2.41s`.
- External full backup latest rerun after export worker changes: 7 passed, full backup round-trip completed in about `2.19s`.
- External full browser import: 1 passed, full backup imported in about 3.2 seconds browser-side after page load.
- External full browser import latest run: `887,561` rows, `384,065` pages, `887,561` visits, `763 ms` fetch, `2,469 ms` import, `3,232 ms` total browser-side after page load.

## Next Verification Steps

1. Manually load the generated Chrome and Firefox unpacked extension outputs.
2. Verify extension-context IndexedDB quota for the roughly 558 MB SQLite FTS snapshot.
3. Verify extension-context IndexedDB quota with a real large snapshot.
4. Move page-owned workers under background-controlled lifecycle if suspend/resume behavior requires it.
5. Test combined searches such as keyword plus arbitrary time range.
