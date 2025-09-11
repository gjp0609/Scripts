<template>
  <div
    class="folder-card"
    @drop="handleDrop"
    @dragover="handleDragOver"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
    :class="{ 'drag-over': isDragOver }"
  >
    <div class="folder-header">
      <div class="folder-info">
        <el-icon class="folder-icon"><Folder /></el-icon>
        <h3 class="folder-title">{{ folder.title }}</h3>
        <span class="bookmark-count">({{ folder.bookmarks.length }})</span>
      </div>

      <div class="folder-actions">
        <el-dropdown @command="handleCommand">
          <el-button type="" :icon="MoreFilled" />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="edit">重命名文件夹</el-dropdown-item>
              <el-dropdown-item command="delete" divided>删除文件夹</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="bookmarks-container">
      <div v-if="folder.bookmarks.length === 0" class="empty-folder">
        <el-icon class="empty-icon"><DocumentAdd /></el-icon>
        <p>暂无书签</p>
        <p class="empty-hint">拖拽书签到此处</p>
      </div>

      <div v-else class="bookmarks-grid">
        <BookmarkCard
          v-for="bookmark in folder.bookmarks"
          :key="bookmark.id"
          :bookmark="bookmark"
          @edit="editBookmark"
          @delete="handleBookmarkDelete"
          @drag-start="handleBookmarkDragStart"
          @favicon-updated="handleFaviconUpdated"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElButton, ElDropdown, ElDropdownMenu, ElDropdownItem, ElIcon, ElMessageBox, ElMessage } from 'element-plus';
import { Folder, MoreFilled, DocumentAdd } from '@element-plus/icons-vue';
import type { Folder as FolderType, Bookmark, DragData } from '@/types/bookmark';
import { BookmarkManager } from '@/utils/bookmarkManager';
import BookmarkCard from './BookmarkCard.vue';

// Props
interface Props {
  folder: FolderType;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  'edit-folder': [folder: FolderType];
  'delete-folder': [folderId: string];
  'edit-bookmark': [bookmark: Bookmark];
  'bookmark-moved': [];
}>();

// State
const isDragOver = ref(false);
const dragCounter = ref(0);

// Methods
const handleCommand = async (command: string) => {
  switch (command) {
    case 'edit':
      emit('edit-folder', props.folder);
      break;
    case 'delete':
      await deleteFolder();
      break;
  }
};

const deleteFolder = async () => {
  try {
    let confirmMessage = `确定要删除文件夹"${props.folder.title}"吗？`;
    if (props.folder.bookmarks.length > 0) {
      confirmMessage += `\n\n文件夹中的 ${props.folder.bookmarks.length} 个书签将被移动到"未分类"文件夹。`;
    }

    await ElMessageBox.confirm(
      confirmMessage,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );

    await BookmarkManager.deleteFolder(props.folder.id);
    emit('delete-folder', props.folder.id);
    ElMessage.success('文件夹删除成功');
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to delete folder:', error);
      ElMessage.error('删除文件夹失败');
    }
  }
};

const editBookmark = (bookmark: Bookmark) => {
  emit('edit-bookmark', bookmark);
};

const handleBookmarkDelete = () => {
  // 书签删除后刷新
  emit('bookmark-moved');
};

const handleBookmarkDragStart = (dragData: DragData) => {
  // 可以在这里处理拖拽开始的逻辑
};

const handleFaviconUpdated = () => {
  // 图标更新后刷新
  emit('bookmark-moved');
};

// 拖拽处理
const handleDragOver = (event: DragEvent) => {
  event.preventDefault();
  event.dataTransfer!.dropEffect = 'move';
};

const handleDragEnter = (event: DragEvent) => {
  event.preventDefault();
  dragCounter.value++;
  isDragOver.value = true;
  
  // 添加拖拽进入时的视觉反馈
  const folderElement = event.currentTarget as HTMLElement;
  folderElement.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
  
  // 添加触觉反馈（如果支持）
  if ('vibrate' in navigator) {
    navigator.vibrate(50);
  }
};

const handleDragLeave = (event: DragEvent) => {
  event.preventDefault();
  dragCounter.value--;
  if (dragCounter.value === 0) {
    isDragOver.value = false;
  }
};

const handleDrop = async (event: DragEvent) => {
  event.preventDefault();
  isDragOver.value = false;
  dragCounter.value = 0;

  try {
    const dragDataStr = event.dataTransfer?.getData('application/json');
    if (!dragDataStr) return;

    const dragData: DragData = JSON.parse(dragDataStr);

    if (dragData.type === 'bookmark' && dragData.sourceFolder !== props.folder.id) {
      // 添加成功动画效果
      const folderElement = event.currentTarget as HTMLElement;
      folderElement.style.animation = 'dropSuccess 0.6s ease';
      
      setTimeout(() => {
        folderElement.style.animation = '';
      }, 600);
      
      await BookmarkManager.moveBookmark(dragData.id, props.folder.id);
      emit('bookmark-moved');
      ElMessage.success('书签移动成功');
      
      // 添加触觉反馈
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }
    }
  } catch (error) {
    console.error('Failed to move bookmark:', error);
    ElMessage.error('移动书签失败');
    
    // 添加错误动画效果
    const folderElement = event.currentTarget as HTMLElement;
      folderElement.style.animation = 'dropError 0.6s ease';
      
      setTimeout(() => {
        folderElement.style.animation = '';
      }, 600);
  }
};
</script>

<style scoped>
.folder-card {
  background: white;
  border: 1px solid #e1e5e9;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s ease;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  position: relative;
}

.folder-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.folder-card.drag-over {
  border-color: #52c41a;
  background: linear-gradient(135deg, #f6ffed 0%, #e6f7ff 100%);
  box-shadow: 0 0 0 3px rgba(82, 196, 26, 0.2), 0 8px 25px rgba(82, 196, 26, 0.15);
  transform: translateY(-4px) scale(1.02);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  overflow: visible;
}

.folder-card.drag-over::before {
  content: '📫 放到此文件夹';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%);
  color: white;
  padding: 12px 20px;
  border-radius: 25px;
  font-size: 14px;
  font-weight: 600;
  z-index: 10;
  pointer-events: none;
  animation: bounce 0.6s ease-in-out infinite alternate, glow 2s ease-in-out infinite alternate;
  box-shadow: 0 4px 15px rgba(82, 196, 26, 0.4);
  backdrop-filter: blur(10px);
}

@keyframes bounce {
  0% { transform: translate(-50%, -50%) scale(1); }
  100% { transform: translate(-50%, -50%) scale(1.08); }
}

@keyframes glow {
  0% { box-shadow: 0 4px 15px rgba(82, 196, 26, 0.4); }
  100% { box-shadow: 0 4px 25px rgba(82, 196, 26, 0.6); }
}

@keyframes dropSuccess {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); background: linear-gradient(135deg, #f6ffed 0%, #b7eb8f 100%); }
  100% { transform: scale(1); }
}

@keyframes dropError {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-10px); background: linear-gradient(135deg, #fff2f0 0%, #ffccc7 100%); }
  75% { transform: translateX(10px); }
}

.folder-header {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fafbfc;
}

.folder-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.folder-icon {
  color: #1890ff;
  font-size: 16px;
}

.folder-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.bookmark-count {
  font-size: 12px;
  color: #666;
}

.folder-actions {
  opacity: 0;
  transition: opacity 0.2s;
}

.folder-card:hover .folder-actions {
  opacity: 1;
}

.bookmarks-container {
  flex: 1;
  padding: 12px 16px;
  overflow-y: auto;
  max-height: 300px;
}

.empty-folder {
  text-align: center;
  padding: 24px 16px;
  color: #999;
}

.empty-icon {
  font-size: 32px;
  color: #d9d9d9;
  margin-bottom: 8px;
}

.empty-folder p {
  margin: 4px 0;
  font-size: 12px;
}

.empty-hint {
  font-size: 12px;
  color: #bbb;
}

.bookmarks-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.folder-footer {
  padding: 12px 20px;
  border-top: 1px solid #f0f0f0;
  background: #fafbfc;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .folder-card {
    margin-bottom: 16px;
  }

  .folder-header {
    padding: 12px 16px;
  }

  .bookmarks-container {
    padding: 12px 16px;
  }

  .folder-footer {
    padding: 8px 16px;
  }
}
</style>
