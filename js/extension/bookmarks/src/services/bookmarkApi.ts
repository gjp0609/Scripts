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

export type BookmarkChangedInfo = {
  title?: string;
  url?: string;
};

export type BookmarkRemovedInfo = {
  parentId?: string;
  index?: number;
  node?: BrowserBookmarkNode;
};

export type BookmarkMovedInfo = {
  parentId?: string;
  oldParentId?: string;
  index?: number;
  oldIndex?: number;
};

export type BookmarkEvent =
  | { type: 'created'; id: string; node: BrowserBookmarkNode }
  | { type: 'changed'; id: string; changes: BookmarkChangedInfo }
  | { type: 'removed'; id: string; removeInfo: BookmarkRemovedInfo }
  | { type: 'moved'; id: string; moveInfo: BookmarkMovedInfo };

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

export async function getNode(id: string): Promise<BrowserBookmarkNode | undefined> {
  const nodes = (await browser.bookmarks.get(id)) as BrowserBookmarkNode[];
  return nodes[0];
}

export async function getSubTree(id: string): Promise<BrowserBookmarkNode | undefined> {
  const nodes = (await browser.bookmarks.getSubTree(id)) as BrowserBookmarkNode[];
  return nodes[0];
}

export function getDefaultBookmarkRoot(tree: BrowserBookmarkNode[]): BrowserBookmarkNode | undefined {
  const rootChildren = tree[0]?.children ?? [];
  return (
    rootChildren.find((node) => node.id === '1') ??
    rootChildren.find((node) => /书签栏|收藏夹栏|bookmarks bar|favorites bar/i.test(node.title)) ??
    rootChildren.find((node) => Array.isArray(node.children))
  );
}

export function onBookmarkEvent(handler: (event: BookmarkEvent) => void): () => void {
  const createdListener = (id: string, node: BrowserBookmarkNode) => handler({ type: 'created', id, node });
  const changedListener = (id: string, changes: BookmarkChangedInfo) => handler({ type: 'changed', id, changes });
  const removedListener = (id: string, removeInfo: BookmarkRemovedInfo) => handler({ type: 'removed', id, removeInfo });
  const movedListener = (id: string, moveInfo: BookmarkMovedInfo) => handler({ type: 'moved', id, moveInfo });

  browser.bookmarks.onCreated.addListener(createdListener);
  browser.bookmarks.onChanged.addListener(changedListener);
  browser.bookmarks.onRemoved.addListener(removedListener);
  browser.bookmarks.onMoved.addListener(movedListener);

  return () => {
    browser.bookmarks.onCreated.removeListener(createdListener);
    browser.bookmarks.onChanged.removeListener(changedListener);
    browser.bookmarks.onRemoved.removeListener(removedListener);
    browser.bookmarks.onMoved.removeListener(movedListener);
  };
}
