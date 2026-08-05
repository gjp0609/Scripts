import type {
  BookmarkExtra,
  BrowserBookmarkNode,
  ExportBookmarkNode,
  FullExportData,
  UiPreferences
} from '../types/bookmark';
import { createBookmark, getDefaultBookmarkRoot, getSubTree, getTree, removeBookmark, removeFolder } from './bookmarkApi';
import { remapImportedPreferences } from './backupModel';
import { getExtras, getPreferences, replaceExtras, savePreferences } from './extraStore';

type ImportData = {
  children: ExportBookmarkNode[];
  preferences: UiPreferences;
};

type CreatedNode = {
  id: string;
  folder: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeTitle(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return value.trim() || fallback;
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

  const title = normalizeTitle(value.title, '未命名');
  if (typeof value.url === 'string') {
    const url = value.url.trim();
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
  if (!isRecord(data) || data.version !== 2 || !isRecord(data.root) || !Array.isArray(data.root.children)) {
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

function matchesSourceNode(source: ExportBookmarkNode, target: BrowserBookmarkNode): boolean {
  if (source.url) return target.url === source.url && target.title === source.title;
  return !target.url && target.title === source.title;
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

export async function exportFullData(rootId: string, preferences: UiPreferences): Promise<FullExportData> {
  const [root, extras] = await Promise.all([getSubTree(rootId), getExtras()]);
  if (!root) throw new Error('未找到可导出的书签根目录');

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    root: {
      children: (root.children ?? []).map((child) => toExportNode(child, extras))
    },
    preferences
  };
}

export async function importFullData(parentId: string, data: FullExportData): Promise<void> {
  const parsed = validateFullImportData(data);
  const [tree, originalExtras, originalPreferences] = await Promise.all([getTree(), getExtras(), getPreferences()]);
  const root = findNodeById(tree, parentId) ?? getDefaultBookmarkRoot(tree);
  if (!root) throw new Error('未找到可导入的书签根目录');

  const idMap = new Map<string, string>();
  const createdNodes: CreatedNode[] = [];
  const nextExtras: Record<string, BookmarkExtra> = { ...originalExtras };

  async function restoreChildren(
    targetParentId: string,
    sources: ExportBookmarkNode[],
    targetChildren: BrowserBookmarkNode[]
  ): Promise<void> {
    const claimedTargetIds = new Set<string>();

    for (const source of sources) {
      let target = targetChildren.find((candidate) => !claimedTargetIds.has(candidate.id) && matchesSourceNode(source, candidate));

      if (!target) {
        target = await createBookmark({
          parentId: targetParentId,
          title: source.title,
          url: source.url
        });
        target.children = source.url ? undefined : [];
        targetChildren.push(target);
        createdNodes.push({ id: target.id, folder: !source.url });
      }

      claimedTargetIds.add(target.id);
      idMap.set(source.sourceId, target.id);

      if (source.url) {
        if (source.extra) {
          nextExtras[target.id] = {
            ...source.extra,
            bookmarkId: target.id,
            updatedAt: Date.now()
          };
        }
        continue;
      }

      await restoreChildren(target.id, source.children ?? [], target.children ?? (target.children = []));
    }
  }

  let storageChanged = false;
  try {
    await restoreChildren(root.id, parsed.children, root.children ?? (root.children = []));
    await replaceExtras(nextExtras);
    storageChanged = true;
    await savePreferences(remapImportedPreferences(parsed.preferences, idMap, originalPreferences));
  } catch (error) {
    if (storageChanged) {
      await replaceExtras(originalExtras).catch(() => undefined);
      await savePreferences(originalPreferences).catch(() => undefined);
    }
    await rollbackCreatedNodes(createdNodes);
    throw error;
  }
}
