# History Trends Unlimited Source Analysis

Source inspected: Chrome Web Store package `pnmchffiealhkdloeffcdnbgdnedheme`, version `1.8.9`.

Local research copy:

- `research/htu.crx`
- `research/htu-crx/`

The research copy is for analysis only. Do not treat third-party source as code to copy into this extension.

## Manifest

HTU 1.8.9 is a Chrome Manifest V3 extension.

Key properties:

- background service worker: `js/background.js`
- permissions: `history`, `storage`, `unlimitedStorage`, `favicon`, `offscreen`
- minimum Chrome version: `109`
- cross-origin isolation is enabled for SQLite WASM

## Runtime Architecture

HTU uses SQLite WASM, workers, and an offscreen document:

- `js/background.js` opens `trends.html` or `history.html` and triggers auto backup on startup.
- `js/historyWorker.js` collects browser history through `chrome.history.search()` and `chrome.history.getVisits()`.
- `js/worker.js` owns the SQLite schema, sync, export, search, and statistics queries.
- `js/import-worker.js` parses HTU transfer/export files and inserts rows.
- `js/offscreen.js` exists because MV3 service workers cannot directly perform every blob/worker flow needed for export.

## Storage Schema

HTU creates:

- `urls(urlid, url, host, root_domain, title)`
- `visits(visitid, urlid, visit_time, visit_date, year, month, month_day, week_day, hour, transition_type)`
- `search_urls` as an FTS5 virtual table over `url` and `title`

Important indexes:

- unique `urls(url)`
- unique `visits(urlid, visit_time)`
- `visits(visit_time)`
- `visits(visit_date)`
- `urls(host)`
- `urls(root_domain)`

## History Sync

HTU syncs incrementally:

- reads `lastHistorySyncTime`
- calls `chrome.history.search({ text: "", maxResults: 1000000000, startTime: lastSyncTime + 1 })`
- calls `chrome.history.getVisits({ url })` for each returned URL
- ignores visits before `syncStartTime`
- optionally ignores repeated visits within a user-configurable duration
- stores the maximum non-future visit time seen as the next sync cursor

This means it does not rely only on `onVisited` events. That is useful for MV3 reliability because service workers can be asleep.

## Export Formats

HTU supports two TSV export formats.

### Archived Format

Used by Transfer History and Auto Backup.

Columns:

1. URL
2. Visit Time, prefixed with `U`
3. Transition Type as an integer
4. Page Title

Line ending: CRLF.

Filename:

- manual backup: `htu_backup_YYYYMMDD_HHMMSS.tsv`
- split manual backup: `htu_backup_YYYYMMDD_HHMMSS_partN.tsv`
- auto backup: `htu_autobackup_YYYY-MM-DD HH:MM:SS.mmm_<type>.tsv` or `.zip`

### Analysis Format

Used by Search/Trends “Export These Results”.

Columns:

1. URL
2. Host
3. Domain
4. Visit Time in Unix milliseconds
5. Visit Time local string
6. Day of Week
7. Transition Type as text
8. Page Title

Line ending: CRLF.

Filename:

- search export: `htu_analyze_YYYYMMDD_HHMMSS.tsv`
- split export: `htu_analyze_YYYYMMDD_HHMMSS_partN.tsv`

## Import Formats

HTU imports rows with 3, 4, or 8 tab-separated columns:

- 3 columns: old archived format without title
- 4 columns: archived format with title
- 8 columns: analysis format

Parsing behavior:

- every parsed line must end with CR/LF while chunk parsing is in progress
- final incomplete chunk line is buffered
- columns are split with `line.split("\t")`
- no TSV escaping/quoting layer is implemented
- 3/4-column timestamps without `U` are treated as obsolete Windows epoch values and converted
- 3/4-column timestamps with `U` are treated as Unix milliseconds
- 8-column timestamps are already Unix milliseconds
- 3/4-column transitions may be integer IDs and are converted to transition text internally
- 8-column transitions are already transition text

Accepted transition values are either integer-like strings or `[a-z_]+`.

## Search

HTU search uses SQLite FTS5:

- `search_urls MATCH ?` for URL/title keyword search
- `title MATCH ?` for advanced title search
- `highlight(search_urls, ...)` to render matched URL/title fragments

Filters include:

- date
- from/to date
- year
- month day
- week day
- month
- hour
- transition
- exact URLs
- domains, with `=domain` meaning exact host and plain `domain` matching host or subdomain
- title keywords

Default sort:

- newest first unless oldest is selected
- tie-breaker: root domain, host, URL

## Statistics

HTU statistics are SQL aggregate queries over `urls` and `visits`.

Feature categories visible from source:

- total visits
- unique URLs/history items
- visits by date
- visits by hour
- visits by weekday
- visits by month day
- visits by month
- visits by year
- visits by transition type
- top domains/hosts/URLs

## Implications For This Rewrite

For 100% import/export compatibility:

- implement both archived and analysis TSV formats
- support 3-, 4-, and 8-column imports
- preserve CRLF output
- preserve non-escaped tab split behavior for HTU compatibility mode
- support obsolete Windows epoch import
- support `U` Unix timestamp prefix for archived import/export
- convert transition IDs and text exactly like HTU
- support split file naming
- support zipped auto backup if we implement auto backup compatibility

For Chrome and Firefox compatibility:

- do not copy HTU's Chrome-only architecture blindly
- verify Firefox support for SQLite WASM + OPFS + required worker mode before choosing SQLite as the storage engine
- if Firefox cannot match HTU's storage stack cleanly, keep HTU-compatible TSV at the import/export boundary and use an alternate internal store
