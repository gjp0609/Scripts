# 书签插件架构规范

目标不是把现有大文件继续拆成更多文件，而是让数据、状态、布局和副作用各自只有一个职责。重构必须按边界迁移，禁止先复制旧逻辑再用条件拼接。

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
- `extraStore`：只读写插件 extra 和偏好。
- `extensionRuntime`：只处理 tabs、popup 和扩展运行时能力。
- `favicon`：只负责浏览器缓存 URL、候选降级、去重和刷新 token。

### 1.2 数据层

- `bookmarkRepository`：加载浏览器树，合成 `BookmarkView`，执行 CRUD 和移动写回。
- 数据层不得知道 Macy、Sortable、Vue ref、DOM class 或浮层状态。
- 数据层所有移动函数接受明确的领域输入，返回真实浏览器节点或失败，不通过全局数组副作用传递结果。

### 1.3 领域层

- `searchService`：纯函数解析普通、`#`、`!` 查询，引擎和 tag 候选，构造安全 URL。
- `layout/`：维护三种画布的布局生命周期，不拥有书签数据写回。
- `organize/`：维护完整顺序、可见锚点、预测落点和撤销快照的纯函数。
- `interaction/`：维护顶层模式、浮层互斥和 Esc 回退顺序。
- `organize/filtering`：分别定义整理模式-书签的书签字段过滤和整理模式-目录的目录标题过滤。

领域层应尽可能无 DOM、无计时器、可单元测试。

### 1.4 页面协调层

页面协调器只负责组合用例和把状态传给组件：

- `useBookmarkPage`：加载、刷新、页面错误和全局生命周期。
- `useSearchState`：唯一 query、解析状态、active 索引和浮层互斥。
- `useBrowseMode`：浏览折叠偏好、浏览画布和工具命令。
- `useOrganizeMode`：整理顶层状态、子模式切换、临时折叠和撤销。
- `useBookmarkCrud`：添加、编辑、删除和错误上下文。
- `useImportExport`：导入导出忙碌、文件校验和结果。

当前 `App.vue` 的职责必须逐步迁移到以上协调器；迁移期间不允许继续增加业务分支。

## 2. 三种画布必须隔离

| 画布 | 布局 | 拖拽 | 折叠状态 | 约束 |
| --- | --- | --- | --- | --- |
| 浏览模式 | Macy，`trueOrder: false` | 无 | 持久浏览偏好 | 只优化视觉扫描 |
| 整理模式-书签 | 独立 Macy，`trueOrder: true` | 书签 Sortable | 临时整理状态 | 支持真实投放区和跨目录 |
| 整理模式-目录 | 正常流 CSS Grid | 目录 Sortable | 无展开状态 | 仅标题、等高、唯一预测槽 |

- 三者共享只读数据投影，不共享布局实例、拖拽实例或临时折叠集合。
- 切换画布必须先销毁旧实例，再挂载新实例；不能在同一实例上不断切换 flags。
- 任何画布状态不能通过 DOM class 反向推导领域状态。

## 3. 组件边界

建议目标树：

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
- `pendingMove`、撤销快照和写回忙碌属于整理用例；不能通过按钮 class 表达。
- 浮层互斥属于页面交互协调器；组件只能请求打开/关闭。
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

每个布局适配器必须实现统一接口：

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

外部书签事件与本地乐观移动必须通过 repository 协调：写回请求带操作令牌或快照版本，重复事件只确认结果，不得覆盖更新中的本地预测。

## 6. 拖拽落点算法

拖拽计算拆为纯函数：

1. `getVisibleOrder`：读取当前画布中可见 ID。
2. `resolveDropAnchor`：根据前后可见项确定语义锚点。
3. `mapAnchorToFullOrder`：映射完整父级数组，保留不可见项相对顺序。
4. `toBrowserIndex`：转换为 Chrome API 的绝对索引。
5. `applyOptimisticMove`：只更新视图投影。
6. `rollbackMove`：失败时恢复快照。

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
