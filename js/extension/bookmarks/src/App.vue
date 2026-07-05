<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue';
import Macy from 'macy';
import { useMagicKeys, whenever } from '@vueuse/core';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Close,
  CopyDocument,
  Delete,
  Edit,
  Folder,
  Grid,
  Menu,
  Plus,
  RefreshLeft,
  Search,
  Setting,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { InputInstance } from 'element-plus';
import { VueDraggable } from 'vue-draggable-plus';
import rawBookmarks from './data/mock-bookmarks.json';
import type { BookmarkGroup, BookmarkItem, FilterState, OrganizeMode } from './types';

type RawGroup = {
  id?: unknown;
  title?: unknown;
  collapsed?: unknown;
  items?: Array<{
    id?: unknown;
    title?: unknown;
    url?: unknown;
    favicon?: unknown;
    tags?: unknown;
    description?: unknown;
  }>;
};

type BookmarkForm = {
  title: string;
  url: string;
  tags: string;
  description: string;
};

const STORAGE_KEY = 'bookmarks-workbench-state-v1';
const defaultEngine = {
  id: 'google',
  name: 'Google',
  url: 'https://www.google.com/search?q={keyword}',
};

const searchText = ref('');
const mode = ref<'browse' | 'organize'>('browse');
const organizeMode = ref<OrganizeMode>('bookmark');
const filter = ref<FilterState>({ type: 'all' });
const selectedIndex = ref(-1);
const selectedEngine = ref(defaultEngine.id);
const editingVisible = ref(false);
const editingType = ref<'bookmark' | 'folder'>('bookmark');
const editingGroupId = ref('');
const editingBookmarkId = ref('');
const form = ref<BookmarkForm>({ title: '', url: '', tags: '', description: '' });
const folderTitle = ref('');
const searchInputRef = ref<InputInstance>();
const boardRef = ref<HTMLElement>();
const macy = ref<ReturnType<typeof Macy> | null>(null);
const undoStack = ref<Array<{ label: string; groups: BookmarkGroup[] }>>([]);
const suppressPersistence = ref(false);
let reflowFrame = 0;
let reflowTimer = 0;
let dragSnapshot: { label: string; groups: BookmarkGroup[]; signature: string } | null = null;
let folderCollapsedBeforeDrag: Map<string, boolean> | null = null;

const engines = [
  defaultEngine,
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q={keyword}' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/search?q={keyword}' },
];

const groups = ref<BookmarkGroup[]>(loadGroups());

const totalCount = computed(() => groups.value.reduce((sum, group) => sum + group.items.length, 0));
const recentIds = computed(() => new Set(flatBookmarks.value.slice(-12).map(({ item }) => item.id)));
const flatBookmarks = computed(() =>
  groups.value.flatMap((group) => group.items.map((item) => ({ group, item }))),
);
const tagCounts = computed(() => {
  const counts = new Map<string, number>();
  groups.value.forEach((group) => {
    group.items.forEach((item) => {
      item.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
    });
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
});
const query = computed(() => {
  const value = searchText.value.trim().toLowerCase();
  return value.startsWith('!') || value.startsWith('！') ? '' : value;
});
const isQuickSearch = computed(() => {
  const value = searchText.value.trim();
  return value.startsWith('!') || value.startsWith('！');
});
const quickKeyword = computed(() => searchText.value.trim().slice(1).trim());
const visibleGroups = computed(() => {
  return groups.value
    .map((group) => {
      const titleMatches = Boolean(query.value) && group.title.toLowerCase().includes(query.value);
      return {
        group,
        items: group.items.filter((item) => (titleMatches ? itemMatchesFilter(item) : itemMatches(item))),
      };
    })
    .filter(({ items }) => items.length > 0);
});
const boardGroups = computed(() => (
  mode.value === 'organize'
    ? groups.value.map((group) => ({ group, items: group.items }))
    : visibleGroups.value
));
const quickSearchItems = computed(() =>
  flatBookmarks.value
    .filter(({ item }) => item.tags.includes('search') || item.url.includes('{keyword}') || item.url.includes('${keyword}'))
    .slice(0, 8),
);
const selectedItems = computed(() => (isQuickSearch.value ? quickSearchItems.value : visibleGroups.value.flatMap(({ group, items }) => items.map((item) => ({ group, item })))));
const currentSelection = computed(() => (selectedIndex.value >= 0 ? selectedItems.value[selectedIndex.value] : undefined));

function normalize(raw: unknown): BookmarkGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((group, groupIndex) => {
    const candidate = group as RawGroup;
    const rawItems = Array.isArray(candidate.items) ? candidate.items : [];
    return {
      id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `folder-${groupIndex}-${slug(String(candidate.title || 'folder'))}`,
      title: String(candidate.title || '未命名目录'),
      collapsed: Boolean(candidate.collapsed),
      items: rawItems.map((item, itemIndex) => ({
        id: typeof item.id === 'string' && item.id ? item.id : `bookmark-${groupIndex}-${itemIndex}-${slug(String(item.title || item.url || 'bookmark'))}`,
        title: String(item.title || item.url || '未命名书签'),
        url: String(item.url || ''),
        favicon: String(item.favicon || ''),
        tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
        description: String(item.description || ''),
      })),
    };
  });
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').slice(0, 28);
}

function loadGroups() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return normalize(parsed);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  return normalize(rawBookmarks as unknown as RawGroup[]);
}

function saveGroups() {
  if (suppressPersistence.value) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups.value));
}

function cloneGroups() {
  return structuredClone(toRaw(groups.value));
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
}

function focusSearch() {
  nextTick(() => searchInputRef.value?.focus());
}

function itemMatches(item: BookmarkItem) {
  if (!itemMatchesFilter(item)) return false;
  if (!query.value) return true;
  return `${item.title} ${item.url} ${item.tags.join(' ')} ${item.description || ''}`.toLowerCase().includes(query.value);
}

function itemMatchesFilter(item: BookmarkItem) {
  if (filter.value.type === 'tag' && !item.tags.includes(filter.value.tag)) return false;
  if (filter.value.type === 'recent' && !recentIds.value.has(item.id)) return false;
  return true;
}

function reflow() {
  nextTick(() => {
    cancelAnimationFrame(reflowFrame);
    window.clearTimeout(reflowTimer);
    reflowFrame = requestAnimationFrame(() => {
      reflowFrame = requestAnimationFrame(() => {
        if (mode.value !== 'browse' || !boardRef.value || window.innerWidth <= 900) {
          destroyMacy();
          return;
        }
        if (!macy.value) {
          macy.value = Macy({
            container: boardRef.value,
            trueOrder: true,
            waitForImages: false,
            margin: { x: 16, y: 16 },
            columns: 5,
            useContainerForBreakpoints: true,
            breakAt: {
              1940: 4,
              1520: 3,
              1060: 2,
              760: 1,
            },
          });
        }
        macy.value.recalculate(true, true);
        reflowTimer = window.setTimeout(() => macy.value?.recalculate(true, true), 120);
      });
    });
  });
}

function destroyMacy() {
  cancelAnimationFrame(reflowFrame);
  window.clearTimeout(reflowTimer);
  if (!macy.value) return;
  macy.value.remove();
  macy.value = null;
  boardRef.value?.querySelectorAll<HTMLElement>('.group-card').forEach((card) => {
    card.style.position = '';
    card.style.left = '';
    card.style.top = '';
    card.style.width = '';
  });
}

function snapshot(label: string) {
  undoStack.value.push({ label, groups: cloneGroups() });
  if (undoStack.value.length > 10) undoStack.value.shift();
}

function beginDragSnapshot(label: string) {
  dragSnapshot = { label, groups: cloneGroups(), signature: orderSignature() };
}

function completeDragSnapshot() {
  if (!dragSnapshot) return;
  if (dragSnapshot.signature !== orderSignature()) {
    undoStack.value.push({ label: dragSnapshot.label, groups: dragSnapshot.groups });
    if (undoStack.value.length > 10) undoStack.value.shift();
  }
  dragSnapshot = null;
}

function orderSignature() {
  return groups.value.map((group) => `${group.id}:${group.items.map((item) => item.id).join(',')}`).join('|');
}

function undo() {
  const last = undoStack.value.pop();
  if (!last) return;
  groups.value = last.groups;
  saveGroups();
  ElMessage.success(`已撤销：${last.label}`);
  reflow();
}

function setFilter(next: FilterState) {
  filter.value = next;
  selectedIndex.value = 0;
  reflow();
}

function setMode(next: 'browse' | 'organize') {
  mode.value = next;
  if (next === 'browse') {
    reflow();
  } else {
    destroyMacy();
  }
}

function setOrganizeMode(next: OrganizeMode) {
  organizeMode.value = next;
  destroyMacy();
}

function collapseAll(value: boolean) {
  groups.value.forEach((group) => {
    group.collapsed = value;
  });
  saveGroups();
  reflow();
}

function toggleGroup(group: BookmarkGroup) {
  if (mode.value === 'organize' && organizeMode.value === 'folder') return;
  group.collapsed = !group.collapsed;
  saveGroups();
  reflow();
}

function favicon(item: BookmarkItem) {
  if (item.favicon) return item.favicon;
  try {
    const url = new URL(item.url);
    if (url.protocol === 'http:' || url.protocol === 'https:') return `${url.origin}/favicon.ico`;
  } catch {
    return '';
  }
  return '';
}

function normalizeUrl(url: string) {
  const value = url.trim();
  if (!value) return '';
  if (/^javascript:/i.test(value)) {
    ElMessage.warning('原型不执行 bookmarklet');
    return '';
  }
  return /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
}

function openUrl(url: string) {
  const normalized = normalizeUrl(url);
  if (!normalized) return;
  window.open(normalized, '_blank', 'noopener');
}

function openBookmarkClick(url: string, event: MouseEvent) {
  if (mode.value !== 'browse' || event.detail > 1) return;
  openUrl(url);
}

function openSearch(keyword: string) {
  const engine = engines.find((item) => item.id === selectedEngine.value) || defaultEngine;
  openUrl(engine.url.replace('{keyword}', encodeURIComponent(keyword)));
}

function openSelected(forceEngine = false) {
  const value = searchText.value.trim();
  if (forceEngine && value) {
    openSearch(isQuickSearch.value ? quickKeyword.value : value);
    return;
  }

  const selected = currentSelection.value;
  if (selected && (isQuickSearch.value || selectedIndex.value >= 0)) {
    const url = isQuickSearch.value
      ? selected.item.url.replace('{keyword}', encodeURIComponent(quickKeyword.value)).replace('${keyword}', encodeURIComponent(quickKeyword.value))
      : selected.item.url;
    openUrl(url);
    return;
  }

  if (value) openSearch(isQuickSearch.value ? quickKeyword.value : value);
}

function copyUrl(item: BookmarkItem) {
  if (!navigator.clipboard?.writeText) {
    ElMessage.info(item.url);
    return;
  }
  navigator.clipboard.writeText(item.url).then(
    () => ElMessage.success('已复制 URL'),
    () => ElMessage.info(item.url),
  );
}

function beginAddBookmark(group?: BookmarkGroup) {
  editingType.value = 'bookmark';
  editingGroupId.value = group?.id || groups.value[0]?.id || '';
  editingBookmarkId.value = '';
  form.value = { title: '', url: '', tags: '', description: '' };
  editingVisible.value = true;
}

function beginEditBookmark(group: BookmarkGroup, item: BookmarkItem) {
  editingType.value = 'bookmark';
  editingGroupId.value = group.id;
  editingBookmarkId.value = item.id;
  form.value = {
    title: item.title,
    url: item.url,
    tags: item.tags.join(', '),
    description: item.description || '',
  };
  editingVisible.value = true;
}

function findBookmarkOwner(bookmarkId: string) {
  return groups.value.find((group) => group.items.some((item) => item.id === bookmarkId));
}

function beginAddFolder() {
  editingType.value = 'folder';
  editingGroupId.value = '';
  editingBookmarkId.value = '';
  folderTitle.value = '';
  editingVisible.value = true;
}

function beginEditFolder(group: BookmarkGroup) {
  editingType.value = 'folder';
  editingGroupId.value = group.id;
  folderTitle.value = group.title;
  editingVisible.value = true;
}

function saveEditor() {
  if (editingType.value === 'folder') {
    const title = folderTitle.value.trim();
    if (!title) return;
    snapshot(editingGroupId.value ? '编辑目录' : '新增目录');
    const group = groups.value.find((item) => item.id === editingGroupId.value);
    if (group) {
      group.title = title;
    } else {
      groups.value.push({ id: createId('folder'), title, collapsed: false, items: [] });
    }
  } else {
    if (!form.value.title.trim() || !form.value.url.trim()) return;
    snapshot(editingBookmarkId.value ? '编辑书签' : '新增书签');
    let group = groups.value.find((item) => item.id === editingGroupId.value) || groups.value[0];
    if (!group) {
      group = { id: createId('folder'), title: '未分类', collapsed: false, items: [] };
      groups.value.push(group);
      editingGroupId.value = group.id;
    }
    const tags = form.value.tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean);
    const owner = editingBookmarkId.value ? findBookmarkOwner(editingBookmarkId.value) : undefined;
    const bookmark = owner?.items.find((item) => item.id === editingBookmarkId.value);
    if (bookmark) {
      Object.assign(bookmark, {
        title: form.value.title.trim(),
        url: form.value.url.trim(),
        tags,
        description: form.value.description.trim(),
      });
      if (owner && owner.id !== group.id) {
        owner.items = owner.items.filter((item) => item.id !== bookmark.id);
        group.items.push(bookmark);
        group.collapsed = false;
      }
    } else {
      group.items.push({
        id: createId('bookmark'),
        title: form.value.title.trim(),
        url: form.value.url.trim(),
        tags,
        description: form.value.description.trim(),
      });
      group.collapsed = false;
    }
  }
  editingVisible.value = false;
  saveGroups();
  reflow();
}

function removeBookmark(group: BookmarkGroup, item: BookmarkItem) {
  snapshot('删除书签');
  group.items = group.items.filter((candidate) => candidate.id !== item.id);
  saveGroups();
  reflow();
}

function removeFolder(group: BookmarkGroup) {
  ElMessageBox.confirm(`删除目录「${group.title}」及其中 ${group.items.length} 个书签？`, '确认删除', { type: 'warning' })
    .then(() => {
      snapshot('删除目录');
      groups.value = groups.value.filter((candidate) => candidate.id !== group.id);
      saveGroups();
      reflow();
    })
    .catch(() => undefined);
}

function resetData() {
  ElMessageBox.confirm('重置会丢弃当前原型里的目录、书签和排序改动。确定重置？', '重置原型', { type: 'warning' })
    .then(() => {
      snapshot('重置数据');
      groups.value = normalize(rawBookmarks as unknown as RawGroup[]);
      searchText.value = '';
      filter.value = { type: 'all' };
      saveGroups();
      reflow();
    })
    .catch(() => undefined);
}

function onBookmarkDragStart() {
  beginDragSnapshot('移动书签');
}

function onBookmarkDragEnd() {
  completeDragSnapshot();
  saveGroups();
  reflow();
}

function onFolderDragStart() {
  beginDragSnapshot('目录排序');
  folderCollapsedBeforeDrag = new Map(groups.value.map((group) => [group.id, group.collapsed]));
  suppressPersistence.value = true;
  groups.value.forEach((group) => {
    group.collapsed = true;
  });
}

function onFolderDragEnd() {
  groups.value.forEach((group) => {
    group.collapsed = folderCollapsedBeforeDrag?.get(group.id) ?? group.collapsed;
  });
  folderCollapsedBeforeDrag = null;
  suppressPersistence.value = false;
  completeDragSnapshot();
  saveGroups();
  reflow();
}

function moveSelection(offset: number) {
  if (selectedItems.value.length === 0) {
    selectedIndex.value = -1;
    return;
  }
  const base = selectedIndex.value < 0 ? (offset > 0 ? -1 : 0) : selectedIndex.value;
  selectedIndex.value = (base + offset + selectedItems.value.length) % selectedItems.value.length;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, [contenteditable="true"], .el-dialog'));
}

const keys = useMagicKeys();
whenever(keys.ctrl_k, focusSearch);
whenever(keys.ctrl_e, () => setMode(mode.value === 'browse' ? 'organize' : 'browse'));
whenever(keys.ctrl_z, () => {
  if (!isEditableTarget(document.activeElement)) undo();
});

watch([searchText, filter], () => {
  selectedIndex.value = -1;
  reflow();
});
watch(mode, (value) => {
  if (value === 'browse') reflow();
});
watch(groups, saveGroups, { deep: true });

onMounted(() => {
  reflow();
  window.addEventListener('resize', reflow);
  focusSearch();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', reflow);
  destroyMacy();
});
</script>

<template>
  <el-config-provider size="small">
    <div class="app-shell" :class="[`mode-${mode}`, `organize-${organizeMode}`]">
      <aside class="sidebar">
        <div class="brand">
          <el-icon><Grid /></el-icon>
          <span>Bookmarks</span>
        </div>
        <button class="side-row" :class="{ active: filter.type === 'all' }" @click="setFilter({ type: 'all' })">
          <span>全部</span><b>{{ totalCount }}</b>
        </button>
        <button class="side-row" :class="{ active: filter.type === 'recent' }" @click="setFilter({ type: 'recent' })">
          <span>后 12</span><b>{{ Math.min(12, totalCount) }}</b>
        </button>
        <div class="side-title">标签</div>
        <button
          v-for="[tag, count] in tagCounts.slice(0, 10)"
          :key="tag"
          class="side-row"
          :class="{ active: filter.type === 'tag' && filter.tag === tag }"
          @click="setFilter({ type: 'tag', tag })"
        >
          <span>{{ tag }}</span><b>{{ count }}</b>
        </button>
        <button class="side-foot" @click="resetData">
          <el-icon><RefreshLeft /></el-icon>
          <span>重置原型</span>
        </button>
      </aside>

      <main class="main">
        <header class="topbar">
          <div class="search-wrap">
            <el-input
              ref="searchInputRef"
              v-model="searchText"
              class="search-input"
              clearable
              placeholder="搜索书签，输入 ! 进行站内搜索"
              :prefix-icon="Search"
              @keydown.down.prevent="moveSelection(1)"
              @keydown.up.prevent="moveSelection(-1)"
              @keydown.enter.prevent="openSelected($event.ctrlKey || $event.metaKey)"
              @keydown.esc.prevent="searchText = ''"
            >
              <template #prepend>
                <el-select v-model="selectedEngine" class="engine-select" :suffix-icon="ArrowDown">
                  <el-option v-for="engine in engines" :key="engine.id" :label="engine.name" :value="engine.id" />
                </el-select>
              </template>
            </el-input>
            <div v-if="isQuickSearch" class="quick-panel">
              <button
                v-for="({ item }, index) in quickSearchItems"
                :key="item.id"
                class="quick-row"
                :class="{ selected: selectedIndex === index }"
                @click="openUrl(item.url.replace('{keyword}', encodeURIComponent(quickKeyword)).replace('${keyword}', encodeURIComponent(quickKeyword)))"
              >
                <img :src="favicon(item)" alt="" />
                <strong>{{ item.title }}</strong>
                <small>{{ quickKeyword || '站内搜索' }}</small>
              </button>
            </div>
          </div>
          <div class="top-actions">
            <el-button :icon="Plus" @click="beginAddBookmark()">书签</el-button>
            <el-button :type="mode === 'organize' ? 'primary' : 'default'" @click="setMode(mode === 'browse' ? 'organize' : 'browse')">
              {{ mode === 'browse' ? '整理' : '退出整理' }}
            </el-button>
          </div>
        </header>

        <section v-if="mode === 'organize'" class="organize-bar">
          <strong>整理模式</strong>
          <el-segmented v-model="organizeMode" :options="[{ label: '书签', value: 'bookmark' }, { label: '目录', value: 'folder' }]" @change="setOrganizeMode($event as OrganizeMode)" />
          <el-button :icon="ArrowUp" @click="collapseAll(true)">全部收起</el-button>
          <el-button :icon="ArrowDown" @click="collapseAll(false)">全部展开</el-button>
          <el-button :icon="Plus" @click="beginAddFolder">目录</el-button>
          <el-button :icon="RefreshLeft" :disabled="undoStack.length === 0" @click="undo">撤销</el-button>
        </section>

        <div class="content-scroll">
          <VueDraggable
            v-if="mode === 'organize' && organizeMode === 'folder'"
            v-model="groups"
            class="folder-sort-grid"
            tag="div"
            item-key="id"
            :animation="150"
            :force-fallback="true"
            ghost-class="drag-ghost"
            chosen-class="drag-chosen"
            drag-class="drag-active"
            @start="onFolderDragStart"
            @end="onFolderDragEnd"
          >
            <article v-for="group in groups" :key="group.id" class="folder-tile">
              <div class="folder-tile-title">
                <el-icon class="folder-handle"><Menu /></el-icon>
                <el-icon><Folder /></el-icon>
                <strong>{{ group.title }}</strong>
                <small>{{ group.items.length }}</small>
              </div>
              <div class="folder-tile-actions no-drag" @pointerdown.stop @mousedown.stop @click.stop @dblclick.stop>
                <el-button text :icon="Edit" @click.stop="beginEditFolder(group)" />
                <el-button text :icon="Delete" @click.stop="removeFolder(group)" />
              </div>
            </article>
          </VueDraggable>

          <section v-else ref="boardRef" class="board">
            <article v-for="entry in boardGroups" :key="entry.group.id" class="group-card">
              <header class="group-header" @click="toggleGroup(entry.group)">
                <div class="group-title">
                  <el-icon><Folder /></el-icon>
                  <strong>{{ entry.group.title }}</strong>
                  <small>{{ entry.items.length }}</small>
                </div>
                <div class="group-actions" @click.stop>
                  <el-button v-if="mode === 'organize'" text :icon="Plus" @click="beginAddBookmark(entry.group)" />
                  <el-button v-if="mode === 'organize'" text :icon="Edit" @click="beginEditFolder(entry.group)" />
                </div>
              </header>
              <button v-if="entry.group.collapsed && !query" class="collapsed-row" @click="toggleGroup(entry.group)">... {{ entry.group.items.length }} 个书签</button>
              <VueDraggable
                v-else-if="mode === 'organize'"
                v-model="entry.group.items"
                class="bookmark-list"
                item-key="id"
                :disabled="mode !== 'organize' || organizeMode !== 'bookmark'"
                group="bookmarks"
                :animation="150"
                :force-fallback="true"
                ghost-class="drag-ghost"
                chosen-class="drag-chosen"
                drag-class="drag-active"
                @start="onBookmarkDragStart"
                @end="onBookmarkDragEnd"
              >
                <div
                  v-for="item in entry.group.items"
                  :key="item.id"
                  class="bookmark-row"
                  :class="{ selected: currentSelection?.item.id === item.id }"
                  tabindex="0"
                  @keydown.enter.prevent
                  @keydown.e.prevent="beginEditBookmark(entry.group, item)"
                  @keydown.c.prevent="copyUrl(item)"
                  @keydown.delete.prevent="removeBookmark(entry.group, item)"
                >
                  <el-icon v-if="mode === 'organize'" class="bookmark-handle"><Menu /></el-icon>
                  <img :src="favicon(item)" alt="" draggable="false" @load="reflow" @error="reflow" />
                  <strong class="bookmark-title" @click.stop="openBookmarkClick(item.url, $event)" @dblclick.stop>{{ item.title }}</strong>
                  <small class="bookmark-url" :title="item.url" @click.stop="openBookmarkClick(item.url, $event)" @dblclick.stop>{{ item.url }}</small>
                  <el-tag v-if="item.tags[0]" class="no-drag" effect="plain" size="small">{{ item.tags[0] }}</el-tag>
                  <div v-if="mode === 'organize'" class="bookmark-actions no-drag" @pointerdown.stop @mousedown.stop @click.stop @dblclick.stop>
                    <el-button text :icon="CopyDocument" @click.stop="copyUrl(item)" />
                    <el-button text :icon="Edit" @click.stop="beginEditBookmark(entry.group, item)" />
                    <el-button text :icon="Delete" @click.stop="removeBookmark(entry.group, item)" />
                  </div>
                </div>
              </VueDraggable>
              <div v-else class="bookmark-list">
                <div
                  v-for="item in entry.items"
                  :key="item.id"
                  class="bookmark-row"
                  :class="{ selected: currentSelection?.item.id === item.id }"
                  tabindex="0"
                  @keydown.enter.prevent="openUrl(item.url)"
                >
                  <img :src="favicon(item)" alt="" draggable="false" @load="reflow" @error="reflow" />
                  <strong class="bookmark-title" @click.stop="openBookmarkClick(item.url, $event)" @dblclick.stop>{{ item.title }}</strong>
                  <small class="bookmark-url" :title="item.url" @click.stop="openBookmarkClick(item.url, $event)" @dblclick.stop>{{ item.url }}</small>
                  <el-tag v-if="item.tags[0]" class="no-drag" effect="plain" size="small">{{ item.tags[0] }}</el-tag>
                </div>
              </div>
            </article>
          </section>
        </div>
      </main>

      <el-dialog v-model="editingVisible" :title="editingType === 'folder' ? '目录' : '书签'" width="520px">
        <el-form label-position="top">
          <template v-if="editingType === 'folder'">
            <el-form-item label="目录名称">
              <el-input v-model="folderTitle" autofocus />
            </el-form-item>
          </template>
          <template v-else>
            <el-form-item label="标题">
              <el-input v-model="form.title" autofocus />
            </el-form-item>
            <el-form-item label="URL">
              <el-input v-model="form.url" />
            </el-form-item>
            <el-form-item label="所在目录">
              <el-select v-model="editingGroupId" class="folder-select">
                <el-option v-for="group in groups" :key="group.id" :label="group.title" :value="group.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="标签">
              <el-input v-model="form.tags" placeholder="用逗号分隔" />
            </el-form-item>
            <el-form-item label="备注">
              <el-input v-model="form.description" type="textarea" :rows="3" />
            </el-form-item>
          </template>
        </el-form>
        <template #footer>
          <el-button :icon="Close" @click="editingVisible = false">取消</el-button>
          <el-button type="primary" :icon="Check" @click="saveEditor">保存</el-button>
        </template>
      </el-dialog>
    </div>
  </el-config-provider>
</template>
