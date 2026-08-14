# Histories Tests

测试从仓库根目录使用根项目依赖运行。正式测试文件使用 `*.test.mjs`，浏览器入口使用配对的 `*-entry.ts`。

## 快速检查

```powershell
npx tsc --noEmit --pretty false --project js\extension\histories\.wxt\tsconfig.json
node --test js\extension\histories\tests\htu-tsv.test.mjs js\extension\histories\tests\htu-import.test.mjs js\extension\histories\tests\htu-export.test.mjs js\extension\histories\tests\search-engine.test.mjs js\extension\histories\tests\history-sync.test.mjs
```

## 浏览器烟测

```powershell
node --test js\extension\histories\tests\storage-smoke.test.mjs
node --test js\extension\histories\tests\search-sqlite-browser.test.mjs
node --test js\extension\histories\tests\import-worker-browser.test.mjs
node --test js\extension\histories\tests\export-worker-browser.test.mjs
node --test js\extension\histories\tests\search-rebuild-worker-browser.test.mjs
```

这些测试会启动本地 HTTP 服务和无头 Chrome，并使用临时目录。测试结束后应自动清理临时资源。

## 外部 HTU 备份

真实历史备份不属于仓库文件，不得复制到 `fixtures/`、日志或提交中。通过环境变量提供绝对路径：

```powershell
$env:HISTORIES_HTU_BACKUP='C:\path\to\htu_backup.tsv'
node --test js\extension\histories\tests\htu-tsv.test.mjs
node --test js\extension\histories\tests\htu-import-full-browser.test.mjs
node --test js\extension\histories\tests\search-incremental-full-browser.test.mjs
```

增量索引基准的可选参数：

- `HISTORIES_INCREMENTAL_HOLDOUT_DAYS`：从最大访问时间向前保留为增量数据的天数，默认 `7`。
- `HISTORIES_INCREMENTAL_QUERY_ITERATIONS`：每个固定公共查询的重复次数，默认 `12`。
- `HISTORIES_INCREMENTAL_UPDATE_FTS_METADATA`：是否把已有 URL 的访问元数据写回 FTS，默认 `false`；生产推荐策略保持 `false`。

测试输出只能包含聚合计数、时间、大小和哈希，不得输出 URL、标题或其他私有历史内容。
