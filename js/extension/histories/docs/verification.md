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

Implementation implication:

- The first parser/serializer milestone must preserve this 4-column backup file byte-for-byte when no data changes are made.
- Import tests should use this file as an external local fixture path, not as a repository fixture.

## Next Verification Steps

1. Build a minimal extension probe that runs in Chrome and Firefox.
2. In the probe, test:
   - `navigator.storage.getDirectory`
   - SQLite WASM initialization
   - database persistence across extension reload
   - FTS5 virtual table creation
   - worker/background execution model
3. Use a temporary Chrome profile.
4. Use the installed Firefox ESR profile isolation or a temporary profile.
5. Decide between:
   - SQLite WASM + OPFS as primary storage
   - IndexedDB plus custom search index as fallback
