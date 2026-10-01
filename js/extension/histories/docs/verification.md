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

- An external HTU TSV backup supplied through `HISTORIES_HTU_BACKUP`.

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

| transition_id |    rows |
| ------------- | ------: |
| 0             | 667,411 |
| 1             |  27,220 |
| 2             |   8,999 |
| 3             |      92 |
| 4             |   2,607 |
| 5             |  15,748 |
| 6             |  19,217 |
| 7             |  59,070 |
| 8             |  87,149 |
| 9             |      48 |

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

| query        | candidates | matches | returned |     time |
| ------------ | ---------: | ------: | -------: | -------: |
| `ruanyifeng` |        648 |     648 |       50 | 24.80 ms |
| `ruan`       |          9 |       9 |        9 |  2.80 ms |

Problem found:

- Exact token lookup did not treat `ruan` as a prefix of longer tokens such as `ruanyifeng`.
- This is the kind of fuzzy/prefix behavior the rewrite must improve over HTU.

Search result after prefix-range lookup:

| query        | candidates | matches | returned |     time |
| ------------ | ---------: | ------: | -------: | -------: |
| `ruan`       |        789 |     789 |       50 | 34.80 ms |
| `ruanyifeng` |        648 |     648 |       50 | 14.60 ms |
| `feng`       |         72 |      72 |       50 | 10.60 ms |

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

| stage                                   |     result |
| --------------------------------------- | ---------: |
| visits parsed                           |    887,561 |
| pages indexed                           |    384,065 |
| initial 3-column FTS build              | 139,527 ms |
| optimized single-index-column FTS build |  79,528 ms |
| snapshot size                           |   559.4 MB |
| snapshot save                           |   2,299 ms |
| snapshot load                           |   1,251 ms |

Firefox probe results:

| stage                                   |    result |
| --------------------------------------- | --------: |
| visits parsed                           |   887,550 |
| pages indexed                           |   384,055 |
| optimized single-index-column FTS build | 33,789 ms |
| FTS insert portion                      | 30,802 ms |
| snapshot size                           |    558 MB |
| snapshot save                           |  3,770 ms |
| snapshot load                           |  2,638 ms |

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

- `$env:HISTORIES_HTU_BACKUP='C:\path\to\htu_backup.tsv'; node --test js\extension\histories\tests\htu-import-full-browser.test.mjs`

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
- `node --test js\extension\histories\tests\ui-result-row.test.mjs`
- `node --test js\extension\histories\tests\search-sqlite-browser.test.mjs`
- `node --test js\extension\histories\tests\import-worker-browser.test.mjs`
- `node --test js\extension\histories\tests\export-worker-browser.test.mjs`
- `node --test js\extension\histories\tests\search-rebuild-worker-browser.test.mjs`
- `node --test js\extension\histories\tests\storage-smoke.test.mjs`
- `node --test js\extension\histories\tests\htu-import-full-browser.test.mjs` with `HISTORIES_HTU_BACKUP` set for the external full-backup run
- `$env:HISTORIES_HTU_BACKUP='C:\path\to\htu_backup.tsv'; node --test js\extension\histories\tests\htu-tsv.test.mjs`

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

## Incremental SQLite FTS Benchmark

Updated: 2026-08-14

Command:

- `$env:HISTORIES_HTU_BACKUP='C:\path\to\htu_backup.tsv'; $env:HISTORIES_INCREMENTAL_HOLDOUT_DAYS='7'; $env:HISTORIES_INCREMENTAL_UPDATE_FTS_METADATA='false'; node --test js\extension\histories\tests\search-incremental-full-browser.test.mjs`

Method:

- The source TSV is read-only and is streamed twice; no derived file containing private history is written.
- The latest 7 days relative to the maximum valid visit time are held out.
- Older rows build the baseline SQLite FTS5 trigram index.
- Held-out visits are replayed once in chronological order and once as a single startup dirty batch after reloading the baseline snapshot.
- Only aggregate counts and timings are returned. URL values, titles, and private query terms are not logged.
- `data:image/...` rows are excluded before baseline or incremental indexing.

Dataset:

| metric                           |  result |
| -------------------------------- | ------: |
| valid source visits              | 900,187 |
| excluded `data:image/...` visits |      10 |
| excluded `data:image/...` bytes  | 288,264 |
| retained visits                  | 900,177 |
| baseline visits                  | 897,913 |
| baseline pages                   | 387,370 |
| held-out visits                  |   2,264 |
| held-out distinct URLs           |   1,504 |
| existing-page visits             |   1,001 |
| new pages                        |   1,263 |

Recommended-policy result:

| stage                              |            result |
| ---------------------------------- | ----------------: |
| baseline FTS build                 |      45,571.83 ms |
| baseline snapshot size             | 592,338,944 bytes |
| baseline snapshot save             |       3,113.69 ms |
| chronological per-visit update P50 |          0.605 ms |
| chronological per-visit update P95 |          1.120 ms |
| chronological per-visit update P99 |          6.390 ms |
| all 2,264 visits dirty replay      |         406.51 ms |
| dirty replay average per visit     |          0.180 ms |
| checkpoint size                    | 595,124,224 bytes |
| checkpoint save                    |       2,499.07 ms |
| checkpoint load                    |       2,639.45 ms |

Search comparison used three fixed public high-hit terms and included both the first 50 sorted rows and an exact `COUNT(*)`:

| state                       |      mean |       P50 |        P95 |
| --------------------------- | --------: | --------: | ---------: |
| baseline                    | 82.305 ms | 62.530 ms | 184.200 ms |
| after chronological updates | 82.753 ms | 63.275 ms | 184.655 ms |
| after checkpoint reload     | 89.678 ms | 65.760 ms | 202.380 ms |

Interpretation:

- Incremental FTS mutation is viable at the tested scale and does not materially change query latency before checkpointing.
- Existing pages whose title/search text did not change should not update FTS. Their visit count and latest visit time belong in IndexedDB.
- Skipping 1,001 metadata-only FTS updates reduced full dirty replay from about `995 ms` to about `407 ms` compared with the control run.
- A full snapshot save still costs about `2.5-3.1 s` and writes roughly `568 MiB`; it cannot run after every visit. Persist dirty page ids and checkpoint only on an idle/threshold policy.
- The absolute search P95 above is dominated by high-hit exact count queries. It verifies before/after stability, not the final time-range pagination target; pagination needs a separate benchmark.
- No real title changes occurred in this 7-day holdout. The automated small fixture covers the title-change update path, but a large real title-change sample remains useful.

## Next Verification Steps

> 以下为 2026-08-17 当时列出的待办。截至 2026-09-30 六项均已完成，结论见本文件后续章节与「第一阶段最终验收」；此处保留原文以记录当时的验证计划。

1. Manually load the generated Chrome and Firefox unpacked extension outputs.
2. Verify extension-context IndexedDB quota for the roughly 558 MB SQLite FTS snapshot.
3. Verify extension-context IndexedDB quota with a real large snapshot.
4. Move page-owned workers under background-controlled lifecycle if suspend/resume behavior requires it.
5. Test combined searches such as keyword plus arbitrary time range.
6. Benchmark stable time-descending pagination separately, including narrow/wide ranges and deep cursors.

## Extension-Origin Snapshot And Pagination Verification

Updated: 2026-08-17

The full external HTU backup was imported inside real temporary Chrome and Firefox extension origins. Both tests closed the browser, reopened the same profile, loaded the snapshot, replaced it with corrupt bytes, deleted it, verified that main-data counts remained unchanged, restored it, and loaded it again.

Dataset:

| metric                         |            result |
| ------------------------------ | ----------------: |
| valid input rows               |           900,187 |
| excluded `data:image/...` rows |                10 |
| retained visits                |           900,177 |
| pages                          |           388,633 |
| SQLite snapshot                | 602,546,176 bytes |

Browser results:

| metric                  |          Chromium |           Firefox |
| ----------------------- | ----------------: | ----------------: |
| reported quota          |      about 64 GiB |     about 100 GiB |
| persistent-storage flag |             false |              true |
| estimated usage         | 448,312,368 bytes | 431,784,966 bytes |
| import                  |            7.91 s |            3.33 s |
| FTS rebuild             |           42.47 s |           40.34 s |
| restart load            |            1.21 s |            3.16 s |
| restored load           |            1.06 s |            4.15 s |

The first extension run exposed two production defects that are now covered by regression tests: MV3 CSP did not allow WebAssembly, and snapshot loading accepted a corrupt SQLite byte array as an empty database. The manifest now allows `wasm-unsafe-eval`; snapshot loading validates schema, byte length, and page count.

The production FTS rebuild initially used per-row auto-commit and did not finish at full scale. Wrapping all inserts in one SQLite transaction reduced full rebuild to about 33-42 seconds.

Stable pagination on the same Chromium dataset:

| scenario                        | first page |
| ------------------------------- | ---------: |
| all-time, no keyword            |    25.6 ms |
| last 7 days, no keyword         |     0.8 ms |
| `github`, all time              |    68.0 ms |
| `github`, last 7 days           |     0.7 ms |
| `ruan`, all time                |    18.8 ms |
| zero-match query                |     2.6 ms |
| extreme high-hit `google`, cold |   120.5 ms |

Ten sequential `github` pages returned 500 unique pages with no gaps or duplicates detected by the cursor invariant. Durations were P50 `16.3 ms`, P95 `18.2 ms`. The query uses `(matchedVisitTime DESC, pageId DESC)` plus a frozen end-time watermark. The extreme cold high-hit case remains a warm-up optimization target but does not require a storage-architecture change.

## Browser History Field Matrix

Updated: 2026-08-17

Temporary Chrome and Firefox extensions visited only a local test server and compared `history.onVisited` with `history.getVisits`.

- Both browsers emitted page-summary events with URL and `lastVisitTime`, but no event contained `visitId` or transition.
- Both browsers returned `visitId`, `referringVisitId`, `visitTime`, and transition from `getVisits`.
- Matching event and visit timestamps had a nearest difference of `0 ms` in the verified samples.
- Chromium exposed `typedCount` on history items and `isLocal` on visits. Firefox did not consistently expose them.
- Chromium reported separate `link` and `reload` visits for the tested same-URL reload. Firefox coalesced that reload and returned one `link` visit.

Implementation consequence: `onVisited` is a wake-up signal. The collector must call `getVisits` for the exact URL and ingest unseen visit ids from an overlap window. It must not synthesize visits that Firefox does not expose.

## Unified Main Data And Interruption Verification

Updated: 2026-08-17

Database v6 storage smoke now verifies:

- manual v5 database upgrade with legacy chunks still readable;
- staging data remains invisible until atomic activation;
- generation revisions increase from 1 on each activation;
- public chunk and record readers consistently use the active generation and hide internal generation fields;
- a forced exception during segment staging aborts the whole transaction;
- cancellation or failure immediately before activation preserves the previous active generation;
- stale staging and retired generations can be deleted without deleting active segments;
- browser sources and import batches round-trip and generations retain format/source metadata;
- dirty pages are committed with the activating generation revision;
- leases prevent concurrent ownership, permit expired takeover, and are removed on terminal jobs;
- a sync interrupted after merge but before publication remains failed with no committed `nextStartTime`; retry publishes successfully and only then advances the cursor;
- browser data-image URLs are rejected before `getVisits`, and source keys use persistent source instance plus native visit id.

Regression commands and results:

- Core HTU, sync, export, and search tests: 24 passed, 1 external-backup test skipped because the environment variable was not set.
- IndexedDB generation/storage smoke: 1 passed in Chromium.
- SQLite WASM, import worker, export worker, and search rebuild worker browser smoke: 4 passed when run serially.
- Chrome MV3 and Firefox MV3 WXT production builds passed.

The search rebuild worker initially hung after the v6 upgrade because its standalone script still opened database version 5 and only read the legacy `pageChunks` store. It now opens v6, reports initialization failures from inside the job boundary, and reads the active generation before falling back to legacy storage.

## Multi-File HTU Merge Verification

Updated: 2026-08-17

Automated coverage verifies reversed file order, file-internal duplicates, cross-file overlaps, active-generation overlaps, second-import idempotence, mixed 3/4/8-column inputs, Unix and Windows timestamps, data-image filtering, bad-file whole-batch rejection, cancellation before publication, per-file reports, and multi-source visit provenance.

The real `900,187`-row backup was split by `tests/create-incremental-fixture.mjs` into ignored local files under `dev-browser-data/test-files/`:

| fixture                       |    rows | purpose                                            |
| ----------------------------- | ------: | -------------------------------------------------- |
| baseline before latest 7 days | 897,923 | includes 10 data-image rows to verify exclusion    |
| latest 14 days                |   4,163 | first 7 days overlap baseline, last 7 days are new |

Chromium result:

| stage                       |   result |
| --------------------------- | -------: |
| baseline added              |  897,913 |
| baseline import             | 3,971 ms |
| incremental added           |    2,264 |
| incremental duplicate       |    1,899 |
| incremental import          | 3,042 ms |
| repeated incremental added  |        0 |
| repeated incremental import | 3,135 ms |
| final pages                 |  388,633 |
| final visits                |  900,177 |

An initial implementation took about 329 seconds because it wrote all 388,633 first-generation pages into the dirty-page store one request at a time. A first generation cannot have an older index checkpoint to replay, so it now records no dirty pages and requires one full search rebuild; the same import then completed in about four seconds.

Production build inspection also found that the old client emitted unresolved `./import-worker.ts` and `./export-worker.ts` URLs. Worker constructors now use Vite `?worker` factories; Chrome and Firefox outputs both contain hashed import/export worker assets, and independent browser worker tests still pass through injected factories.

## Browser Collection Semantics

Updated: 2026-08-21

Core browser-sync tests verify that `history.onVisited` page summaries can be supplied directly to the common collector, `getVisits` remains the visit-record source, browser data-image pages are counted and skipped, browser fragment URLs retain exact identity, and a 5-second incremental overlap is used when resolving the last committed cursor. Merge tests verify duplicate source discovery, threshold suppression after identity deduplication, threshold `0`, HTU threshold bypass, and compare-and-swap rejection of stale sibling generations.

The background registers `history.onVisited`, queues exact URLs for a 250ms coalescing window, performs `getVisits` completion, starts a full sync on install, and requests incremental compensation when the history page opens. Chrome and Firefox production builds include these paths and pass the existing browser smoke suite; long-lived service-worker and Firefox lifecycle evidence remains part of stage 8.

## Browser Collection Pagination And Production Regression

Updated: 2026-08-21

- `node --test tests/history-sync.test.mjs`: 6 passed, including fixed-size browser-history search batches and equal-timestamp boundary pages.
- `node --test tests/storage-smoke.test.mjs`: 1 passed.
- `npx tsc --noEmit --pretty false --project .wxt/tsconfig.json`: passed.
- `npx wxt build` and `npx wxt build -b firefox`: both passed; import/export workers, SQLite assets and search rebuild worker are present.
- `node --test tests/extension-background-collection.test.mjs`: Chrome production background collected a real visit and retained it after same-profile restart.
- `node --test tests/extension-background-firefox.test.mjs`: Firefox production background collected a real visit and retained it after same-profile restart.

The options page now calls `SearchEngine.searchPage()` with a frozen watermark cursor, supports empty-keyword time-range queries and exposes a next-page action. Native backup serialization, browser download, empty-database restore and tamper rejection are covered by core and browser tests.

## 第一阶段最终验收

更新时间：2026-08-21

### 增量索引与快照可靠性

- 历史页启动会加载最近完整 SQLite checkpoint，再按主库 revision 批量 replay dirty page。
- `checkpoint: false` 的 replay 不保存快照、不清 dirty；checkpoint 保存成功后才清除 dirty，保存失败时 dirty 保留，因此下次可以安全重试。
- 仅新增同一页面访问、搜索文本未变化时不更新 FTS；新增页面或标题/URL 搜索文本变化时才进入 dirty 集合。
- 搜索快照保存 SHA-256；加载前校验，字节损坏、格式不兼容、SQLite schema 异常均拒绝使用，不影响 IndexedDB 主数据和全量重建。
- 真实最近 7 天 `2,264` 条新增访问的 dirty replay 约 `407 ms`，没有触发全量 FTS 重建。

### 原生备份与恢复

真实 `900,177` 访问、`388,633` 页面数据库的 Chromium 回归结果：

| 指标         |                结果 |
| ------------ | ------------------: |
| 原生备份大小 | `231,434,025 bytes` |
| 导出耗时     |       约 `3,533 ms` |
| 空库恢复耗时 |       约 `4,798 ms` |
| 恢复后访问   |           `900,177` |
| 恢复后页面   |           `388,633` |

- `.hbk` 包含版本化 manifest、page/visit chunk、来源、导入批次及逐 chunk SHA-256。
- 导出和 HTU TSV 均使用 Blob 分片，避免再构造一个完整总字符串；读取主库时仍需持有现有 chunk 数组，这是当前数据模型的可接受开销。
- 恢复在发布前完整校验格式、字节数、chunk 数量、SHA-256 和总计数；任一分块篡改都会拒绝，旧主数据不变。
- 第一阶段只允许恢复到空库。非空库在任何恢复写入前明确拒绝，避免把“恢复”误用为覆盖或隐式合并；多浏览器数据合并应使用 HTU 多文件导入。

### 界面验收

- 历史页默认启动，使用 24 小时时间输入，支持三字符子串、起止时间和稳定翻页。
- 数据管理只保留多 HTU 导入、HTU/原生导出、空库恢复、存储统计、立即补全、索引重建和频繁访问阈值。
- 页面重开读取持久任务状态；超过租约的旧页面任务标记为失败并提示安全重试。导入、HTU 导出和索引重建由 worker 执行；原生备份在页面中按分块执行，实测约 3.5～4.8 秒，失败或关闭页面不会修改已提交主数据，可重新执行。

## HTU 界面结构对齐

更新时间：2026-10-01

按 [需求基线](requirements.md) 第 121 行，第一阶段页面结构、控件位置与交互对齐 HTU，不做独立视觉重设计。此前从零设计的单页卡片式界面已整体替换。

改动范围：

- 新增 `entrypoints/browse/`（`browse.html`）：历史页成为独立页面与默认启动页，结果表按「时间 / 站点图标 / 标题·域名」三列渲染，日期变化处插入可点击分隔行，上下各一组翻页控件。旧的顶栏单页界面与其绿色卡片主题（`entrypoints/options/styles.css`）已删除。
- 设置页改为 HTU 形式的分区布局：`table#general_settings`（启动页、时间显示、频繁访问忽略秒数）与 `table#storage_stats`（页面数、访问数、数据占用、搜索索引占用、索引状态、最近同步、任务状态）。
- 两个页面共用 `src/ui/base.css`，侧边导航由 `src/ui/navigation.ts` 渲染。
- 结果行的纯渲染逻辑抽到 `src/ui/result-row.ts`，与 DOM 无关，因此可以直接做单元测试。
- 工具栏图标改为打开页面标签页，并按启动页设置进入历史页或设置页。

HTU 的复选框列对应删除功能，需求第 4 节明确不做删除同步，第 121 行也禁止保留无效占位，因此不保留该列。站点图标列按用户要求保留，走 Chromium 本地 `_favicon` 接口；`favicon` 权限只在 Chromium 目标声明，Firefox 不声明且图标列留空，避免把浏览记录外泄给第三方。

分页沿用稳定水位游标。历史页以「页游标数组 + 页码」记录位置，「上一页」只是回退下标；首屏查询冻结水位，翻页期间新增访问不会改变结果集。

验证结果：

- `node --test tests/ui-result-row.test.mjs`：13 passed，覆盖列序、日期分组、24/12 小时制、新标签开关、HTML 转义、favicon 权限开关与「不保留复选框列」。
- `node --test` 运行 `htu-tsv`、`htu-import`、`htu-export`、`htu-multi-import`、`native-backup`、`search-engine`、`ui-result-row`：40 passed, 1 skipped，与第一阶段基线一致。
- `tsc --noEmit --pretty false --project .wxt/tsconfig.json`：通过。
- Chrome MV3 与 Firefox MV3 生产构建通过；Chrome 权限含 `favicon`，Firefox 不含；两者都没有 `chrome_url_overrides.history`。
- 两个页面按真实构建产物的 CSS 生成静态预览并截图核对，确认页头、侧边导航、结果表与设置分区渲染符合预期。

本机限制：Chrome 153 已移除 `--load-extension`，Playwright 自带浏览器未安装，因此真实浏览器内的端到端自动化（`tests/extension-background-collection.test.mjs` 等）无法在本机复跑，本轮的浏览器侧证据来自构建产物检查与静态预览截图。历史页入口刻意命名为 `browse.html`，避免 WXT 把 `history.html` 映射为 `chrome_url_overrides.history` 而接管浏览器自带的 `chrome://history`。

### 正式扩展和回归汇总

- 串行执行第一阶段完整自动化：`40 passed, 1 skipped`。唯一跳过项要求显式设置 `HISTORIES_HTU_BACKUP`，用于不纳入仓库的私有真实备份。
- TypeScript 检查、Chrome MV3 构建和 Firefox MV3 构建通过。
- Chrome 与 Firefox 正式扩展均采集真实访问，并在同一 profile 重启后保留；Chrome 验证浏览器历史删除后 Histories 访问仍然保留。
- 多个真实浏览器测试并发运行时曾因主机浏览器资源竞争失败，改为串行后稳定通过，因此发布检查固定使用 `--test-concurrency=1`。
- Firefox 的自动化启动工具接管 `dev-browser-data/firefox/` 外部 profile 会超时；生命周期自动化改用测试创建并重复使用的临时 profile。开发目录仍保留给人工确认，这一工具限制不影响 Firefox 正式扩展采集和重启证据。
