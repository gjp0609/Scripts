import type {
  BookmarkExtra,
  BrowserBookmarkNode,
  ExportBookmarkNode,
  ExportFolderNode,
  FullExportData,
  UiPreferences
} from '../types/bookmark';
import { createBookmark, getDefaultBookmarkRoot, getSubTree, getTree, moveNode, removeBookmark, removeFolder, updateBookmark } from './bookmarkApi';
import { isExportUrlNode, remapImportedPreferences, selectRestoreCandidate } from './backupModel';
import { getBackupOriginId, getExtras, getPreferences, replaceExtras, savePreferences } from './extraStore';

type ImportData = {
  children: ExportBookmarkNode[];
  preferences: UiPreferences;
  originId: string;
};

type CreatedNode = {
  id: string;
  folder: boolean;
};

type ChangedNode = {
  id: string;
  parentId?: string;
  index?: number;
  title: string;
  url?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeBookmarkExtra(value: unknown, sourceId: string): BookmarkExtra | undefined {
  if (!isRecord(value)) return undefined;

  return {
    bookmarkId: sourceId,
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    description: typeof value.description === 'string' ? value.description : undefined,
    searchUrl: typeof value.searchUrl === 'string' ? value.searchUrl : undefined,
    faviconOverride: typeof value.faviconOverride === 'string' ? value.faviconOverride : undefined,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now()
  };
}

function normalizeImportNode(value: unknown, path: string, sourceIds: Set<string>): ExportBookmarkNode {
  if (!isRecord(value)) throw new Error(`${path}数据无效`);

  if (typeof value.sourceId !== 'string' || !value.sourceId.trim()) {
    throw new Error(`${path}缺少源节点 ID`);
  }
  const sourceId = value.sourceId.trim();
  if (sourceIds.has(sourceId)) throw new Error(`${path}的源节点 ID 重复`);
  sourceIds.add(sourceId);

  if (typeof value.title !== 'string') throw new Error(`${path}缺少标题`);
  const title = value.title;
  if (typeof value.url === 'string') {
    const url = value.url;
    if (!url) throw new Error(`${path}“${title}”缺少有效 URL`);
    if (value.children !== undefined) throw new Error(`${path}“${title}”不能同时包含 URL 和子节点`);
    return {
      sourceId,
      title,
      url,
      extra: normalizeBookmarkExtra(value.extra, sourceId)
    };
  }

  if (!Array.isArray(value.children)) throw new Error(`${path}目录“${title}”缺少子节点数组`);
  return {
    sourceId,
    title,
    children: value.children.map((child, index) => normalizeImportNode(child, `${path}第 ${index + 1} 个节点`, sourceIds))
  };
}

function validateFullImportData(data: unknown): ImportData {
  if (!isRecord(data) || data.version !== 3 || typeof data.originId !== 'string' || !data.originId || !isRecord(data.root) || !Array.isArray(data.root.children)) {
    throw new Error('全量导入文件格式无效');
  }
  if (!isRecord(data.preferences)) throw new Error('全量导入文件缺少偏好数据');

  const collapsedFolderIds = data.preferences.collapsedFolderIds;
  const searchEngine = data.preferences.searchEngine;
  if (!Array.isArray(collapsedFolderIds) || !collapsedFolderIds.every((id) => typeof id === 'string')) {
    throw new Error('折叠目录偏好格式无效');
  }
  if (typeof searchEngine !== 'string') throw new Error('搜索引擎偏好格式无效');

  const sourceIds = new Set<string>();
  return {
    children: data.root.children.map((child, index) => normalizeImportNode(child, `根目录第 ${index + 1} 个节点`, sourceIds)),
    originId: data.originId,
    preferences: {
      collapsedFolderIds: [...collapsedFolderIds],
      searchEngine
    }
  };
}

function findNodeById(nodes: BrowserBookmarkNode[], id: string): BrowserBookmarkNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = node.children?.length ? findNodeById(node.children, id) : undefined;
    if (found) return found;
  }
  return undefined;
}

function toExportNode(node: BrowserBookmarkNode, extras: Record<string, BookmarkExtra>): ExportBookmarkNode {
  if (node.url) {
    return {
      sourceId: node.id,
      title: node.title,
      url: node.url,
      extra: extras[node.id]
    };
  }

  return {
    sourceId: node.id,
    title: node.title,
    children: (node.children ?? []).map((child) => toExportNode(child, extras))
  };
}

async function rollbackCreatedNodes(createdNodes: CreatedNode[]): Promise<void> {
  for (const node of [...createdNodes].reverse()) {
    try {
      if (node.folder) await removeFolder(node.id);
      else await removeBookmark(node.id);
    } catch {
      // A created child may already have been removed with its parent.
    }
  }
}

async function rollbackChangedNodes(changedNodes: ChangedNode[]): Promise<void> {
  for (const node of [...changedNodes].reverse()) {
    await updateBookmark(node.id, { title: node.title, ...(node.url ? { url: node.url } : {}) }).catch(() => undefined);
    if (node.parentId != null || node.index != null) {
      await moveNode(node.id, { parentId: node.parentId, index: node.index }).catch(() => undefined);
    }
  }
}

function indexNodes(nodes: BrowserBookmarkNode[], result = new Map<string, BrowserBookmarkNode>()): Map<string, BrowserBookmarkNode> {
  nodes.forEach((node) => {
    result.set(node.id, node);
    if (node.children) indexNodes(node.children, result);
  });
  return result;
}

function detachNode(nodes: BrowserBookmarkNode[], id: string): BrowserBookmarkNode | undefined {
  const index = nodes.findIndex((node) => node.id === id);
  if (index >= 0) return nodes.splice(index, 1)[0];
  for (const node of nodes) {
    const found = node.children ? detachNode(node.children, id) : undefined;
    if (found) return found;
  }
  return undefined;
}

export async function exportFullData(rootId: string, preferences: UiPreferences): Promise<FullExportData> {
  const [root, extras, originId] = await Promise.all([getSubTree(rootId), getExtras(), getBackupOriginId()]);
  if (!root) throw new Error('未找到可导出的书签根目录');

  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    originId,
    root: {
      children: (root.children ?? []).map((child) => toExportNode(child, extras))
    },
    preferences
  };
}

export async function importFullData(parentId: string, data: unknown): Promise<void> {
  const parsed = validateFullImportData(data);
  const [tree, originalExtras, originalPreferences, currentOriginId] = await Promise.all([
    getTree(),
    getExtras(),
    getPreferences(),
    getBackupOriginId()
  ]);
  const root = findNodeById(tree, parentId) ?? getDefaultBookmarkRoot(tree);
  if (!root) throw new Error('未找到可导入的书签根目录');

  const sameOrigin = parsed.originId === currentOriginId;
  const nodesById = indexNodes(tree);
  const idMap = new Map<string, string>();
  const claimedTargetIds = new Set<string>();
  const createdNodes: CreatedNode[] = [];
  const changedNodes = new Map<string, ChangedNode>();
  const nextExtras: Record<string, BookmarkExtra> = { ...originalExtras };

  async function restoreChildren(
    targetParentId: string,
    sources: ExportBookmarkNode[],
    targetChildren: BrowserBookmarkNode[]
  ): Promise<void> {
    for (const [targetIndex, source] of sources.entries()) {
      let target = selectRestoreCandidate(source, targetChildren, nodesById, claimedTargetIds, sameOrigin);

      if (!target) {
        target = await createBookmark({
          parentId: targetParentId,
          index: targetIndex,
          title: source.title,
          url: isExportUrlNode(source) ? source.url : undefined
        });
        target.children = isExportUrlNode(source) ? undefined : [];
        targetChildren.splice(targetIndex, 0, target);
        nodesById.set(target.id, target);
        createdNodes.push({ id: target.id, folder: !isExportUrlNode(source) });
      } else {
        if (!changedNodes.has(target.id)) {
          changedNodes.set(target.id, {
            id: target.id,
            parentId: target.parentId,
            index: target.index,
            title: target.title,
            url: target.url
          });
        }

        const nextUrl = isExportUrlNode(source) ? source.url : undefined;
        if (target.title !== source.title || target.url !== nextUrl) {
          await updateBookmark(target.id, { title: source.title, ...(nextUrl ? { url: nextUrl } : {}) });
          target.title = source.title;
          target.url = nextUrl;
        }

        const needsMove = target.parentId !== targetParentId || targetChildren[targetIndex]?.id !== target.id;
        if (needsMove) {
          await moveNode(target.id, { parentId: targetParentId, index: targetIndex });
          detachNode(tree, target.id);
          targetChildren.splice(targetIndex, 0, target);
        }
        target.parentId = targetParentId;
        target.index = targetIndex;
      }

      claimedTargetIds.add(target.id);
      idMap.set(source.sourceId, target.id);

      if (isExportUrlNode(source)) {
        if (sameOrigin && source.sourceId !== target.id) delete nextExtras[source.sourceId];
        if (source.extra) {
          nextExtras[target.id] = {
            ...source.extra,
            bookmarkId: target.id
          };
        } else {
          delete nextExtras[target.id];
        }
        continue;
      }

      await restoreChildren(target.id, (source as ExportFolderNode).children, target.children ?? (target.children = []));
    }
  }

  let storageChanged = false;
  try {
    await restoreChildren(root.id, parsed.children, root.children ?? (root.children = []));
    storageChanged = true;
    await replaceExtras(nextExtras);
    await savePreferences(remapImportedPreferences(parsed.preferences, idMap, originalPreferences));
  } catch (error) {
    if (storageChanged) {
      await replaceExtras(originalExtras).catch(() => undefined);
      await savePreferences(originalPreferences).catch(() => undefined);
    }
    await rollbackChangedNodes([...changedNodes.values()]);
    await rollbackCreatedNodes(createdNodes);
    throw error;
  }
}
