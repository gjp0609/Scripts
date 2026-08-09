# 书签插件开发状态

## 当前快照

- 已提交基线：`28ec5f7 完善书签备份恢复与页面协调器`。
- 当前批次：收口 Chrome 书签 API 事件、根目录识别、导入补偿校验和扩展数据维护。
- 浏览模式：保持 Pages 单页面的 Macy 最短列布局、48px 内容网格和 24px 目录间距，是最高优先级回归边界。
- 测试页面：WXT 唯一监听 `http://localhost:3000`，扩展页加载 25 个真实目录。
- 用户验收：自动回归通过不代表视觉确认完成，最终仍由用户统一测试。

## 已完成能力

### 数据与备份

- 浏览器书签 API 是目录、书签、归属和顺序的唯一主数据。
- extra 使用每书签独立 storage key，搜索引擎和折叠目录按字段独立保存。
- v3 备份递归导出完整书签栏树、extra 和必要偏好。
- 恢复映射按 `originId + sourceId` 独立持久化；删除原节点后连续导入同一备份不会重复创建。
- 导入只 patch 备份涉及的 extra，不覆盖书签栏外或其他页面刚写入的无关 extra。
- `unlimitedStorage` 覆盖长期 extra 与恢复映射容量；设置中可手动校验并清理孤立 extra、失效映射和无效偏好，不删除浏览器书签。
- 导入失败逐项记录补偿结果，并重新读取书签栏子树校验；补偿不完整时明确要求刷新检查。
- Chrome 134+ 使用 `folderType/syncing` 识别同步书签栏，浏览器原生排序通过 `onChildrenReordered` 自动重载。
- CRUD 保存具有补偿恢复，编辑保留 `faviconOverride`；Popup、CRUD 和删除具有 pending 防重复提交。

### 搜索与交互

- 普通搜索只过滤书签部分；`#` tag 和 `!` 站点搜索使用互斥搜索下拉。
- 引擎菜单 selected、active 和 hover 共用状态，普通搜索上下键切换引擎。
- 全局直接输入、IME、Esc 分层回退、鼠标退出和模态焦点路径已统一。
- 固定结构使用边框，激活浮层使用阴影，主页面与 Popup 共用视觉令牌。

### 整理模式

- 浏览、整理模式-书签、整理模式-目录使用三个独立画布。
- 书签整理使用保序 Macy、动态投放目标和完整顺序写回。
- 目录整理使用等高 Grid、唯一预测槽和浏览器根 children 绝对索引。
- 整理写回串行执行，写回期间停用新拖拽；失败重新加载真实树并恢复临时折叠状态。

### 代码边界

- `useSearchState`：查询解析、候选和引擎状态。
- `useSearchCommands`：搜索键盘命令与结果执行。
- `useBookmarkKeyboard`：全局直接输入和 Esc 回退。
- `useSearchOverlayPosition`：搜索浮层几何与监听器生命周期。
- `useBookmarkWorkspace`：工作区数据、浏览偏好和外部书签事件。
- `useBookmarkCrud`、`useImportExport`：表单与备份用例。
- `useOrganizeMode`、`useOrganizeMove`、`useOrganizeDrag`：整理状态、写回和拖拽会话。
- `App.vue` 只组合页面用例、计算当前画布投影并绑定组件事件，不直接调用书签仓储。

## 当前验证

- 27 项逻辑测试通过。
- `npm run typecheck` 通过。
- `npm run build` 通过。
- 隔离 Chromium 主流程回归通过：浏览保护、普通/`#` 搜索、引擎、Esc、模态、两种整理画布、拖拽、编辑和删除，控制台错误为 0。
- 隔离 Chromium 数据回归通过：外部有内容目录移入、根直属与深层导出、Chrome ID 重映射、连续导入不重复、无关 extra 保留，控制台错误为 0。
- 隔离 Chromium API 维护回归通过：`unlimitedStorage`、维护前后书签树不变、孤立数据清理、有效映射保留、后台删除清理及导入补偿二次失败提示均正确。
- WXT 真实数据页面加载 25 个目录，脚本均来自唯一 3000 服务。

## 剩余边界

- Bookmarklet 已在主世界执行并正确反馈失败，但严格页面 CSP 仍可能禁止动态代码，这是浏览器能力边界。
- 用户仍需统一确认 Pages 风格、真实 favicon、目录网格、搜索和拖拽手感。
- 临时 WXT 配置、回归脚本、日志、截图和 profile 不属于项目交付内容，始终排除在提交之外。
