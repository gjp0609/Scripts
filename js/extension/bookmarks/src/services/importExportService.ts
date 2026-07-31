import type { BookmarkExtra, BrowserBookmarkNode, FolderView, FullExportData, UiPreferences } from '../types/bookmark';
import { createBookmark, getDefaultBookmarkRoot, getTree } from './bookmarkApi';
import { getExtras, getPreferences, replaceExtras, savePreferences } from './extraStore';

type NormalizedImportFolder = {
  title: string;
  bookmarks: Array<{
    title: string;
    url: string;
    extra?: BookmarkExtra;
  }>;
};

type BookmarkSignatureInput = {
  folderTitle: string;
  title: string;
  url: string;
  tags?: string[];
  searchUrl?: string;
  description?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeTitle(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizeText(value: string | undefined): string {
  return value?.trim() ?? '';
}

function normalizeTags(tags?: string[]): string[] {
  return (tags ?? []).map((tag) => tag.trim()).filter(Boolean).sort((left, right) => left.localeCompare(right));
}

function buildBookmarkSignature(input: BookmarkSignatureInput): string {
  return JSON.stringify({
    folderTitle: normalizeText(input.folderTitle),
    title: normalizeText(input.title),
    url: normalizeText(input.url),
    tags: normalizeTags(input.tags),
    searchUrl: normalizeText(input.searchUrl),
    description: normalizeText(input.description)
  });
}

function normalizeBookmarkExtra(value: unknown): BookmarkExtra | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    bookmarkId: typeof value.bookmarkId === 'string' ? value.bookmarkId : '',
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    description: typeof value.description === 'string' ? value.description : undefined,
    searchUrl: typeof value.searchUrl === 'string' ? value.searchUrl : undefined,
    faviconOverride: typeof value.faviconOverride === 'string' ? value.faviconOverride : undefined,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now()
  };
}

function validateFullImportData(data: unknown): { folders: NormalizedImportFolder[]; preferences?: Partial<UiPreferences> } {
  if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.folders)) {
    throw new Error('全量导入文件格式无效');
  }

  const folders = data.folders.map((folderValue, folderIndex) => {
    if (!isRecord(folderValue) || !Array.isArray(folderValue.bookmarks)) {
      throw new Error(`第 ${folderIndex + 1} 个目录数据无效`);
    }

    const title = normalizeTitle(folderValue.title, '未命名目录');
    const bookmarks = folderValue.bookmarks.map((bookmarkValue, bookmarkIndex) => {
      if (!isRecord(bookmarkValue)) {
        throw new Error(`目录“${title}”中的第 ${bookmarkIndex + 1} 个书签数据无效`);
      }

      const bookmarkTitle = normalizeTitle(bookmarkValue.title, '未命名书签');
      if (typeof bookmarkValue.url !== 'string' || !bookmarkValue.url.trim()) {
        throw new Error(`目录“${title}”中的书签“${bookmarkTitle}”缺少有效 URL`);
      }

      return {
        title: bookmarkTitle,
        url: bookmarkValue.url.trim(),
        extra: normalizeBookmarkExtra(bookmarkValue.extra)
      };
    });

    return { title, bookmarks };
  });

  let preferences: Partial<UiPreferences> | undefined;
  if (isRecord(data.preferences)) {
    preferences = {};
    if (Array.isArray(data.preferences.collapsedFolderIds)) {
      preferences.collapsedFolderIds = data.preferences.collapsedFolderIds.filter((id): id is string => typeof id === 'string');
    }
    if (typeof data.preferences.searchEngine === 'string') {
      preferences.searchEngine = data.preferences.searchEngine;
    }
  }

  return { folders, preferences };
}

function findNodeById(nodes: BrowserBookmarkNode[], id: string): BrowserBookmarkNode | undefined {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }

    if (node.children?.length) {
      const found = findNodeById(node.children, id);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

export function exportFullData(folders: FolderView[], extras: Record<string, BookmarkExtra>, preferences: UiPreferences): FullExportData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    folders: folders.map((folder) => ({
      title: folder.title,
      index: folder.index,
      bookmarks: folder.bookmarks.map((bookmark) => ({
        title: bookmark.title,
        url: bookmark.url ?? '',
        index: bookmark.index,
        extra: bookmark.extra
      }))
    })),
    extras,
    preferences
  };
}

export async function importFullData(parentId: string, data: FullExportData): Promise<void> {
  const parsed = validateFullImportData(data);
  const tree = await getTree();
  const root = findNodeById(tree, parentId) ?? getDefaultBookmarkRoot(tree);

  if (!root) {
    throw new Error('未找到可导入的书签根目录');
  }

  const existingFolders = new Map<string, BrowserBookmarkNode>();
  (root.children ?? [])
    .filter((node) => !node.url)
    .forEach((folder) => {
      const title = normalizeTitle(folder.title, '未命名目录');
      if (!existingFolders.has(title)) {
        existingFolders.set(title, folder);
      }
    });

  const existingExtras = await getExtras();
  const nextExtras: Record<string, BookmarkExtra> = { ...existingExtras };
  const existingSignaturesByFolder = new Map<string, Set<string>>();

  for (const folderNode of root.children ?? []) {
    if (folderNode.url) {
      continue;
    }

    const folderTitle = normalizeTitle(folderNode.title, '未命名目录');
    const signatures = new Set<string>();
    for (const bookmarkNode of folderNode.children ?? []) {
      if (!bookmarkNode.url) {
        continue;
      }

      const extra = existingExtras[bookmarkNode.id];
      signatures.add(
        buildBookmarkSignature({
          folderTitle,
          title: bookmarkNode.title,
          url: bookmarkNode.url,
          tags: extra?.tags,
          searchUrl: extra?.searchUrl,
          description: extra?.description
        })
      );
    }
    existingSignaturesByFolder.set(folderTitle, signatures);
  }

  for (const folder of parsed.folders) {
    let targetFolder = existingFolders.get(folder.title);

    if (!targetFolder) {
      targetFolder = await createBookmark({ parentId: root.id, title: folder.title });
      existingFolders.set(folder.title, targetFolder);
    }

    const folderSignatures = existingSignaturesByFolder.get(folder.title) ?? new Set<string>();
    existingSignaturesByFolder.set(folder.title, folderSignatures);

    for (const bookmark of folder.bookmarks) {
      const signature = buildBookmarkSignature({
        folderTitle: folder.title,
        title: bookmark.title,
        url: bookmark.url,
        tags: bookmark.extra?.tags,
        searchUrl: bookmark.extra?.searchUrl,
        description: bookmark.extra?.description
      });

      if (folderSignatures.has(signature)) {
        continue;
      }

      const createdBookmark = await createBookmark({
        parentId: targetFolder.id,
        title: bookmark.title,
        url: bookmark.url
      });

      folderSignatures.add(signature);

      if (bookmark.extra) {
        nextExtras[createdBookmark.id] = {
          ...bookmark.extra,
          bookmarkId: createdBookmark.id,
          updatedAt: Date.now()
        };
      }
    }
  }

  await replaceExtras(nextExtras);

  if (parsed.preferences) {
    const currentPreferences = await getPreferences();
    await savePreferences({
      ...currentPreferences,
      ...parsed.preferences
    });
  }
}
