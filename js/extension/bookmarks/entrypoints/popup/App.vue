<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { Search, Plus, FolderOpened } from '@element-plus/icons-vue';
import { BookmarkManager } from '@/utils/bookmarkManager';

// 状态管理
const searchQuery = ref('');
const bookmarks = ref<any[]>([]);
const folders = ref<any[]>([]);
const loading = ref(true);
const showAddModal = ref(false);

// 生命周期
onMounted(async () => {
  await loadData();
});

// 加载数据
const loadData = async () => {
  try {
    loading.value = true;
    const data = await BookmarkManager.getAllData();
    folders.value = data.folders;
    
    // 获取最近添加的书签（限制数量以适应popup小窗口）
    const recentBookmarks: any[] = [];
    for (const folder of data.folders) {
      for (const bookmark of folder.bookmarks) {
        recentBookmarks.push({
          ...bookmark,
          folderName: folder.title
        });
      }
    }
    
    // 按创建时间排序，取最新的10个
    recentBookmarks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    bookmarks.value = recentBookmarks.slice(0, 10);
  } catch (error) {
    console.error('Failed to load bookmarks:', error);
  } finally {
    loading.value = false;
  }
};

// 搜索书签
const searchBookmarks = async () => {
  if (!searchQuery.value.trim()) {
    await loadData();
    return;
  }

  try {
    const results = await BookmarkManager.searchBookmarks(searchQuery.value);
    bookmarks.value = results.map(bookmark => ({
      ...bookmark,
      folderName: folders.value.find(f => f.id === bookmark.folderId)?.title || '未知文件夹'
    }));
  } catch (error) {
    console.error('Search failed:', error);
  }
};

// 打开书签
const openBookmark = (url: string) => {
  window.open(url, '_blank');
};

// 打开完整管理器
const openFullManager = () => {
  browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
  window.close();
};

// 快速添加书签
const quickAddBookmark = async () => {
  try {
    // 获取当前标签页信息
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    
    if (tab.url && tab.title) {
      await BookmarkManager.addBookmark({
        title: tab.title,
        url: tab.url,
        skipFavicon: false
      });
      
      // 刷新数据
      await loadData();
    }
  } catch (error) {
    console.error('Quick add failed:', error);
  }
};

// 防抖搜索
let searchTimeout: NodeJS.Timeout;
const handleSearchInput = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(searchBookmarks, 300);
};
</script>

<template>
  <div class="popup-app">
    <!-- 头部 -->
    <div class="popup-header">
      <div class="header-title">
        <el-icon><FolderOpened /></el-icon>
        <span>书签管理器</span>
      </div>
      <el-button 
        type="primary" 
        size="small" 
        @click="openFullManager"
        text
      >
        完整版
      </el-button>
    </div>

    <!-- 搜索框 -->
    <div class="search-section">
      <el-input
        v-model="searchQuery"
        placeholder="搜索书签..."
        size="small"
        @input="handleSearchInput"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <!-- 快速操作 -->
    <div class="quick-actions">
      <el-button 
        type="primary" 
        size="small" 
        @click="quickAddBookmark"
        :icon="Plus"
      >
        收藏当前页
      </el-button>
    </div>

    <!-- 书签列表 -->
    <div class="bookmarks-section">
      <div v-if="loading" class="loading">
        <el-skeleton :rows="3" animated />
      </div>
      
      <div v-else-if="bookmarks.length === 0" class="empty-state">
        <el-empty description="暂无书签" :image-size="60" />
      </div>
      
      <div v-else class="bookmark-list">
        <div 
          v-for="bookmark in bookmarks" 
          :key="bookmark.id"
          class="bookmark-item"
          @click="openBookmark(bookmark.url)"
        >
          <img 
            :src="bookmark.favicon || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTggMUMxMS44NjYgMSAxNSA0LjEzNCAxNSA4QzE1IDExLjg2NiAxMS44NjYgMTUgOCAxNUM0LjEzNCAxNSAxIDExLjg2NiAxIDhDMSA0LjEzNCA0LjEzNCAxIDggMVoiIHN0cm9rZT0iIzk5OTk5OSIgc3Ryb2tlLXdpZHRoPSIxLjUiLz4KPHBhdGggZD0iTTUuNSA2LjVIMTAuNSIgc3Ryb2tlPSIjOTk5OTk5IiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CjxwYXRoIGQ9Ik01LjUgOS41SDEwLjUiIHN0cm9rZT0iIzk5OTk5OSIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K'"
            :alt="bookmark.title"
            class="bookmark-favicon"
          />
          <div class="bookmark-info">
            <div class="bookmark-title" :title="bookmark.title">
              {{ bookmark.title }}
            </div>
            <div class="bookmark-folder" :title="bookmark.folderName">
              {{ bookmark.folderName }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部统计 -->
    <div class="popup-footer">
      <div class="stats">
        共 {{ bookmarks.length }} 个书签
      </div>
    </div>
  </div>
</template>

<style scoped>
.popup-app {
  width: 320px;
  max-height: 480px;
  display: flex;
  flex-direction: column;
  background: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  background: #f8f9fa;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #333;
}

.search-section {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.quick-actions {
  padding: 8px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.bookmarks-section {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.loading {
  padding: 16px;
}

.empty-state {
  padding: 32px 16px;
  text-align: center;
}

.bookmark-list {
  display: flex;
  flex-direction: column;
}

.bookmark-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid #f5f5f5;
}

.bookmark-item:hover {
  background-color: #f8f9fa;
}

.bookmark-favicon {
  width: 16px;
  height: 16px;
  border-radius: 2px;
  flex-shrink: 0;
}

.bookmark-info {
  flex: 1;
  min-width: 0;
}

.bookmark-title {
  font-size: 13px;
  color: #333;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.bookmark-folder {
  font-size: 11px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.popup-footer {
  padding: 8px 16px;
  border-top: 1px solid #f0f0f0;
  background: #f8f9fa;
}

.stats {
  font-size: 12px;
  color: #666;
  text-align: center;
}

/* 滚动条样式 */
.bookmarks-section::-webkit-scrollbar {
  width: 4px;
}

.bookmarks-section::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.bookmarks-section::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 2px;
}

.bookmarks-section::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>