import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import type { BrowserBookmarkNode } from '../types/bookmark';
import { removeExtras } from '../services/extraStore';

function collectBookmarkIds(node?: BrowserBookmarkNode): string[] {
  if (!node) return [];
  return [
    ...(node.url ? [node.id] : []),
    ...(node.children ?? []).flatMap(collectBookmarkIds)
  ];
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void browser.storage.local.get('markhubInstalledAt').then((result) => {
      if (!result.markhubInstalledAt) {
        void browser.storage.local.set({ markhubInstalledAt: Date.now() });
      }
    });
  });

  browser.bookmarks.onRemoved.addListener((id, removeInfo) => {
    const bookmarkIds = collectBookmarkIds(removeInfo.node as BrowserBookmarkNode | undefined);
    void removeExtras(bookmarkIds.length ? bookmarkIds : [id]);
  });
});
