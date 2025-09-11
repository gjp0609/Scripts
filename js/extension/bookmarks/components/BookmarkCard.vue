<template>
  <div
    class="bookmark-card"
    :draggable="true"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
    @click="openBookmark"
    @mouseenter="showActions = true"
    @mouseleave="showActions = false"
    :class="{ 'is-dragging': isDragging }"
  >
    <div class="bookmark-content">
      <div class="bookmark-header">
        <img
          :src="bookmark.favicon || defaultFavicon"
          :alt="bookmark.title"
          class="favicon"
          :data-bookmark-id="bookmark.id"
          @error="handleFaviconError"
          crossorigin="anonymous"
        />
        <div class="bookmark-info">
          <h4 class="bookmark-title" :title="bookmark.title">
            {{ bookmark.title }}
          </h4>
          <p class="bookmark-url" :title="bookmark.url">
            {{ displayUrl }}
          </p>
        </div>

        <!-- 操作按钮 -->
        <div v-show="showActions" class="bookmark-actions">
          <el-button
            type=""
            size="small"
            @click.stop="updateFavicon"
            :loading="updatingFavicon"
            title="更新图标"
          >
            <el-icon><Refresh /></el-icon>
          </el-button>
          <el-button
            type=""
            size="small"
            @click.stop="editBookmark"
            :icon="Edit"
            title="编辑"
          />
          <el-button
            type=""
            size="small"
            @click.stop="deleteBookmark"
            :icon="Delete"
            title="删除"
          />
        </div>
      </div>

      <!-- 标签 -->
      <div v-if="bookmark.tags.length > 0" class="bookmark-tags">
        <el-tag
          v-for="tag in bookmark.tags"
          :key="tag"
          size="small"
          type="info"
          class="tag-item"
        >
          {{ tag }}
        </el-tag>
      </div>

      <!-- 描述 -->
      <div v-if="bookmark.description" class="bookmark-description">
        {{ bookmark.description }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElButton, ElTag, ElMessageBox, ElMessage, ElIcon } from 'element-plus';
import { Edit, Delete, Refresh } from '@element-plus/icons-vue';
import type { Bookmark, DragData } from '@/types/bookmark';
import { BookmarkManager } from '@/utils/bookmarkManager';

// Props
interface Props {
  bookmark: Bookmark;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  'edit': [bookmark: Bookmark];
  'delete': [bookmarkId: string];
  'drag-start': [data: DragData];
  'favicon-updated': [];
}>();

// State
const showActions = ref(false);
const updatingFavicon = ref(false);
const isDragging = ref(false);
const defaultFavicon = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTggMUMxMS44NjYgMSAxNSA0LjEzNCAxNSA4QzE1IDExLjg2NiAxMS4xNjYgMTUgOCAxNUM0LjEzNCAxNSAxIDExLjg2NiAxIDhDMSA0LjEzNCA0LjEzNCAxIDggMVoiIHN0cm9rZT0iIzk5OTk5OSIgc3Ryb2tlLXdpZHRoPSIxLjUiLz4KPHBhdGggZD0iTTUuNSA2LjVIMTAuNSIgc3Ryb2tlPSIjOTk5OTk5IiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CjxwYXRoIGQ9Ik01LjUgOS41SDEwLjUiIHN0cm9rZT0iIzk5OTk5OSIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K';

// Computed
const displayUrl = computed(() => {
  try {
    const url = new URL(props.bookmark.url);
    return url.hostname;
  } catch {
    return props.bookmark.url;
  }
});

// Methods
const openBookmark = () => {
  // 在新标签页打开书签
  browser.tabs.create({ url: props.bookmark.url });
};

const editBookmark = () => {
  emit('edit', props.bookmark);
};

const deleteBookmark = async () => {
  try {
    await ElMessageBox.confirm(
      `确定要删除书签"${props.bookmark.title}"吗？`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );

    await BookmarkManager.deleteBookmark(props.bookmark.id);
    emit('delete', props.bookmark.id);
    ElMessage.success('书签删除成功');
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to delete bookmark:', error);
      ElMessage.error('删除书签失败');
    }
  }
};

const handleDragStart = (event: DragEvent) => {
  const dragData: DragData = {
    type: 'bookmark',
    id: props.bookmark.id,
    sourceFolder: props.bookmark.folderId
  };

  if (event.dataTransfer) {
    event.dataTransfer.setData('application/json', JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = 'move';
    
    // 创建拖拽预览图片
    const dragImage = createDragPreview();
    event.dataTransfer.setDragImage(dragImage, 10, 10);
  }

  // 添加拖拽状态
  isDragging.value = true;
  const targetElement = event.target as HTMLElement;
  targetElement.classList.add('dragging');
  
  // 添加触觉反馈
  if ('vibrate' in navigator) {
    navigator.vibrate(50);
  }
  
  // 创建拖拽幽灵效果
  createDragGhost(targetElement);

  emit('drag-start', dragData);
};

const createDragPreview = (): HTMLElement => {
  const preview = document.createElement('div');
  preview.style.cssText = `
    position: absolute;
    top: -9999px;
    left: -9999px;
    width: 220px;
    padding: 10px 14px;
    background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
    color: white;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 6px 20px rgba(24, 144, 255, 0.5), 0 2px 8px rgba(0, 0, 0, 0.15);
    pointer-events: none;
    display: flex;
    align-items: center;
    gap: 8px;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
  `;
  
  // 添加网站图标
  const favicon = document.createElement('img');
  favicon.src = props.bookmark.favicon || defaultFavicon;
  favicon.style.cssText = 'width: 16px; height: 16px; border-radius: 2px;';
  favicon.onerror = () => {
    favicon.src = defaultFavicon;
  };
  preview.appendChild(favicon);
  
  // 添加移动图标
  const icon = document.createElement('span');
  icon.textContent = '📋';
  icon.style.fontSize = '14px';
  preview.appendChild(icon);
  
  // 添加文本
  const text = document.createElement('span');
  text.textContent = `移动 "${props.bookmark.title}"`;
  text.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
  preview.appendChild(text);
  
  document.body.appendChild(preview);
  
  // 延迟移除预览元素
  setTimeout(() => {
    if (document.body.contains(preview)) {
      document.body.removeChild(preview);
    }
  }, 100);
  
  return preview;
};

const createDragGhost = (element: HTMLElement) => {
  // 创建拖拽时的幽灵效果
  const ghost = element.cloneNode(true) as HTMLElement;
  ghost.style.cssText = `
    position: fixed;
    top: -9999px;
    left: -9999px;
    pointer-events: none;
    opacity: 0.8;
    transform: rotate(2deg) scale(0.95);
    z-index: 9999;
    transition: all 0.2s ease;
  `;
  
  document.body.appendChild(ghost);
  
  // 设置清理定时器
  setTimeout(() => {
    if (document.body.contains(ghost)) {
      document.body.removeChild(ghost);
    }
  }, 1000);
};

const handleDragEnd = () => {
  isDragging.value = false;
  
  // 移除拖拽状态样式
  const dragElements = document.querySelectorAll('.dragging');
  dragElements.forEach(el => {
    el.classList.remove('dragging');
    // 添加恢复动画
    el.style.animation = 'dragRestore 0.3s ease';
    setTimeout(() => {
      el.style.animation = '';
    }, 300);
  });
  
  // 清理任何剩余的幽灵元素
  const ghosts = document.querySelectorAll('[data-drag-ghost]');
  ghosts.forEach(ghost => ghost.remove());
};

const updateFavicon = async () => {
  try {
    updatingFavicon.value = true;
    
    // 先清除本地缓存
    const domain = extractDomain(props.bookmark.url);
    await browser.storage.local.remove(['favicon_cache']);
    
    // 强制更新favicon
    await BookmarkManager.updateBookmarkFavicon(props.bookmark.id);
    
    // 强制重新加载图标
    const faviconImg = document.querySelector(`.favicon[data-bookmark-id="${props.bookmark.id}"]`) as HTMLImageElement;
    if (faviconImg) {
      // 添加时间戳强制刷新
      const timestamp = Date.now();
      faviconImg.src = `${props.bookmark.favicon}?t=${timestamp}`;
    }
    
    emit('favicon-updated');
    ElMessage.success('图标更新成功');
  } catch (error) {
    console.error('Failed to update favicon:', error);
    ElMessage.error('图标更新失败');
  } finally {
    updatingFavicon.value = false;
  }
};

const handleFaviconError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  img.src = defaultFavicon;
};

// 辅助函数：从URL提取域名
const extractDomain = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }
};
</script>

<style scoped>
.bookmark-card {
  background: white;
  border: 1px solid #e1e5e9;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 4px;
  cursor: grab;
  transition: all 0.2s ease;
  position: relative;
}

.bookmark-card:active {
  cursor: grabbing;
}

.bookmark-card:hover {
  border-color: #1890ff;
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.1);
  transform: translateY(-1px);
}

.bookmark-content {
  width: 100%;
}

.bookmark-header {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  position: relative;
}

.favicon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  margin-top: 1px;
}

.bookmark-info {
  flex: 1;
  min-width: 0;
}

.bookmark-title {
  margin: 0 0 2px 0;
  font-size: 13px;
  font-weight: 500;
  color: #333;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-url {
  margin: 0;
  font-size: 11px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-actions {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  gap: 2px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 3px;
  padding: 1px;
}

.bookmark-tags {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.tag-item {
  font-size: 10px;
}

.bookmark-description {
  margin-top: 6px;
  font-size: 11px;
  color: #666;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 拖拽状态 */
.bookmark-card.is-dragging {
  opacity: 0.4;
  transform: scale(0.9) rotate(3deg);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 8px 25px rgba(24, 144, 255, 0.3);
  border: 2px dashed #1890ff;
  background: linear-gradient(135deg, #f0f9ff 0%, #e6f7ff 100%);
}

.bookmark-card:global(.dragging) {
  opacity: 0.6;
  transform: scale(0.92) rotate(1deg);
  box-shadow: 0 6px 20px rgba(24, 144, 255, 0.25);
}

.bookmark-card:active {
  opacity: 0.8;
  transform: scale(0.98);
}

/* 拖拽时的全局样式 */
.bookmark-card.dragging {
  cursor: grabbing !important;
}

/* 拖拽恢复动画 */
@keyframes dragRestore {
  0% { transform: scale(0.9) rotate(3deg); opacity: 0.6; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}

/* 拖拽悬停效果 */
.bookmark-card:hover.is-dragging {
  transform: scale(0.92) rotate(2deg);
  box-shadow: 0 10px 30px rgba(24, 144, 255, 0.4);
}
</style>
