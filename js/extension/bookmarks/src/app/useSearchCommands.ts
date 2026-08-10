import { nextTick, ref, type Ref } from 'vue';
import type { BookmarkView, QuickSearchTarget, TagSummary } from '../types/bookmark';
import { buildQuickSearchUrl, buildSearchEngineUrl } from '../services/searchService';
import { openUrl } from '../services/extensionRuntime';
import { normalizeSearchIndex } from './searchStateModel';
import type { useSearchState } from './useSearchState';

type SearchState = ReturnType<typeof useSearchState>;

export function useSearchCommands(options: { search: SearchState; mode: Ref<'browse' | 'organize'> }) {
    const searchInputElement = ref<HTMLInputElement>();
    const error = ref('');

    async function runOpenUrl(url: string) {
        error.value = '';
        try {
            await openUrl(url);
        } catch (cause) {
            error.value = cause instanceof Error ? cause.message : '打开页面失败';
        }
    }

    function setSearchInputElement(element: HTMLInputElement) {
        searchInputElement.value = element;
    }

    function handleEngineKeydown(event: KeyboardEvent) {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
        event.preventDefault();
        if (!options.search.engineOptions.value.length) return;
        if (event.key === 'Enter') {
            void options.search.selectEngineAt(options.search.activeEngineIndex.value);
            return;
        }
        options.search.moveActiveEngine(event.key === 'ArrowDown' ? 1 : -1);
    }

    function openBookmark(bookmark: BookmarkView) {
        if (options.mode.value === 'browse' && bookmark.url) void runOpenUrl(bookmark.url);
    }

    function openQuickSearch(target: QuickSearchTarget) {
        const keyword = options.search.quickSearch.value?.keyword ?? '';
        if (!keyword) return;
        const url = buildQuickSearchUrl(target, keyword, options.search.currentEngine.value);
        if (url) void runOpenUrl(url);
    }

    function selectTag(tag: TagSummary) {
        options.search.selectTag(tag.name);
        void nextTick(() => {
            searchInputElement.value?.focus();
            options.search.overlaySuppressed.value = true;
        });
    }

    function handleSearchKeydown(event: KeyboardEvent) {
        const quickSearch = options.search.quickSearch.value;
        const tagSearch = options.search.tagSearch.value;

        if (!quickSearch && !tagSearch && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            if (!options.search.engineOptions.value.length) return;
            void options.search.moveSelectedEngine(event.key === 'ArrowDown' ? 1 : -1);
            return;
        }

        if (quickSearch) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                options.search.activeQuickIndex.value = normalizeSearchIndex(
                    options.search.activeQuickIndex.value + (event.key === 'ArrowDown' ? 1 : -1),
                    options.search.quickTargets.value.length,
                );
            } else if (event.key === 'Enter') {
                event.preventDefault();
                const target = options.search.quickTargets.value[options.search.activeQuickIndex.value];
                if (target && quickSearch.hasKeyword) openQuickSearch(target);
            }
            return;
        }

        if (tagSearch) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                options.search.activeTagIndex.value = normalizeSearchIndex(
                    options.search.activeTagIndex.value + (event.key === 'ArrowDown' ? 1 : -1),
                    tagSearch.matches.length,
                );
            } else if (event.key === 'Enter') {
                event.preventDefault();
                const tag = tagSearch.matches[options.search.activeTagIndex.value];
                if (tag) selectTag(tag);
            }
            return;
        }

        if (event.key === 'Enter' && options.search.query.value.trim()) {
            event.preventDefault();
            void runOpenUrl(
                buildSearchEngineUrl(options.search.currentEngine.value, options.search.query.value.trim()),
            );
        }
    }

    return {
        searchInputElement,
        error,
        setSearchInputElement,
        handleEngineKeydown,
        handleSearchKeydown,
        openBookmark,
        openQuickSearch,
        selectTag,
    };
}
