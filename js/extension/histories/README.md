# Histories

Histories 是一个面向 Chrome 和 Firefox 的本地历史记录扩展，目标是替代 History Trends Unlimited（HTU），同时提供更可靠的历史归档和更灵活的子串搜索。

## 当前结论

项目目前处于早期 Alpha。HTU TSV 解析、单文件导入、IndexedDB 存储、SQLite WASM FTS5 搜索、时间范围交集、4 列 HTU 导出和一次性浏览器历史同步已有可运行原型及自动化测试，但还不能作为可靠的 HTU 替代品长期使用。

当前最重要的缺口：

- 连续导入多个 HTU 文件时，现有实现会覆盖之前的 chunk 数据，尚未实现合并导入。
- 尚未接入实时访问监听，也没有完成实时监听与补偿扫描之间的幂等去重。
- 页面拥有的长任务会随页面关闭而终止，任务恢复机制尚未完成。
- 搜索索引的失效、自动增量更新和损坏恢复尚未形成完整闭环。
- Chrome 和 Firefox 的真实扩展安装、长期运行和大数据回归尚未完成。

## 第一阶段

第一阶段只交付四项核心能力：

1. 完整、稳定、尽量无重复地记录浏览器已有访问和后续新访问。
2. 将多个浏览器导出的 HTU 历史文件合并导入同一历史库。
3. 提供可完整恢复数据的原生导出，并保留 HTU 兼容导出能力。
4. 支持标题与 URL 的至少 3 字符连续子串搜索，并可叠加访问时间范围，结果按访问时间倒序分页。

明确不属于第一阶段：

- 统计分析和趋势图表
- 定时自动备份
- HTU 的全部高级筛选器
- 跟随浏览器删除历史；Histories 只负责保存已经观察到的访问
- 保存 `data:image/...` 内联图片 URL；同步和导入时仅统计忽略数量
- 与核心流程无关的复杂设置和视觉重设计

详细需求、去重规则、稳定性要求和验收标准见 [第一阶段需求基线](docs/requirements.md)。该文档是第一阶段产品范围的唯一基准；其他文档出现冲突时以它为准。

## 已验证技术路线

- 持久数据源：IndexedDB。
- 搜索引擎：SQLite WASM `:memory:` + FTS5 trigram。
- 搜索快照：保存到 IndexedDB，可从持久历史数据重建。
- HTU 兼容：接受 3、4、8 列 TSV；4 列归档格式已完成字节级往返验证。
- 浏览器支持：使用 WXT 从同一源码生成 Chrome MV3 和 Firefox MV3 构建。

最新外部真实备份验证规模为 `900,177` 条保留访问、`388,633` 个 URL。常见连续子串查询约为十几到几十毫秒；首次搜索索引构建约几十秒，快照约 `568 MiB`。最近 7 天的 `2,264` 条访问完成真实增量回放验证：批量 dirty replay 约 `407 ms`，因此增量 FTS 路线已确认可行。完整数据和环境见 [验证记录](docs/verification.md)。

## 界面基线

第一阶段在已纳入范围的功能上，页面结构、控件位置和交互与 HTU 保持一致；未纳入第一阶段的统计和高级筛选器不显示：

- 默认启动页：历史记录。
- 时间显示默认使用 24 小时制。
- 搜索支持关键词与起止时间范围。
- 设置只保留导入、导出、存储统计，以及同步历史中的“忽略同一 URL 在指定秒数内的频繁访问”。
- 频繁访问忽略阈值只作用于浏览器历史同步，默认沿用 HTU 的 `2.0` 秒，`0` 表示不主动忽略不同访问；它不得过滤 HTU 文件导入的数据。

“存储统计”仅指页面数、访问数、占用空间、索引状态和任务状态，不是趋势分析功能。

## 文档地图

当前工作依据：

1. [第一阶段需求基线](docs/requirements.md)：当前产品范围、行为和验收标准。
2. [实施计划](docs/implementation-plan.md)：按可靠性优先排列的开发顺序。
3. [验证记录](docs/verification.md)：性能实验、浏览器探针和测试结果。

技术设计与证据：

- [架构设计](docs/architecture.md)：IndexedDB、SQLite FTS 和任务模型。
- [HTU 兼容性](docs/htu/compatibility.md)：TSV 格式和兼容测试要求。
- [HTU 源码分析](docs/htu/source-analysis.md)：HTU 1.8.9 的同步、存储、搜索和导入导出行为。
- [测试说明](tests/README.md)：自动化测试分类、命令和外部数据环境变量。

历史规划资料：

- [2026 年 7 月实现状态](docs/archive/status-2026-07.md)
- [早期开发路线图](docs/archive/development-roadmap.md)
- [早期技术分析](docs/archive/technical-analysis.md)

## 开发与验收

在插件目录启动 WXT 开发模式：

```powershell
Set-Location js\extension\histories
npx wxt dev
```

Chrome/Chromium 的开发 profile 固定保存在 `dev-browser-data/chromium/`，Firefox 使用 `dev-browser-data/firefox/`。扩展数据会跨开发会话保留，便于复现和人工确认效果；具体约束见 [开发浏览器数据说明](dev-browser-data/README.md)。自动化测试仍使用一次性临时 profile，不会修改这里的数据。

## 非目标

- 新标签页替换
- 二维码工具
- 翻译工具
- 通用测试页
- 将私有历史数据发送到外部服务
