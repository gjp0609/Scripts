<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Bookmark, ExternalLink, Plus, Search, Zap } from 'lucide-vue-next';
import type { FolderView } from '../types/bookmark';
import { addCurrentBookmark, loadBookmarkWorkspace } from '../services/bookmarkRepository';
import type { CurrentTab } from '../services/extensionRuntime';
import { closePopup, executeBookmarklet, getCurrentTab, openAppPage } from '../services/extensionRuntime';

const folders = ref<FolderView[]>([]);
const currentTab = ref<CurrentTab | undefined>();
const query = ref('');
const status = ref('');
const error = ref('');

const filteredFolders = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase();
  if (!keyword) return folders.value;
  return folders.value.filter((folder) => folder.title.toLocaleLowerCase().includes(keyword));
});

const bookmarklets = computed(() =>
  folders.value.flatMap((folder) =>
    folder.bookmarks
      .filter((bookmark) => bookmark.url?.startsWith('javascript:'))
      .map((bookmark) => ({ ...bookmark, folderTitle: folder.title }))
  )
);

async function load() {
  try {
    const [workspace, tab] = await Promise.all([loadBookmarkWorkspace(), getCurrentTab()]);
    folders.value = workspace.folders;
    currentTab.value = tab;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '读取扩展数据失败';
  }
}

async function saveToFolder(folder: FolderView) {
  if (!currentTab.value?.url) {
    error.value = '当前标签页没有可保存的 URL';
    return;
  }

  await addCurrentBookmark(folder.id, currentTab.value.title || currentTab.value.url, currentTab.value.url);
  status.value = `已保存到 ${folder.title}`;
  window.setTimeout(closePopup, 450);
}

async function runBookmarklet(bookmarklet: { url?: string }) {
  if (!currentTab.value?.id || !bookmarklet.url) return;
  await executeBookmarklet(currentTab.value.id, bookmarklet.url);
  closePopup();
}

onMounted(() => {
  void load();
});
</script>

<template>
  <main class="popup-shell">
    <header class="popup-head">
      <div class="popup-brand">
        <Bookmark :size="18" />
        <strong>MarkHub</strong>
      </div>
      <button class="icon-button" type="button" aria-label="打开主页面" @click="openAppPage">
        <ExternalLink :size="16" />
      </button>
    </header>

    <section class="current-page">
      <span>当前页面</span>
      <strong>{{ currentTab?.title || '未读取到当前标签页' }}</strong>
    </section>

    <div class="popup-search">
      <Search :size="15" />
      <input v-model="query" type="text" placeholder="搜索目录..." autofocus />
    </div>

    <section class="folder-list">
      <button v-for="folder in filteredFolders" :key="folder.id" class="folder-row" type="button" @click="saveToFolder(folder)">
        <span>{{ folder.title }}</span>
        <small>{{ folder.bookmarks.length }}</small>
        <Plus :size="14" />
      </button>
    </section>

    <section v-if="bookmarklets.length" class="bookmarklet-list">
      <div class="section-label">
        <Zap :size="13" />
        <span>Bookmarklet</span>
      </div>
      <button v-for="bookmarklet in bookmarklets" :key="bookmarklet.id" class="folder-row" type="button" @click="runBookmarklet(bookmarklet)">
        <span>{{ bookmarklet.title }}</span>
        <small>{{ bookmarklet.folderTitle }}</small>
      </button>
    </section>

    <p v-if="status" class="popup-status">{{ status }}</p>
    <p v-if="error" class="popup-error">{{ error }}</p>
  </main>
</template>
