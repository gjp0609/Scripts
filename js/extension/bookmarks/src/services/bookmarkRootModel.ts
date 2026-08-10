import type { BrowserBookmarkNode } from '../types/bookmark';

export function selectDefaultBookmarkRoot(tree: BrowserBookmarkNode[]): BrowserBookmarkNode | undefined {
    const rootChildren = tree[0]?.children ?? [];
    const typedBars = rootChildren.filter((node) => node.folderType === 'bookmarks-bar');
    if (typedBars.length) {
        return typedBars.find((node) => node.syncing) ?? typedBars.find((node) => node.id === '1') ?? typedBars[0];
    }
    return (
        rootChildren.find((node) => node.id === '1') ??
        rootChildren.find((node) => /书签栏|收藏夹栏|bookmarks bar|favorites bar/i.test(node.title)) ??
        rootChildren.find((node) => Array.isArray(node.children))
    );
}
