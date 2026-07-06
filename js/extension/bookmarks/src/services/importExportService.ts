import type { BookmarkExtra, FolderView, FullExportData, UiPreferences } from '../types/bookmark';
import { createBookmark } from './bookmarkApi';
import { replaceExtras, savePreferences } from './extraStore';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportNetscapeBookmarkHtml(folders: FolderView[]): string {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>'
  ];

  folders.forEach((folder) => {
    lines.push(`  <DT><H3>${escapeHtml(folder.title)}</H3>`);
    lines.push('  <DL><p>');
    folder.bookmarks.forEach((bookmark) => {
      lines.push(`    <DT><A HREF="${escapeHtml(bookmark.url ?? '')}">${escapeHtml(bookmark.title)}</A>`);
    });
    lines.push('  </DL><p>');
  });

  lines.push('</DL><p>');
  return lines.join('\n');
}

export function parseNetscapeBookmarkHtml(html: string): Array<{ title: string; bookmarks: Array<{ title: string; url: string }> }> {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const folders: Array<{ title: string; bookmarks: Array<{ title: string; url: string }> }> = [];

  document.querySelectorAll('h3').forEach((heading) => {
    const bookmarks: Array<{ title: string; url: string }> = [];
    let current = heading.parentElement?.nextElementSibling;
    while (current && current.tagName !== 'DL') {
      current = current.nextElementSibling;
    }
    current?.querySelectorAll('a[href]').forEach((anchor) => {
      bookmarks.push({
        title: anchor.textContent?.trim() || anchor.getAttribute('href') || '未命名书签',
        url: anchor.getAttribute('href') || ''
      });
    });
    folders.push({ title: heading.textContent?.trim() || '未命名目录', bookmarks });
  });

  return folders;
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

export async function importNetscapeBookmarkHtml(parentId: string, html: string): Promise<void> {
  const folders = parseNetscapeBookmarkHtml(html);
  for (const folder of folders) {
    const createdFolder = await createBookmark({ parentId, title: folder.title });
    for (const bookmark of folder.bookmarks) {
      await createBookmark({ parentId: createdFolder.id, title: bookmark.title, url: bookmark.url });
    }
  }
}

export async function importFullData(parentId: string, data: FullExportData): Promise<void> {
  const remappedExtras: Record<string, BookmarkExtra> = {};

  for (const folder of data.folders) {
    const createdFolder = await createBookmark({ parentId, title: folder.title, index: folder.index });
    for (const bookmark of folder.bookmarks) {
      const createdBookmark = await createBookmark({
        parentId: createdFolder.id,
        title: bookmark.title,
        url: bookmark.url,
        index: bookmark.index
      });

      if (bookmark.extra) {
        remappedExtras[createdBookmark.id] = {
          ...bookmark.extra,
          bookmarkId: createdBookmark.id,
          updatedAt: Date.now()
        };
      }
    }
  }

  await replaceExtras(remappedExtras);
  await savePreferences(data.preferences);
}

export function exportExtraData(extras: Record<string, BookmarkExtra>): string {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), extras }, null, 2);
}

export async function importExtraData(json: string): Promise<void> {
  const parsed = JSON.parse(json) as { extras?: Record<string, BookmarkExtra> };
  await replaceExtras(parsed.extras ?? {});
}
