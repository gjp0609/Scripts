# Histories Architecture Design

Updated: 2026-09-30

> 本文件的「Frozen Phase-One Decisions」小节是 2026-08-17 冻结的第一阶段架构结论。其余小节为设计意图与背景，产品范围和验收口径以 [第一阶段需求基线](requirements.md) 为准。

## 2026-08-17 Frozen Phase-One Decisions

### Extension storage and search

- Chrome and Firefox extension origins both persisted the full `900,177`-visit dataset and a `602,546,176`-byte SQLite snapshot across browser restarts.
- Chrome reported about 64 GiB quota with `persisted=false`; Firefox reported about 100 GiB with `persisted=true`. The current full dataset used about 428 MiB and 412 MiB respectively according to `navigator.storage.estimate()`.
- Search snapshot loading validates schema version, byte length, and FTS page count. A missing or corrupt snapshot is an index failure, never a main-data failure.
- MV3 extension pages require `script-src 'self' 'wasm-unsafe-eval'` for SQLite WASM.
- FTS rebuild inserts run in one explicit SQLite transaction. Per-row auto-commit is not viable at full scale.

### Stable time pagination

- The stable order is `(matchedVisitTime DESC, pageId DESC)`.
- The first query freezes an `endTime` watermark. Every following cursor carries the same watermark so newly arriving visits cannot shift an active result set.
- Visit chunks are loaded once, sorted by `minVisitTime`, and retained as typed arrays while the search engine is active.
- Each page scans visits backward until it finds `limit + 1` distinct candidate pages, including all candidates tied at the boundary timestamp. It then counts visits only for the selected page ids.
- FTS returns page-id candidates only. Candidate membership is stored as a cached `Uint8Array` bitmap; page metadata is fetched from SQLite only for selected ids.
- Full-data measurements: time-only first page `0.8-25.6 ms`, ordinary cold keyword pages `18.8-68 ms`, and ten sequential `github` pages P50 `16.3 ms`. The extreme high-hit cold `google` query was `120.5 ms`; subsequent pages use the cache and remain about `15-18 ms`.

### Browser visit identity

- `history.onVisited` emits a page summary, not a visit record. It exposes no `visitId` or transition in either verified browser.
- After `onVisited`, the collector must call `history.getVisits({ url })` and ingest unseen visit records from a safe overlap window.
- Browser-source identity is `(sourceInstanceId, visitId)` when `visitId` is present. Exact URL, visit time, and transition form a cross-channel compatibility fingerprint for scans, retries, and HTU rows.
- Title, `typedCount`, `isLocal`, and `referringVisitId` are source metadata, not canonical identity fields.
- Chrome exposed separate link and reload visits. Firefox coalesced the tested reload and did not expose a second reload visit. The collector must preserve what the browser API reports and must not synthesize unavailable visits.
- Chromium exposed `typedCount` on history items and `isLocal` on visits; Firefox did not consistently expose those fields. Shared storage cannot require them.
- Browser page identity keeps the exact browser URL (including hash) for collection/deduplication; HTU page normalization remains hash-free for archive compatibility. This prevents two exact browser fragment URLs from collapsing while preserving legacy HTU behavior.
- Background collection serializes generation publication. `history.onVisited` is coalesced for 250 ms, then `getVisits` completion supplies visit records. Incremental scans use a 5-second overlap and activation uses parent-generation compare-and-swap, so stale concurrent jobs fail safely instead of overwriting newer data.

### Unified durable layout

- Main data uses versioned generations. An active-generation pointer is the atomic publication boundary.
- Page and visit segments are immutable once published. Both HTU batches and browser increments use the same segment encoding.
- Visits have a time-sorted segment representation for queries and a page/time/transition identity representation for merge deduplication.
- Small real-time writes first enter durable delta segments. Import or compaction builds a new generation from the active generation plus staged input, then atomically switches the active pointer.
- Search snapshots, page aggregates, candidate bitmaps, and statistics are derived data and never participate in the main-data commit decision.
- Database v6 stores `historyGenerations`, `generationPageChunks`, and `generationVisitChunks`; legacy `pages`, `visits`, `pageChunks`, and `visitChunks` remain read-only compatibility fallbacks until the next successful generation publication.
- Each activation assigns a monotonically increasing generation revision and atomically writes its dirty-page records. Internal `generationId` and segment ordinal fields never escape public chunk readers.
- Failed staging writes abort their IndexedDB transaction. A generation that fails before activation remains invisible and can be removed by stale-generation cleanup without touching the active generation.
- A browser profile owns a random persistent history source referenced by `historyMetadata.localBrowserSource`. Browser visit source keys are `sourceInstanceId:visitId`; missing native visit ids use the compatibility fingerprint fallback.
- Resumable jobs use owner leases. Terminal jobs release owner and lease fields, and synchronization writes its committed `nextStartTime` only after active-generation publication.
- HTU file sources use `source:htu:<sha256>` identities. Import batches retain per-file format, row/time-range, added, duplicate, ignored, and error counts.
- Visit segments encode HTU provenance compactly: a per-segment source-id dictionary, one offset array, and a flat source-reference array. A duplicate visit can therefore retain all contributing files without repeating 64-character hashes on every row.
- Empty-library multi-file imports sort a flat visit array and collapse adjacent fingerprints; non-empty imports merge against the active generation. Both paths choose deterministic titles/source ownership so reversing file order produces the same canonical history.

## Goal

Build a Chrome and Firefox compatible history extension that can replace History Trends Unlimited.

Primary goals:

- Import all browser history and keep it synchronized.
- Search large history sets quickly by title and URL.
- Support keyword plus time-range queries.
- Import and export HTU-compatible TSV files.
- Preserve HTU-compatible behavior where compatibility matters.

Non-goals:

- New tab replacement.
- QR code tools.
- Translation tools.
- Reusing the removed extension runtime code.

## Architecture Overview

The implementation uses two storage/search layers:

- IndexedDB is the durable source of truth.
- SQLite WASM `:memory:` with FTS5 `trigram` is the search engine.

SQLite OPFS is not required. Chrome can use SQLite OPFS, but Firefox extension pages do not expose the conditions needed by SQLite OPFS VFS in the verified environment.

High-level flow:

```text
Browser history API / HTU import
  -> normalize URL/page/visit records
  -> IndexedDB pages + minimal visits
  -> SQLite FTS in worker for title+URL search
  -> SQLite FTS snapshot stored in IndexedDB
```

Startup flow:

```text
open extension
  -> open IndexedDB
  -> load latest SQLite FTS snapshot
  -> create SQLite :memory: database from snapshot bytes
  -> search is ready
```

If no snapshot exists:

```text
open extension
  -> build FTS from IndexedDB pages
  -> save snapshot
```

## Browser Model

Use generated browser-specific manifests:

- Chrome: Manifest V3 with `background.service_worker`.
- Firefox: Firefox-compatible WebExtension manifest with supported background scripts/pages.

Shared source should not depend directly on `chrome.*` or `browser.*`. Use a small compatibility adapter for:

- history API
- runtime messaging
- storage permissions
- downloads
- i18n

## Data Model

数据库为 IndexedDB `histories`，版本 `6`。主数据以不可变 generation 存储，active generation 指针是原子发布边界。字段定义见 `src/storage/schema.ts`。

### 主数据（权威，不可丢失）

- `historyGenerations`：generation 记录（`staging`/`active`/`retired`），含 `revision`、`reason`、`dataFormatVersion`、来源与计数。
- `generationPageChunks`、`generationVisitChunks`：按 generation 分段的页面与访问数据；页面段用列式字符串数组，访问段用 `Uint32Array`/`Float64Array`/`Uint8Array` 存 pageId、访问时间与 transition 码。
- `historyMetadata`：`activeGeneration` 与 `localBrowserSource` 两个键。
- `historySources`：HTU 文件、浏览器历史、原生备份的来源实例。
- `importBatches`：每次导入的批次与逐文件报告（行数、新增、重复、忽略、错误、时间范围）。

### 派生数据（可重建，不参与主数据提交）

- `searchSnapshot`：序列化的 SQLite FTS 库，含 `schemaVersion`、`sqliteVersion`、`sourceRevision`、`pageCount`、`snapshotSize`、`sha256`。
- `dirtyPages`：按 `revision` 索引的待回放页面，记录 `new-page`、`search-text-changed` 或 `deleted-from-generation`。
- `jobs`：可恢复任务，含 `ownerId`、`leaseUntil`、`retryCount`、`resumable`、`cursor`、`progress`、`error`。

### 旧版兼容（只读回退）

`pages`、`visits`、`pageChunks`、`visitChunks` 为 v5 结构，保留供旧库升级读取，不再作为写入目标。统计数据（原 `stats_*`）不属于第一阶段，尚未实现。

## Search Design

SQLite FTS table:

```sql
CREATE VIRTUAL TABLE pages_fts USING fts5(
  search_text,
  url UNINDEXED,
  title UNINDEXED,
  visit_count UNINDEXED,
  last_visit_time UNINDEXED,
  tokenize='trigram'
);
```

`search_text` 为原始 URL、安全解码 URL 与标题拼接后小写并做 NFKC 规范化的结果，见 `normalizeSearchText()`。三字符是子串查询下限：规范化后少于 3 个字符不执行子串查询。

Search modes:

- Keyword-only: SQLite FTS returns page-level candidate ids.
- Time-only: the sorted visit-time index returns results directly, without FTS.
- Keyword plus time range: intersect FTS page-id candidates with visit-time range counts from the main data.

Query planning:

- The first query freezes an `endTime` watermark; every following cursor carries the same watermark so newly arriving visits cannot shift an active result set.
- The stable order is `(matchedVisitTime DESC, pageId DESC)`.
- Each page scans visits backward until it finds `limit + 1` distinct candidate pages, including all candidates tied at the boundary timestamp, then counts visits only for the selected page ids.
- FTS returns page-id candidates only; candidate membership is cached as a `Uint8Array` bitmap, and page metadata is fetched from SQLite only for the selected ids.

Transition filters and domain/host filters are not part of phase one.

## Synchronization Design

Initial sync:

```text
history.search({ text: "", startTime: 0, maxResults: large })
  -> page upsert
  -> minimal visit insert where available
  -> FTS update queue
  -> snapshot save after batch/import completes
```

Continuous sync:

- New visit: upsert page, insert visit; FTS is touched only when the page is new or its title/search text changed, otherwise only the dirty page is recorded.
- Title change: update page title, update the FTS row, mark the page dirty.
- Browser history deletion is not observed and not mirrored. Histories keeps every visit it has already recorded; there is no tombstone or delete-range path.

Snapshot policy:

- Save immediately after initial import.
- Save after HTU import.
- Save on idle after batches of incremental changes.
- Avoid writing a roughly 568 MB snapshot for every single visit.

## HTU Compatibility Design

Compatibility parser and serializer stay independent from browser runtime and storage.

Supported import formats:

- 3-column archived format.
- 4-column archived/backup/transfer format.
- 8-column analysis/search/trends format.

Export requirements:

- 4-column archived/backup TSV must round-trip byte-for-byte when data is unchanged.
- CRLF line endings.
- `U<visit_time>` timestamp prefix for archived export.
- Numeric transition ids for archived export.
- No TSV quoting/escaping, matching HTU behavior.

## UI Design

第一阶段界面以 [需求基线](requirements.md) 的「第一阶段界面」为准：默认启动到历史页，提供关键词、起止时间、搜索与稳定翻页，设置页只保留导入、导出、存储统计、默认启动页、时间显示和频繁访问忽略秒数。页面结构、控件位置与交互对齐 HTU，不做独立视觉重设计。

页面与入口：

- `entrypoints/browse/index.html`（输出 `browse.html`）：历史页，扩展的默认启动页。结果表列序与 HTU 一致：时间、站点图标、标题/域名，日期变化处插入可点击的日期分隔行，上下各有一组翻页控件。
- `entrypoints/options/index.html`（输出 `options.html`）：设置页，用 `table#general_settings` 承载启动页、时间显示与频繁访问忽略秒数，用 `table#storage_stats` 承载页面数、访问数、数据占用、搜索索引占用、索引状态、最近同步与任务状态。
- `src/ui/base.css`：两个页面共用的基础样式；`src/ui/navigation.ts` 渲染 HTU 形式的侧边导航；`src/ui/result-row.ts` 是结果行的纯渲染函数，便于测试。

历史页入口刻意不命名为 `history.html`：WXT 会把该文件名映射为 `chrome_url_overrides.history`，从而接管浏览器自带的 `chrome://history`。HTU 自身也不声明该覆盖项。

分页沿用搜索索引的稳定水位游标。历史页以「页游标数组 + 页码」记录翻页位置，因此「上一页」只是回退下标；首屏查询会冻结水位（结束时间或当前时刻），翻页期间新增的访问不会改变结果集。站点图标走 Chromium 的本地 `_favicon` 接口，仅在清单声明 `favicon` 权限时启用，避免把浏览记录外泄给第三方；Firefox 不声明该权限，图标列留空。

以下为后续阶段的设计意图，不属于第一阶段：

- 访问详情或页面时间线。
- 统计与趋势视图。
- 关键词与时间范围之外的筛选器（transition、域名/主机、结果粒度）。

## Reliability

Required recovery points:

- Browser-history sync cursor, retained with a 5-second overlap window.
- HTU import batch status and per-file reports.
- FTS rebuild job status.
- Dirty pages, cleared only after a checkpoint is saved successfully.
- Last successful snapshot metadata, including its `sha256`.

If the FTS snapshot is missing or corrupt:

- keep IndexedDB main data intact
- mark the index unavailable while main data stays readable
- rebuild FTS from the active generation in a worker
- save a new snapshot and verify its `sha256`

Native `.hbk` restore verifies format version, byte counts, chunk counts, per-chunk SHA-256 and totals before publishing a new generation, and phase one only restores into an empty database.

## Performance Targets

Targets based on the external full HTU backup:

- Parse HTU TSV under 5 seconds.
- First FTS build preferably under 2 minutes.
- Snapshot load under 5 seconds.
- Keyword search under 100 ms for common queries.
- Keyword plus time-range search under 200 ms for typical filters.
- Sync single new visit without UI-visible delay.

截至 2026-09-30 的实测对照（数据与口径见 [验证记录](verification.md)，复现方式见 [测试说明](../tests/README.md)）：

- 首次 FTS 建立约 `45.6 s`，满足「2 分钟内」。
- 快照 checkpoint 保存约 `2.50 s`、加载约 `2.64 s`，满足「5 秒内」。
- 时间范围首页 `0.8–25.6 ms`；常规冷启动关键词页 `18.8–68 ms`；连续十页 `github` 查询 P50 `16.3 ms`；极端高命中冷启动 `google` 查询 `120.5 ms`，其后续页走缓存约 `15–18 ms`。
- 真实约 90 万访问的多文件导入单次约 `3.0–4.0 s`。

## Open Risks

截至 2026-09-30，第一阶段原列风险的处理结果：

- 扩展上下文快照配额已验证：Chrome 约 64 GiB（`persisted=false`）、Firefox 约 100 GiB（`persisted=true`），完整 `900,177` 访问数据集加 `602,546,176` 字节快照可跨浏览器重启持久保存。结论与数据见 [验证记录](verification.md)。
- 关键词加时间范围的访问级交集已完成基准：真实约 90 万访问下常见首页为毫秒到几十毫秒，连续十页无重复或漏项。见 [验证记录](verification.md)。
- 快照更新频率已按低频 checkpoint 策略落地：仅新页面或搜索文本变化进入 dirty 集合，checkpoint 保存成功后才清除 dirty。
- 快照体积仍未缩减（约 568 MiB），属已知取舍：第一阶段以可重建的完整 FTS 快照换取查询性能，体积优化留待后续阶段。
- Chrome 与 Firefox 的后台生命周期差异仍存在：Firefox 自动化无法接管外部开发 profile，生命周期证据改用测试创建的临时 profile。见 [验证记录](verification.md)。
