# 书签插件架构规范

目标不是把现有大文件继续拆成更多文件，而是让数据、状态、布局和副作用各自只有一个职责。重构必须按边界迁移，禁止先复制旧逻辑再用条件拼接。

## 落地状态

| 范围         | 当前实现                                                                                                                | 状态                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 页面组合     | `App.vue` 组合工作区、搜索、CRUD、整理与导入用例                                                                        | 已落地，尚未单独建立 `useBookmarkPage` |
| 三种画布     | `BrowseCanvas`、`BookmarkOrganizeCanvas`、`FolderOrganizeCanvas`                                                        | 已落地                                 |
| 搜索状态     | `useSearchState` + `useSearchCommands`，浮层由 App 受控                                                                 | 已落地                                 |
| 整理领域     | `organizeMoveModel` + 两种 drag session + scroll controller + Sortable adapters + `useOrganizeDrag` + `useOrganizeMove` | 已落地                                 |
| 导入事务     | `importDataModel` + `importTransactionModel` + `importRestoreExecutor` + `importRollback` + `importExportService`       | 已落地                                 |
| 领域目录重组 | `layout/`、`organize/`、`interaction/` 物理目录                                                                         | 目标结构，暂不为移动文件而移动文件     |
| 页面目录重组 | `page/`、`browse/`、`search/`、`tags/` 等物理目录                                                                       | 目标结构，仅在职责继续增长时迁移       |

以下章节同时包含已落地约束和目标边界；目标结构不得被描述为当前已有文件。

## 1. 分层

```text
UI 组件
  ↓ 事件 / props
页面状态协调器
  ↓ 用例命令
领域服务
  ↓ 数据契约
浏览器 API / storage / favicon
```

### 1.1 基础设施层

- `bookmarkApi`：只封装浏览器 bookmarks API 和事件，不包含 UI 状态。
- `extraStore`：只读写插件 extra 和偏好，并把工作区相关的 storage 变化转换为明确事件；不直接修改页面状态。
- `metadataMaintenance`：读取完整书签树并应用扩展数据维护计划，不删除或移动浏览器节点。
- `extensionRuntime`：只处理 tabs、popup 和扩展运行时能力。
- `favicon`：只负责浏览器缓存 URL、候选降级、去重和刷新 token。
- Chrome 扩展页关闭 Vite `modulepreload`；共享 chunk 由 ESM import 正常加载，避免扩展 world 不匹配产生无效预加载警告。
- `bookmarkRootModel`、`metadataMaintenanceModel`：纯函数选择新版 Chrome 根目录并生成可测试的维护计划。

### 1.2 数据层

- `bookmarkRepository`：加载浏览器树，合成 `BookmarkView`，执行 CRUD 和移动写回。
- 数据层不得知道 Macy、Sortable、Vue ref、DOM class 或浮层状态。
- 数据层所有移动函数接受明确的领域输入，返回真实浏览器节点或失败，不通过全局数组副作用传递结果。

### 1.3 领域层目标

- `searchService`：纯函数解析普通、`#`、`!` 查询，引擎和 tag 候选，构造安全 URL。
- `layout/`：维护三种画布的布局生命周期，不拥有书签数据写回。
- `organize/`：维护完整顺序、可见锚点和预测落点的纯函数。
- `interaction/`：维护顶层模式、必要的浮层关系和 Esc 回退顺序。
- `organize/filtering`：分别定义整理模式-书签的书签字段过滤和整理模式-目录的目录标题过滤。

领域层应尽可能无 DOM、无计时器、可单元测试。

### 1.4 页面协调层目标

页面协调器只负责组合用例和把状态传给组件：

- `useBookmarkPage`：加载、刷新、页面错误和全局生命周期。
- `useSearchState`：唯一 query、解析状态、active 索引和浮层互斥。
- `useBrowseMode`：浏览折叠偏好、浏览画布和工具命令。
- `useOrganizeMode`：整理顶层状态、子模式切换和临时折叠。
- `useBookmarkCrud`：添加、编辑、删除和错误上下文。
- `useImportExport`：导入导出忙碌、文件校验和结果。

当前 `App.vue` 的职责必须逐步迁移到以上协调器；迁移期间不允许继续增加业务分支。

## 2. 三种画布必须隔离

| 画布          | 布局                         | 拖拽          | 折叠状态     | 约束                     |
| ------------- | ---------------------------- | ------------- | ------------ | ------------------------ |
| 浏览模式      | Macy，`trueOrder: false`     | 无            | 持久浏览偏好 | 只优化视觉扫描           |
| 整理模式-书签 | 独立 Macy，`trueOrder: true` | 书签 Sortable | 临时整理状态 | 支持真实投放区和跨目录   |
| 整理模式-目录 | 正常流 CSS Grid              | 目录 Sortable | 无展开状态   | 仅标题、等高、唯一预测槽 |

- 三者共享只读数据投影，不共享布局实例、拖拽实例或临时折叠集合。
- 切换画布必须先销毁旧实例，再挂载新实例；不能在同一实例上不断切换 flags。
- 任何画布状态不能通过 DOM class 反向推导领域状态。

## 3. 组件边界

目标树（尚未按物理目录完全迁移）：

```text
app/
  page/
    BookmarkPage.vue
    useBookmarkPage.ts
  browse/
    BrowseCanvas.vue
    BrowseFolder.vue
    BrowseToolbar.vue
  organize/
    OrganizeCanvas.vue
    BookmarkOrganizeCanvas.vue
    FolderOrganizeCanvas.vue
    OrganizeToolbar.vue
    useOrganizeMode.ts
  search/
    SearchBox.vue
    SearchDropdown.vue
    EngineMenu.vue
    useSearchState.ts
  tags/
    TagButton.vue
    TagPanel.vue
  bookmark/
    BookmarkRow.vue
    BookmarkFormDialog.vue
    FolderFormDialog.vue
  common/
    ConfirmDialog.vue
    ImportExportDialog.vue
    SiteFavicon.vue
```

组件只处理渲染和局部可视交互：

- `SearchBox` 不执行 URL，不读浏览器书签。
- `SearchDropdown` 不决定 query 类型，只展示状态并发出选择事件。
- `BrowseCanvas` 不创建 Sortable。
- `BookmarkOrganizeCanvas` 不实现目录 CRUD。
- `FolderOrganizeCanvas` 不渲染书签操作。
- 表单组件不直接调用浏览器 API，只提交规范化表单值。

## 4. 状态所有权

- query 只有一个来源。
- 引擎 selected 和 active 属于搜索状态；组件不得内部复制业务索引。
- 浏览折叠偏好属于浏览状态；整理临时折叠属于整理状态。
- `pendingMove` 和写回忙碌属于整理用例；不能通过按钮 class 表达。
- 搜索下拉、引擎菜单、tag 面板和功能菜单由 App 持有受控 open 状态；同一时刻只允许一个瞬时交互表面处于打开状态。
- 子组件不得复制 open 布尔量或通过递增 token 广播关闭；Esc 直接修改唯一状态源。
- 搜索引擎 selected、active、hover 由 `useSearchState` 唯一持有；`HeaderBar` 只能受控渲染，不得拥有自己的 active 索引。
- `!` 查询隐藏普通书签搜索结果，但保留书签部分背景和当前引擎入口。

禁止：

- 由多个组件分别监听 `Escape` 并竞争关闭顺序。
- 用 `setTimeout` 触发布局正确性。
- 用 `querySelector` 结果作为真实数据顺序。
- 通过 `classList.add` 代替显式的响应式目标状态。
- 用拖动后的 DOM 顺序直接推断浏览器绝对索引。
- 在 `App.vue` 中新增第三套搜索、拖拽或 CRUD 流程。

## 5. 布局生命周期

布局适配器应逐步收敛为统一接口；当前 Macy/Grid 组件仍保留 Vue 生命周期适配，迁移完成前不得把该目标接口当作已落地能力：

```ts
type CanvasLayout = {
    mount(container: HTMLElement): void;
    update(input: LayoutInput): void;
    destroy(): void;
};
```

- `mount` 只建立实例。
- `update` 只响应数据、尺寸和模式输入。
- `destroy` 必须释放实例、监听器和临时样式。
- 高度变化由 Vue 渲染和 ResizeObserver 驱动，不以任意延时猜测 DOM 已稳定。
- 书签动态投放目标必须由明确的 `dropTargetId` 和 `dropPhase` 驱动，不能用“零高度 + class + 延时器”作为隐式协议。
- Sortable 只产生拖动副本和会话事件，不拥有预测顺序；指针命中、预测画布和最终写回共用一个 `MovePlan`。
- 根目录完整 children 顺序属于工作区数据，目录 API index 不得仅从可见目录或目录自身 index 猜测。

外部书签事件与本地乐观移动必须通过整理移动协调器串行处理：写回期间禁用新的拖拽，完成后再重建拖拽实例；失败重新读取真实树并恢复临时折叠集合。浏览器 UI 排序通过 `onChildrenReordered` 通知，不会产生对应 `onMoved`，因此命中当前书签栏或可见目录时必须静默重载完整工作区。工作区同时串行消费相关 `storage.local` 事件：extra 变化只重建对应书签视图，偏好变化更新搜索引擎与浏览折叠状态；外部移入节点在合成视图前读取其 extra。

完整备份不得依赖单层 UI 投影。v3 导出从书签栏完整子树递归生成，并保存导出实例 `originId`；同实例导入优先按 `sourceId` 找回被移动节点，跨实例首次导入按父目录内结构和顺序匹配，不能把碰巧相同的 Chrome ID 当成身份。每个 `originId + sourceId -> targetId` 映射以独立 storage key 持久化，含义是“备份文件中的节点 ID -> 当前 Chrome profile 实际节点 ID”，用于重复导入和偏好重映射；后续重复导入优先复用该节点。扩展申请 `unlimitedStorage`，手动维护同时删除目标节点已不存在的失效映射。extra 只 patch 本次备份涉及的节点，禁止清空全量 extra 后重建。Chrome 节点 ID 是基础设施标识，不是可原样恢复的领域标识。

Chrome bookmarks API 不提供跨书签与 storage 的原子事务。导入必须保存原根子树快照，逐项记录补偿失败，并在补偿后重新读取根子树校验结构、标题、URL 和顺序；只有校验一致才能认为自动恢复完成。维护计划是幂等的扩展数据修复，不得借维护名义修改浏览器主数据；应用维护计划前必须重新读取 storage，只修改仍与计划快照一致的键，避免覆盖 Popup 或其他页面刚完成的写入。

v3 导入文件属于当前版本的严格数据契约，不承担旧格式兼容。存在 extra 时必须完整满足 `BookmarkExtra` schema：`bookmarkId` 与 `sourceId` 一致，tags 为字符串数组，可选字段类型正确，`updatedAt` 为非负有限数。schema 校验通过后才允许执行 trim、tag 去重等规范化，禁止用默认值静默掩盖损坏备份。

导入事务通过显式端口绑定 bookmarks API 与 storage。正式测试必须覆盖恢复执行、extra、映射、偏好四个失败阶段，验证 storage 尝试范围、created/changed journal、逆序补偿、二次补偿失败提示和最终树 fingerprint；只测试候选匹配不算事务覆盖。

## 6. 拖拽落点算法

整理模式-书签只由窗口级鼠标/触摸移动事件维护最后有效指针坐标，Sortable 的 `onMove` 不得用缺失或伪造的 `(0,0)` 坐标覆盖它。滚轮期间暂停边缘自动滚动，鼠标再次移动后恢复，避免两个方向相反的滚动源竞争。插入线锚点和前后位置变化不改变目录几何，不得触发 Macy 重排；只有目标目录切换导致动态展开、折叠状态或数据结构变化时才重算布局。

目录与书签拖拽必须使用独立 session：各自拥有 DOM 命中、projection 和 MoveRequest。指针、滚轮、边缘滚动和 RAF 由共享 scroll controller 管理；Sortable adapters 只管理库配置；`useOrganizeDrag` 只负责实例启停、顶层会话和写回调度。任何模块不得同时重新实现另一模式的落点规则。

拖拽计算拆为纯函数：

1. `getVisibleOrder`：读取当前画布中可见 ID。
2. `resolveDropAnchor`：根据前后可见项确定语义锚点。
3. `mapAnchorToFullOrder`：映射完整父级数组，保留不可见项相对顺序。
4. `toBrowserIndex`：转换为 Chrome API 的绝对索引。
5. `applyOptimisticMove`：只更新视图投影；写回由 `useOrganizeMove` 串行执行。
6. 失败时重新读取浏览器树，并由整理协调器恢复临时折叠状态；产品不保留撤销快照或撤销命令。

每一步都必须可单元测试；组件事件只提供源 ID、目标容器和指针位置，不直接拼接 API index。

## 7. 迁移顺序

1. 冻结浏览模式行为并补齐回归矩阵。
2. 提取纯搜索状态和解析器，保持页面视觉不变。
3. 提取数据写回用例，移除 `App.vue` 中的 API 调用。
4. 建立浏览模式独立画布，验证不退化后再迁移整理模式。
5. 建立整理模式-书签画布和纯落点算法。
6. 建立整理模式-目录 Grid 和预测槽。
7. 最后迁移模态、tag、工具和 Popup。

每一步都必须通过浏览模式回归矩阵，不能等待全部重构完成后一次性验证。

## 8. 代码质量门槛

- TypeScript 类型表达模式、状态和领域输入，禁止 `any` 绕过边界。
- 纯函数优先，副作用集中在 service / composable。
- 组件文件不超过单一职责可理解范围；超过约 300 行必须说明拆分理由。
- 页面协调器不直接操作多个布局库实例。
- 新增修复不得只增加条件分支；若职责不清，先移动职责再修行为。
- 每个缺陷必须有回归测试或明确的人工验证步骤。
- 全部正式文件使用项目根 `prettier.config.mjs`；格式化不得包含 `wxt.config.tmp.ts` 或任务临时文件。
- `npm run lint` 必须通过严格 TypeScript 未使用声明检查，`npm run format:check` 必须通过格式门禁。
