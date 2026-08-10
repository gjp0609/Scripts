import { nextTick, ref, type Ref } from 'vue';
import type { FolderView } from '../types/bookmark';

export function useOrganizeMode(options: {
    folders: Ref<FolderView[]>;
    getScrollContainer: () => HTMLElement | undefined;
}) {
    const mode = ref<'browse' | 'organize'>('browse');
    const kind = ref<'bookmark' | 'folder'>('bookmark');
    const collapsedFolderIds = ref<Set<string>>(new Set());
    let restoreScrollY = 0;

    function enter() {
        restoreScrollY = options.getScrollContainer()?.scrollTop ?? window.scrollY;
        collapsedFolderIds.value = new Set();
        mode.value = 'organize';
    }

    function exit() {
        mode.value = 'browse';
        void nextTick(() => {
            const viewport = options.getScrollContainer();
            if (viewport) viewport.scrollTo({ top: restoreScrollY });
            else window.scrollTo({ top: restoreScrollY });
        });
    }

    function toggleFolder(folderId: string) {
        const next = new Set(collapsedFolderIds.value);
        if (next.has(folderId)) next.delete(folderId);
        else next.add(folderId);
        collapsedFolderIds.value = next;
    }

    function setKind(value: 'bookmark' | 'folder') {
        kind.value = value;
        collapsedFolderIds.value =
            value === 'folder' ? new Set(options.folders.value.map((folder) => folder.id)) : new Set();
    }

    function setAllCollapsed(collapsed: boolean) {
        collapsedFolderIds.value = collapsed ? new Set(options.folders.value.map((folder) => folder.id)) : new Set();
    }

    return { mode, kind, collapsedFolderIds, enter, exit, toggleFolder, setKind, setAllCollapsed };
}
