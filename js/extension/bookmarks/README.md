# Bookmarks Workbench

书签工作台重写原型。当前阶段先用 `Vite + Vue 3 + TypeScript` 实现高频书签入口和整理交互，不接入浏览器书签 API。

## 本地预览

```powershell
npm install
npm run build
```

构建后可通过本机 Everything HTTP 服务预览：

```text
http://127.0.0.1:34567/R%3A/Files/Workspace/Mine/Scripts/js/extension/bookmarks/dist/index.html
```

开发调试可临时使用：

```powershell
npm run dev -- --port 34567
```

如果 `34567` 已被 Everything 占用，Vite 会自动切到其他端口；最终静态预览仍以 `dist/index.html` 为准。

## 当前状态

- UI 使用 Element Plus。
- 拖拽使用 `vue-draggable-plus` / SortableJS。
- 瀑布流使用 Macy。
- 当前数据来自 `src/data/mock-bookmarks.json` 和 localStorage。
- 需求、约束、进度记录在 `REWRITE.md`。
