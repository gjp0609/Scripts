<template>
  <div class="tag-sidebar">
    <div class="sidebar-header">
      <h3>标签筛选</h3>
      <el-button
        v-if="selectedTag"
        type=""
        size="small"
        @click="clearFilter"
      >
        清除筛选
      </el-button>
    </div>

    <div class="tag-list">
      <div
        v-for="tag in tags"
        :key="tag"
        :class="['tag-item', { active: selectedTag === tag }]"
        @click="selectTag(tag)"
      >
        <span class="tag-name">{{ tag }}</span>
        <span class="tag-count">{{ getTagCount(tag) }}</span>
      </div>

      <div v-if="tags.length === 0" class="no-tags">
        暂无标签
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ElButton } from 'element-plus';
import type { BookmarkData } from '@/types/bookmark';
import { BookmarkManager } from '@/utils/bookmarkManager';

// Props
interface Props {
  selectedTag?: string;
  bookmarkData?: BookmarkData;
}

const props = withDefaults(defineProps<Props>(), {
  selectedTag: '',
  bookmarkData: undefined
});

// Emits
const emit = defineEmits<{
  'tag-selected': [tag: string];
  'filter-cleared': [];
}>();

// State
const tags = ref<string[]>([]);
const tagCounts = ref<Record<string, number>>({});

// Computed
const selectedTag = computed(() => props.selectedTag);

// Methods
const loadTags = async () => {
  try {
    const allTags = await BookmarkManager.getAllTags();
    tags.value = allTags.sort();

    // 计算每个标签的书签数量
    const data = props.bookmarkData || await BookmarkManager.getAllData();
    const counts: Record<string, number> = {};

    for (const folder of data.folders) {
      for (const bookmark of folder.bookmarks) {
        for (const tag of bookmark.tags) {
          counts[tag] = (counts[tag] || 0) + 1;
        }
      }
    }

    tagCounts.value = counts;
  } catch (error) {
    console.error('Failed to load tags:', error);
    tags.value = [];
    tagCounts.value = {};
  }
};

const selectTag = (tag: string) => {
  if (selectedTag.value === tag) {
    // 如果点击的是已选中的标签，则取消选择
    clearFilter();
  } else {
    emit('tag-selected', tag);
  }
};

const clearFilter = () => {
  emit('filter-cleared');
};

const getTagCount = (tag: string): number => {
  return tagCounts.value[tag] || 0;
};

// 监听bookmarkData变化，重新计算标签
watch(() => props.bookmarkData, () => {
  if (props.bookmarkData) {
    loadTags();
  }
}, { deep: true });

onMounted(() => {
  loadTags();
});

// 暴露方法给父组件
defineExpose({
  refresh: loadTags
});
</script>

<style scoped>
.tag-sidebar {
  width: 200px;
  background: #fafbfc;
  border-right: 1px solid #e1e5e9;
  height: 100%;
  overflow-y: auto;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #e1e5e9;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.tag-list {
  padding: 8px 0;
}

.tag-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.tag-item:hover {
  background-color: #f0f2f5;
}

.tag-item.active {
  background-color: #e6f7ff;
  border-right: 3px solid #1890ff;
}

.tag-name {
  font-size: 13px;
  color: #333;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-count {
  font-size: 12px;
  color: #666;
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
}

.tag-item.active .tag-count {
  background: #1890ff;
  color: white;
}

.no-tags {
  padding: 20px 16px;
  text-align: center;
  color: #999;
  font-size: 13px;
}
</style>
