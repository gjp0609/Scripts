<script lang="ts" setup>
import { ref, onMounted, computed, watch, onUnmounted } from 'vue';
import { ElContainer, ElHeader, ElAside, ElMain, ElButton, ElIcon, ElTabs, ElTabPane, ElMessageBox, ElMessage } from 'element-plus';
import { Plus, Setting, Refresh, Star } from '@element-plus/icons-vue';
import type { BookmarkData, Bookmark, Folder } from '@/types/bookmark';
import { BookmarkManager } from '@/utils/bookmarkManager';
import { SettingsManager } from '@/utils/settings';

// 组件导入
import PowerSearch from '@/components/PowerSearch.vue';
import TagSidebar from '@/components/TagSidebar.vue';
import FolderCard from '@/components/FolderCard.vue';
import BookmarkModal from '@/components/BookmarkModal.vue';
import ImportExport from '@/components/ImportExport.vue';
import Settings from '@/components/Settings.vue';

// 状态管理
const loading = ref(true);
const bookmarkData = ref<BookmarkData>({ folders: [], tags: [] });
const filteredData = ref<BookmarkData>({ folders: [], tags: [] });
const selectedTag = ref('');
const searchQuery = ref('');
const debouncedSearchQuery = ref('');
const activeTab = ref('bookmarks');
const searchDebounceTimer = ref<number | null>(null);

// 模态框状态
const bookmarkModalVisible = ref(false);
const editingBookmark = ref<Bookmark | undefined>();
const defaultFolderId = ref('');
const defaultUrl = ref('');
const defaultTitle = ref('');

// 计算属性
const displayData = computed(() => {
  let data = bookmarkData.value;

  // 标签筛选
  if (selectedTag.value) {
    data = {
      folders: data.folders.map(folder => ({
        ...folder,
        bookmarks: folder.bookmarks.filter(bookmark =>
          bookmark.tags.includes(selectedTag.value)
        )
      })).filter(folder => folder.bookmarks.length > 0),
      tags: data.tags
    };
  }

  // 搜索筛选 - 使用防抖后的查询
  if (debouncedSearchQuery.value) {
    const query = debouncedSearchQuery.value.toLowerCase();
    data = {
      folders: data.folders.map(folder => ({
        ...folder,
        bookmarks: folder.bookmarks.filter(bookmark =>
          bookmark.title.toLowerCase().includes(query) ||
          bookmark.url.toLowerCase().includes(query) ||
          bookmark.description.toLowerCase().includes(query) ||
          bookmark.tags.some(tag => tag.toLowerCase().includes(query))
        )
      })).filter(folder => folder.bookmarks.length > 0),
      tags: data.tags
    };
  }

  return data;
});

// 方法
const loadBookmarkData = async () => {
  try {
    loading.value = true;
    bookmarkData.value = await BookmarkManager.getAllData();

    // 更新最后使用时间
    await SettingsManager.updateLastUsed();
  } catch (error) {
    console.error('Failed to load bookmark data:', error);
  } finally {
    loading.value = false;
  }
};

const handleTagSelected = (tag: string) => {
  selectedTag.value = tag;
};

const handleFilterCleared = () => {
  selectedTag.value = '';
};

const handleSearch = (query: string) => {
  searchQuery.value = query;

  // 防抖处理
  if (searchDebounceTimer.value) {
    clearTimeout(searchDebounceTimer.value);
  }

  searchDebounceTimer.value = setTimeout(() => {
    // 只有在输入以空格开头时才进行书签筛选
    if (query.match(/^\s+/)) {
      debouncedSearchQuery.value = query.trim();
    } else {
      debouncedSearchQuery.value = '';
    }
  }, 300); // 300ms 防抖延迟
};

const showAddBookmarkModal = (folderId?: string, url?: string, title?: string) => {
  editingBookmark.value = undefined;
  defaultFolderId.value = folderId || '';
  defaultUrl.value = url || '';
  defaultTitle.value = title || '';
  bookmarkModalVisible.value = true;
};

const showEditBookmarkModal = (bookmark: Bookmark) => {
  editingBookmark.value = bookmark;
  defaultFolderId.value = '';
  defaultUrl.value = '';
  defaultTitle.value = '';
  bookmarkModalVisible.value = true;
};

const handleBookmarkModalSuccess = () => {
  loadBookmarkData();
};

const handleFolderEdit = async (folder: Folder) => {
  try {
    const { value: newTitle } = await ElMessageBox.prompt(
      '请输入新的文件夹名称：',
      '重命名文件夹',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValue: folder.title,
        inputValidator: (value) => {
          if (!value || value.trim() === '') {
            return '文件夹名称不能为空';
          }
          if (value.length > 50) {
            return '文件夹名称不能超过50个字符';
          }
          return true;
        },
      }
    );

    if (newTitle && newTitle.trim() !== folder.title) {
      await BookmarkManager.editFolder(folder.id, newTitle.trim());
      ElMessage.success('文件夹重命名成功');
      loadBookmarkData(); // 重新加载数据
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to rename folder:', error);
      ElMessage.error('文件夹重命名失败');
    }
  }
};

const handleFolderDelete = () => {
  loadBookmarkData();
};

const handleBookmarkMoved = async () => {
  // 优化：只重新加载数据，不显示全局loading
  try {
    const newData = await BookmarkManager.getAllData();
    bookmarkData.value = newData;
  } catch (error) {
    console.error('Failed to refresh bookmark data:', error);
    // 如果局部刷新失败，则进行完整刷新
    loadBookmarkData();
  }
};

const handleImportSuccess = () => {
  loadBookmarkData();
};

const handleSettingsChanged = () => {
  // 设置变化时可能需要重新加载某些数据
  loadBookmarkData();
};

const refreshData = () => {
  loadBookmarkData();
};

// 移除搜索查询监听，避免重复处理
// PowerSearch 组件已经通过 @search 事件处理搜索逻辑

// 键盘快捷键处理
const handleKeydown = (event: KeyboardEvent) => {
  // 如果正在输入框中，不触发快捷键
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    return;
  }

  // Ctrl/Cmd + K: 聚焦搜索框
  if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
    event.preventDefault();
    // 聚焦到PowerSearch组件的输入框
    const searchInput = document.querySelector('.power-search .el-input__inner') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }

  // Ctrl/Cmd + N: 添加新书签
  if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
    event.preventDefault();
    showAddBookmarkModal();
  }

  // Ctrl/Cmd + /: 显示快捷键帮助
  if ((event.ctrlKey || event.metaKey) && event.key === '/') {
    event.preventDefault();
    showShortcutsHelp();
  }

  // Escape: 清除搜索和筛选
  if (event.key === 'Escape') {
    if (searchQuery.value || selectedTag.value) {
      event.preventDefault();
      searchQuery.value = '';
      selectedTag.value = '';
    }
  }

  // F1: 显示设置
  if (event.key === 'F1') {
    event.preventDefault();
    activeTab.value = 'settings';
  }

  // F2: 导出书签
  if (event.key === 'F2') {
    event.preventDefault();
    activeTab.value = 'import-export';
  }
};

// 显示快捷键帮助
const showShortcutsHelp = () => {
  ElMessageBox.alert(
    `<div style="text-align: left; line-height: 1.8;">
      <div style="font-weight: bold; margin-bottom: 12px; color: #409eff;">键盘快捷键</div>
      <div><kbd>Ctrl/Cmd + K</kbd> - 聚焦搜索框</div>
      <div><kbd>Ctrl/Cmd + N</kbd> - 添加新书签</div>
      <div><kbd>Ctrl/Cmd + /</kbd> - 显示此帮助</div>
      <div><kbd>Escape</kbd> - 清除搜索和筛选</div>
      <div><kbd>F1</kbd> - 打开设置</div>
      <div><kbd>F2</kbd> - 打开导入导出</div>
    </div>`,
    '快捷键帮助',
    {
      dangerouslyUseHTMLString: true,
      confirmButtonText: '知道了',
      customClass: 'shortcuts-help-dialog'
    }
  );
};

// 生命周期
onMounted(async () => {
  await loadBookmarkData();

  // 添加键盘快捷键监听
  document.addEventListener('keydown', handleKeydown);

  // 检查是否有来自background的当前页面信息
  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_CURRENT_TAB_INFO' });
    if (response && response.url && response.title) {
      // 如果有当前页面信息，可以预填充添加书签表单
      defaultUrl.value = response.url;
      defaultTitle.value = response.title;
    }
  } catch (error) {
    // 忽略错误，可能是在开发环境中
  }
});

// 清理事件监听器
import { onUnmounted } from 'vue';
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="bookmark-manager">
    <el-container>
      <!-- 头部 -->
      <el-header class="app-header">
        <div class="header-container">
          <!-- 搜索框居中 -->
          <div class="search-container">
            <PowerSearch
              v-model="searchQuery"
              @search="handleSearch"
              placeholder="搜索书签或使用 ! 触发搜索引擎"
            />
          </div>
        </div>
      </el-header>

      <el-container>
        <!-- 侧边栏 -->
        <el-aside width="220px" class="app-aside">
          <TagSidebar
            :selected-tag="selectedTag"
            :bookmark-data="bookmarkData"
            @tag-selected="handleTagSelected"
            @filter-cleared="handleFilterCleared"
          />
        </el-aside>

        <!-- 主内容区 -->
        <el-main class="app-main">
          <el-tabs v-model="activeTab" class="main-tabs">
            <el-tab-pane label="书签管理" name="bookmarks">
              <!-- 书签管理操作栏 -->
              <div v-if="!loading && displayData.folders.length > 0" class="bookmark-actions-bar">
                <div class="actions-left">
                  <h3 class="page-title">我的书签</h3>
                </div>
                <div class="actions-right">
                  <el-button
                    type="primary"
                    :icon="Plus"
                    @click="showAddBookmarkModal()"
                    size="default"
                  >
                    添加书签
                  </el-button>
                </div>
              </div>

              <div v-if="loading" class="loading-container">
                <el-icon class="is-loading"><Refresh /></el-icon>
                <p>加载中...</p>
              </div>

              <div v-else-if="displayData.folders.length === 0" class="empty-container">
                <el-icon class="empty-icon"><Plus /></el-icon>
                <h3>暂无书签</h3>
                <p>点击"添加书签"按钮开始收藏您喜欢的网站</p>
                <el-button
                  type="primary"
                  :icon="Plus"
                  @click="showAddBookmarkModal()"
                >
                  添加第一个书签
                </el-button>
              </div>

              <div v-else class="folders-grid">
                <FolderCard
                  v-for="folder in displayData.folders"
                  :key="folder.id"
                  :folder="folder"
                  @edit-folder="handleFolderEdit"
                  @delete-folder="handleFolderDelete"
                  @edit-bookmark="showEditBookmarkModal"
                  @bookmark-moved="handleBookmarkMoved"
                />
              </div>
            </el-tab-pane>

            <el-tab-pane label="导入导出" name="import-export">
              <ImportExport @import-success="handleImportSuccess" />
            </el-tab-pane>

            <el-tab-pane label="设置" name="settings">
              <Settings @settings-changed="handleSettingsChanged" />
            </el-tab-pane>
          </el-tabs>
        </el-main>
      </el-container>
    </el-container>

    <!-- 书签模态框 -->
    <BookmarkModal
      v-model:visible="bookmarkModalVisible"
      :bookmark="editingBookmark"
      :default-folder-id="defaultFolderId"
      :default-url="defaultUrl"
      :default-title="defaultTitle"
      @success="handleBookmarkModalSuccess"
    />
  </div>
</template>

<style scoped>
.bookmark-manager {
  width: 100vw;
  height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.app-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-bottom: none;
  padding: 12px 20px;
  height: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  position: relative;
  overflow: hidden;
}

.app-header::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  z-index: 0;
}

.header-container {
  position: relative;
  z-index: 1;
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  justify-content: center;
  align-items: center;
}

.search-container {
  width: 100%;
  max-width: 500px;
  margin: 0 auto;
}

.bookmark-actions-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #e1e5e9;
  margin-bottom: 12px;
}

.actions-left .page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.actions-right {
  display: flex;
  gap: 12px;
  align-items: center;
}

.app-aside {
  background: #fafbfc;
  border-right: 1px solid #e1e5e9;
  height: calc(100vh - 80px);
  overflow-y: auto;
  width: 200px !important;
}

.app-main {
  padding: 0;
  background: #f8f9fa;
  height: calc(100vh - 80px);
  overflow-y: auto;
}

.main-tabs {
  height: 100%;
}

:deep(.el-tabs__content) {
  height: calc(100% - 40px);
  overflow-y: auto;
  padding: 12px;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: calc(100vh - 300px);
  min-height: 300px;
  color: #666;
}

.loading-container .el-icon {
  font-size: 32px;
  margin-bottom: 16px;
}

.empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: calc(100vh - 300px);
  min-height: 300px;
  text-align: center;
  color: #666;
}

.empty-icon {
  font-size: 64px;
  color: #d9d9d9;
  margin-bottom: 20px;
}

.empty-container h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  color: #333;
}

.empty-container p {
  margin: 0 0 20px 0;
  color: #666;
}

.folders-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
  padding: 4px;
  max-width: 1400px;
  margin: 0 auto;
}

/* 响应式设计 */
@media (max-width: 1400px) {
  .folders-grid {
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 20px;
  }
}

@media (max-width: 1200px) {
  .folders-grid {
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;
  }
}

@media (max-width: 1200px) {
  .search-container {
    max-width: 400px;
  }
}

@media (max-width: 900px) {
  .app-aside {
    width: 200px !important;
  }

  .folders-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .search-container {
    max-width: none;
    margin: 0 16px;
  }

  .app-header {
    padding: 16px 20px;
  }
}

@media (max-width: 600px) {
  .search-container {
    margin: 0 12px;
  }
}

/* Element Plus 组件样式调整 */
:deep(.el-container) {
  height: 100vh;
}

:deep(.el-header) {
  height: auto !important;
}

:deep(.el-tabs__header) {
  margin: 0;
  background: white;
  border-bottom: 1px solid #e1e5e9;
  padding: 0 20px;
  position: sticky;
  top: 0;
  z-index: 10;
}

:deep(.el-tabs__nav-wrap) {
  padding: 0;
}

:deep(.el-tabs__item) {
  height: 40px;
  line-height: 40px;
  font-weight: 500;
}

/* 滚动条样式 */
.app-aside::-webkit-scrollbar,
.app-main::-webkit-scrollbar {
  width: 8px;
}

.app-aside::-webkit-scrollbar-track,
.app-main::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.app-aside::-webkit-scrollbar-thumb,
.app-main::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

.app-aside::-webkit-scrollbar-thumb:hover,
.app-main::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>
