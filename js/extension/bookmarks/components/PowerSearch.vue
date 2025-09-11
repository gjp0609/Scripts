<template>
  <div class="power-search">
    <div class="search-container">
      <el-input
        v-model="searchQuery"
        :placeholder="placeholder"
        size="large"
        @keydown="handleKeydown"
        @input="handleInput"
        ref="searchInput"
        class="search-input"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>

      <!-- 搜索引擎下拉列表 -->
      <div
        v-if="showEngineList"
        class="engine-dropdown"
        ref="engineDropdown"
      >
        <div class="engine-header">选择搜索引擎：</div>
        <div
          v-for="(engine, index) in searchEngines"
          :key="engine.id"
          :class="['engine-item', { active: selectedEngineIndex === index }]"
          @click="selectEngine(engine)"
          @mouseenter="selectedEngineIndex = index"
        >
          <div class="engine-title">{{ engine.title }}</div>
          <div class="engine-type">
            <el-tag
              :type="engine.tags.includes('search') ? 'primary' : 'success'"
              size="small"
            >
              {{ engine.tags.includes('search') ? '搜索引擎' : '站内搜索' }}
            </el-tag>
          </div>
        </div>
        <div v-if="searchEngines.length === 0" class="no-engines">
          暂无可用的搜索引擎
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { ElInput, ElIcon, ElTag, ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import type { SearchEngine } from '@/types/bookmark';
import { BookmarkManager } from '@/utils/bookmarkManager';

// Props
interface Props {
  modelValue?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: ''
});

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: string];
  'search': [query: string];
}>();

// Refs
const searchInput = ref<InstanceType<typeof ElInput>>();
const engineDropdown = ref<HTMLElement>();

// State
const searchQuery = ref(props.modelValue);
const showEngineList = ref(false);
const searchEngines = ref<SearchEngine[]>([]);
const selectedEngineIndex = ref(0);
const isSearchMode = ref(false);
const currentKeyword = ref('');

// Computed
const cleanQuery = computed(() => {
  if (isSearchMode.value) {
    return searchQuery.value.replace(/^[!！]\s*/, '');
  }
  return searchQuery.value;
});

const placeholder = computed(() => {
  if (isSearchMode.value) {
    return `输入关键词搜索 (当前有 ${searchEngines.value.length} 个搜索引擎)`;
  }
  return '空格开头搜索书签，否则使用搜索引擎';
});

// Methods
const handleInput = (value: string) => {
  searchQuery.value = value;
  emit('update:modelValue', value);

  // 智能判断搜索模式
  if (value.match(/^\s+/)) {
    // 空格开头：搜索书签模式
    if (isSearchMode.value) {
      exitSearchMode();
    }
    // 触发书签搜索（保留原始值，让父组件处理空格逻辑）
    emit('search', value);
  } else if (value.match(/^[!！]\s/)) {
    // !开头：搜索引擎模式
    if (!isSearchMode.value) {
      enterSearchMode();
    }
    currentKeyword.value = value.replace(/^[!！]\s*/, '');
  } else {
    // 普通文本：默认搜索引擎模式
    if (!isSearchMode.value && value.trim()) {
      enterSearchMode();
      currentKeyword.value = value.trim();
    } else if (!value.trim() && isSearchMode.value) {
      exitSearchMode();
    }
  }
};

const handleKeydown = async (event: KeyboardEvent) => {
  if (showEngineList.value) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedEngineIndex.value = Math.min(
          selectedEngineIndex.value + 1,
          searchEngines.value.length - 1
        );
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedEngineIndex.value = Math.max(selectedEngineIndex.value - 1, 0);
        break;
      case 'Enter':
        event.preventDefault();
        if (searchEngines.value[selectedEngineIndex.value]) {
          await executeSearch(searchEngines.value[selectedEngineIndex.value]);
        }
        break;
      case 'Escape':
        exitSearchMode();
        break;
    }
  } else if (event.key === 'Enter') {
    // 普通搜索模式
    if (cleanQuery.value.trim()) {
      await executeNormalSearch();
    }
  }
};

const enterSearchMode = async () => {
  isSearchMode.value = true;
  showEngineList.value = true;
  selectedEngineIndex.value = 0;

  // 加载搜索引擎
  try {
    searchEngines.value = await BookmarkManager.getSearchEngines();
  } catch (error) {
    console.error('Failed to load search engines:', error);
    searchEngines.value = [];
  }

  // 定位下拉列表
  await nextTick();
  if (engineDropdown.value && searchInput.value?.$el) {
    const inputRect = searchInput.value.$el.getBoundingClientRect();
    engineDropdown.value.style.top = `${inputRect.bottom + 4}px`;
    engineDropdown.value.style.left = `${inputRect.left}px`;
    engineDropdown.value.style.width = `${Math.max(inputRect.width, 320)}px`;
  }
};

const exitSearchMode = () => {
  isSearchMode.value = false;
  showEngineList.value = false;
  selectedEngineIndex.value = 0;
  currentKeyword.value = '';
};

const selectEngine = async (engine: SearchEngine) => {
  await executeSearch(engine);
};

const executeSearch = async (engine: SearchEngine) => {
  try {
    if (currentKeyword.value.trim()) {
      await BookmarkManager.executePowerSearch(currentKeyword.value.trim(), engine);
      // 清空搜索框并退出搜索模式
      searchQuery.value = '';
      emit('update:modelValue', '');
      exitSearchMode();
    }
  } catch (error) {
    console.error('Search execution failed:', error);
    ElMessage.error('搜索执行失败，请检查搜索引擎配置');
  }
};

const executeNormalSearch = async () => {
  try {
    if (cleanQuery.value.trim()) {
      // 在搜索模式下，使用默认搜索引擎
      if (isSearchMode.value) {
        await BookmarkManager.executePowerSearch(cleanQuery.value.trim());
      }
    }
  } catch (error) {
    console.error('Normal search failed:', error);
    ElMessage.error('搜索失败，请稍后重试');
  }
};

// 点击外部关闭下拉列表
const handleClickOutside = (event: Event) => {
  if (showEngineList.value &&
      engineDropdown.value &&
      !engineDropdown.value.contains(event.target as Node) &&
      !searchInput.value?.$el.contains(event.target as Node)) {
    exitSearchMode();
  }
};

// 监听窗口滚动和大小变化，重新定位下拉列表
const handleScrollOrResize = () => {
  if (showEngineList.value && engineDropdown.value && searchInput.value?.$el) {
    const inputRect = searchInput.value.$el.getBoundingClientRect();
    engineDropdown.value.style.top = `${inputRect.bottom + 4}px`;
    engineDropdown.value.style.left = `${inputRect.left}px`;
    engineDropdown.value.style.width = `${Math.max(inputRect.width, 320)}px`;
    
    // 检查是否超出视窗底部
    const dropdownHeight = 350;
    const spaceBelow = window.innerHeight - inputRect.bottom - 4;
    if (spaceBelow < dropdownHeight && inputRect.top > dropdownHeight) {
      // 如果下方空间不足，显示在输入框上方
      engineDropdown.value.style.top = `${inputRect.top - dropdownHeight - 4}px`;
    }
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  window.addEventListener('scroll', handleScrollOrResize);
  window.addEventListener('resize', handleScrollOrResize);
});

// 清理事件监听器
const cleanup = () => {
  document.removeEventListener('click', handleClickOutside);
  window.removeEventListener('scroll', handleScrollOrResize);
  window.removeEventListener('resize', handleScrollOrResize);
};

// 在组件卸载时清理
import { onUnmounted } from 'vue';
onUnmounted(() => {
  cleanup();
});

// 监听props变化
watch(() => props.modelValue, (newValue) => {
  searchQuery.value = newValue;
});

// 暴露方法给父组件
defineExpose({
  focus: () => searchInput.value?.focus(),
  clear: () => {
    searchQuery.value = '';
    emit('update:modelValue', '');
    exitSearchMode();
  }
});
</script>

<style scoped>
.power-search {
  position: relative;
  width: 100%;
}

.search-container {
  position: relative;
}

.search-input {
  width: 100%;
}

/* 适配新设计的样式 */
.search-input :deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
}

.search-input :deep(.el-input__wrapper):hover {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

.search-input :deep(.el-input__wrapper.is-focus) {
  background: white;
  border-color: #1890ff;
  box-shadow: 0 6px 20px rgba(24, 144, 255, 0.2);
}

.search-input :deep(.el-input__inner) {
  color: #333;
  font-weight: 500;
}

.search-input :deep(.el-input__inner::placeholder) {
  color: #999;
  font-weight: 400;
}

.search-input :deep(.el-input__prefix) {
  color: #666;
}

.engine-dropdown {
  position: fixed;
  background: white;
  border: 1px solid #e1e5e9;
  border-radius: 8px;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  z-index: 9999;
  max-height: 350px;
  overflow-y: auto;
  min-width: 320px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.engine-header {
  padding: 12px 16px 8px;
  font-size: 12px;
  color: #666;
  font-weight: 500;
  border-bottom: 1px solid #f0f0f0;
}

.engine-item {
  padding: 12px 16px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background-color 0.2s;
}

.engine-item:hover,
.engine-item.active {
  background-color: #f5f7fa;
}

.engine-title {
  font-size: 14px;
  color: #333;
  font-weight: 500;
}

.engine-type {
  flex-shrink: 0;
}

.no-engines {
  padding: 20px;
  text-align: center;
  color: #999;
  font-size: 14px;
}
</style>
