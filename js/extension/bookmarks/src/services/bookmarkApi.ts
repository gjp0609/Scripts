import { browser } from 'wxt/browser';
import type { BrowserBookmarkNode } from '../types/bookmark';

export type BookmarkCreateDetails = {
  parentId?: string;
  index?: number;
  title?: string;
  url?: string;
};

export type BookmarkUpdateChanges = {
  title?: string;
  url?: string;
};

export type BookmarkMoveDestination = {
  parentId?: string;
  index?: number;
};

export async function getTree(): Promise<BrowserBookmarkNode[]> {
  return browser.bookmarks.getTree() as Promise<BrowserBookmarkNode[]>;
}

export async function createBookmark(input: BookmarkCreateDetails): Promise<BrowserBookmarkNode> {
  return browser.bookmarks.create(input) as Promise<BrowserBookmarkNode>;
}

export async function updateBookmark(id: string, changes: BookmarkUpdateChanges): Promise<BrowserBookmarkNode> {
  return browser.bookmarks.update(id, changes) as Promise<BrowserBookmarkNode>;
}

export async function removeBookmark(id: string): Promise<void> {
  await browser.bookmarks.remove(id);
}

export async function removeFolder(id: string): Promise<void> {
  await browser.bookmarks.removeTree(id);
}

export async function moveNode(id: string, destination: BookmarkMoveDestination): Promise<BrowserBookmarkNode> {
  return browser.bookmarks.move(id, destination) as Promise<BrowserBookmarkNode>;
}

export function getDefaultBookmarkRoot(tree: BrowserBookmarkNode[]): BrowserBookmarkNode | undefined {
  const rootChildren = tree[0]?.children ?? [];
  return (
    rootChildren.find((node) => node.id === '1') ??
    rootChildren.find((node) => /书签栏|收藏夹栏|bookmarks bar|favorites bar/i.test(node.title)) ??
    rootChildren.find((node) => Array.isArray(node.children))
  );
}

export function onAnyBookmarkChanged(handler: () => void): () => void {
  const listeners: Array<[{ addListener: (listener: () => void) => void; removeListener: (listener: () => void) => void }, () => void]> = [
    [browser.bookmarks.onCreated, handler],
    [browser.bookmarks.onChanged, handler],
    [browser.bookmarks.onRemoved, handler],
    [browser.bookmarks.onMoved, handler]
  ];

  listeners.forEach(([event, listener]) => event.addListener(listener));
  return () => listeners.forEach(([event, listener]) => event.removeListener(listener));
}
