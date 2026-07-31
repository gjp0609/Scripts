import { computed, ref, watch, type Ref } from 'vue';
import type { FolderView } from '../types/bookmark';
import {
  getQuickSearchTargets,
  getSearchEngineOptions,
  getTagSummaries,
  parseQuickSearch,
  parseTagSearch,
  resolveSearchEngine
} from '../services/searchService';
import { nextSelectedEngineIndex, normalizeSearchIndex } from './searchStateModel';

type SearchStateOptions = {
  folders: Ref<FolderView[]>;
  selectedEngineId: Ref<string>;
  setSearchEngine: (engineId: string) => Promise<void>;
};

export function useSearchState(options: SearchStateOptions) {
  const query = ref('');
  const overlaySuppressed = ref(false);
  const engineMenuActive = ref(false);
  const activeQuickIndex = ref(0);
  const activeTagIndex = ref(0);
  const activeEngineIndex = ref(0);

  const tagSummaries = computed(() => getTagSummaries(options.folders.value));
  const quickSearch = computed(() => parseQuickSearch(query.value));
  const tagSearch = computed(() => parseTagSearch(query.value, tagSummaries.value));
  const engineOptions = computed(() => getSearchEngineOptions(options.folders.value));
  const currentEngine = computed(() => resolveSearchEngine(engineOptions.value, options.selectedEngineId.value));
  const quickTargets = computed(() => getQuickSearchTargets(options.folders.value, quickSearch.value?.siteQuery ?? ''));
  const normalSearch = computed(() => !quickSearch.value && !tagSearch.value && Boolean(query.value.trim()));
  const showOverlay = computed(() => Boolean(quickSearch.value || tagSearch.value) && !overlaySuppressed.value && !engineMenuActive.value);

  function updateQuery(value: string) {
    query.value = value;
    overlaySuppressed.value = false;
    activeQuickIndex.value = 0;
    activeTagIndex.value = 0;
  }

  function selectTag(name: string) {
    query.value = `#${name}`;
    overlaySuppressed.value = true;
    activeTagIndex.value = 0;
  }

  function syncEngineActive(index: number) {
    activeEngineIndex.value = normalizeSearchIndex(index, engineOptions.value.length);
  }

  async function selectEngineAt(index: number) {
    const normalized = normalizeSearchIndex(index, engineOptions.value.length);
    const engine = engineOptions.value[normalized];
    if (!engine) return;
    activeEngineIndex.value = normalized;
    await options.setSearchEngine(engine.id);
  }

  async function moveSelectedEngine(offset: number) {
    const selectedIndex = engineOptions.value.findIndex((engine) => engine.id === currentEngine.value.id);
    await selectEngineAt(nextSelectedEngineIndex(selectedIndex, offset, engineOptions.value.length));
  }

  function moveActiveEngine(offset: number) {
    activeEngineIndex.value = normalizeSearchIndex(activeEngineIndex.value + offset, engineOptions.value.length);
  }

  watch([quickTargets, () => tagSearch.value?.matches, engineOptions], () => {
    activeQuickIndex.value = normalizeSearchIndex(activeQuickIndex.value, quickTargets.value.length);
    activeTagIndex.value = normalizeSearchIndex(activeTagIndex.value, tagSearch.value?.matches.length ?? 0);
    activeEngineIndex.value = normalizeSearchIndex(activeEngineIndex.value, engineOptions.value.length);
  });

  return {
    query,
    overlaySuppressed,
    engineMenuActive,
    activeQuickIndex,
    activeTagIndex,
    activeEngineIndex,
    tagSummaries,
    quickSearch,
    tagSearch,
    engineOptions,
    currentEngine,
    quickTargets,
    normalSearch,
    showOverlay,
    updateQuery,
    selectTag,
    syncEngineActive,
    selectEngineAt,
    moveSelectedEngine,
    moveActiveEngine
  };
}
