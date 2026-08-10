import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import type { BrowserBookmarkNode } from '../types/bookmark';
import { removeExtrasWithRetry } from '../services/extraStore';

function collectBookmarkIds(node?: BrowserBookmarkNode): string[] {
    if (!node) return [];
    return [...(node.url ? [node.id] : []), ...(node.children ?? []).flatMap(collectBookmarkIds)];
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
        void removeExtrasWithRetry(bookmarkIds.length ? bookmarkIds : [id]).catch((error) => {
            console.error('[MarkHub] 删除书签后的附加数据清理失败', error);
        });
    });
});
