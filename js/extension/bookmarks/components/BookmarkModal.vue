<template>
  <el-dialog
    :model-value="visible"
    :title="isEdit ? '编辑书签' : '添加书签'"
    width="500px"
    @close="handleClose"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="80px"
      @submit.prevent="handleSubmit"
    >
      <el-form-item label="标题" prop="title">
        <el-input
          v-model="form.title"
          placeholder="请输入书签标题"
          maxlength="100"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="URL" prop="url">
        <el-input
          v-model="form.url"
          placeholder="请输入网址"
        />
      </el-form-item>

      <!-- 搜索URL字段，仅在包含search标签时显示 -->
      <el-form-item
        v-if="hasSearchTag"
        label="搜索URL"
        prop="searchUrl"
      >
        <el-input
          v-model="form.searchUrl"
          placeholder="请输入搜索URL，包含${keyword}占位符，如：https://www.google.com/search?q=${keyword}"
        />
        <div class="search-url-hint">
          <el-icon><InfoFilled /></el-icon>
          搜索URL必须包含 <code>${keyword}</code> 占位符，用于替换搜索关键词
        </div>
      </el-form-item>

      <el-form-item label="文件夹" prop="folderId">
        <el-select
          v-model="form.folderId"
          placeholder="选择文件夹"
          style="width: 100%"
        >
          <el-option
            v-for="folder in folders"
            :key="folder.id"
            :label="folder.title"
            :value="folder.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="标签">
        <el-select
          v-model="form.tags"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="选择或输入标签"
          style="width: 100%"
          @change="handleTagsChange"
        >
          <el-option-group label="搜索引擎标签">
            <el-option
              label="search - 搜索引擎"
              value="search"
            >
              <span>search</span>
              <span style="color: #8492a6; font-size: 12px; margin-left: 8px;">
                - 搜索引擎，URL需包含${keyword}占位符
              </span>
            </el-option>
            <el-option
              label="search_site - 站内搜索"
              value="search_site"
            >
              <span>search_site</span>
              <span style="color: #8492a6; font-size: 12px; margin-left: 8px;">
                - 站内搜索，URL为网站根地址
              </span>
            </el-option>
          </el-option-group>
          <el-option-group label="其他标签" v-if="otherTags.length > 0">
            <el-option
              v-for="tag in otherTags"
              :key="tag"
              :label="tag"
              :value="tag"
            />
          </el-option-group>
        </el-select>
        <div class="tag-hint">
          <div>• <strong>search</strong>: 搜索引擎标签，URL需包含 <code>${keyword}</code> 占位符</div>
          <div>• <strong>search_site</strong>: 站内搜索标签，URL为网站根地址</div>
          <div>• 可以输入新标签，按回车添加</div>
        </div>
      </el-form-item>

      <el-form-item label="描述">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          placeholder="请输入书签描述（可选）"
          maxlength="500"
          show-word-limit
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <div class="footer-left">
          <el-button
            v-if="isEdit"
            @click="updateFavicon"
            :loading="updatingFavicon"
            :icon="Refresh"
          >
            更新图标
          </el-button>
        </div>
        <div class="footer-right">
          <el-button @click="handleClose">取消</el-button>
          <el-button
            type="primary"
            @click="handleSubmit"
            :loading="loading"
          >
            {{ isEdit ? '保存' : '添加' }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { ElDialog, ElForm, ElFormItem, ElInput, ElSelect, ElOption, ElOptionGroup, ElButton, ElMessage, ElIcon } from 'element-plus';
import { Refresh, InfoFilled } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import type { Bookmark, Folder } from '@/types/bookmark';
import { BookmarkManager } from '@/utils/bookmarkManager';

// Props
interface Props {
  visible: boolean;
  bookmark?: Bookmark;
  defaultFolderId?: string;
  defaultUrl?: string;
  defaultTitle?: string;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  bookmark: undefined,
  defaultFolderId: '',
  defaultUrl: '',
  defaultTitle: ''
});

// Emits
const emit = defineEmits<{
  'update:visible': [visible: boolean];
  'success': [];
}>();

// Refs
const formRef = ref<FormInstance>();

// State
const loading = ref(false);
const updatingFavicon = ref(false);
const folders = ref<Folder[]>([]);
const availableTags = ref<string[]>([]);

// Form data
const form = reactive({
  title: '',
  url: '',
  folderId: '',
  tags: [] as string[],
  description: '',
  searchUrl: ''
});

// Computed
const isEdit = computed(() => !!props.bookmark);

const hasSearchTag = computed(() => form.tags.includes('search'));

const otherTags = computed(() =>
  availableTags.value.filter(tag => !['search', 'search_site'].includes(tag))
);

// Form rules
const rules: FormRules = {
  title: [
    { required: true, message: '请输入书签标题', trigger: 'blur' },
    { min: 1, max: 100, message: '标题长度在 1 到 100 个字符', trigger: 'blur' }
  ],
  url: [
    { required: true, message: '请输入网址', trigger: 'blur' },
    { type: 'url', message: '请输入有效的网址', trigger: 'blur' }
  ],
  folderId: [
    { required: true, message: '请选择文件夹', trigger: 'change' }
  ],
  searchUrl: [
    {
      validator: (rule: any, value: string, callback: any) => {
        if (hasSearchTag.value) {
          if (!value) {
            callback(new Error('包含search标签时，搜索URL为必填项'));
          } else if (!value.includes('${keyword}')) {
            callback(new Error('搜索URL必须包含${keyword}占位符'));
          } else {
            callback();
          }
        } else {
          callback();
        }
      },
      trigger: 'blur'
    }
  ]
};

// Methods
const loadData = async () => {
  try {
    // 加载文件夹列表
    folders.value = await BookmarkManager.getAllData().then(data => data.folders);

    // 加载可用标签
    availableTags.value = await BookmarkManager.getAllTags();
  } catch (error) {
    console.error('Failed to load data:', error);
  }
};

const handleTagsChange = (value: string[]) => {
  // 标签变化处理
};

const resetForm = () => {
  form.title = props.defaultTitle || '';
  form.url = props.defaultUrl || '';
  form.folderId = props.defaultFolderId || '';
  form.tags = [];
  form.description = '';
  form.searchUrl = '';

  if (props.bookmark) {
    // 编辑模式，填充现有数据
    form.title = props.bookmark.title;
    form.url = props.bookmark.url;
    form.folderId = props.bookmark.folderId;
    form.tags = Array.isArray(props.bookmark.tags) ? [...props.bookmark.tags] : [];
    form.description = props.bookmark.description;
    form.searchUrl = props.bookmark.searchUrl || '';
  }

  // 如果没有指定文件夹，选择第一个文件夹
  if (!form.folderId && folders.value.length > 0) {
    form.folderId = folders.value[0].id;
  }
};

const handleSubmit = async () => {
  if (!formRef.value) return;

  try {
    await formRef.value.validate();
    loading.value = true;

    // 确保tags是数组
    const tagsToSave = Array.isArray(form.tags) ? [...form.tags] : [];

    if (isEdit.value && props.bookmark) {
      // 编辑书签
      await BookmarkManager.editBookmark(props.bookmark.id, {
        title: form.title,
        url: form.url,
        folderId: form.folderId,
        tags: tagsToSave,
        description: form.description,
        searchUrl: form.searchUrl
      });
      ElMessage.success('书签更新成功');
    } else {
      // 添加书签
      await BookmarkManager.addBookmark({
        title: form.title,
        url: form.url,
        folderId: form.folderId,
        tags: tagsToSave,
        description: form.description,
        searchUrl: form.searchUrl
      });
      ElMessage.success('书签添加成功');
    }

    emit('success');
    handleClose();
  } catch (error) {
    console.error('Failed to save bookmark:', error);
    ElMessage.error('保存失败，请重试');
  } finally {
    loading.value = false;
  }
};

const updateFavicon = async () => {
  if (!props.bookmark) return;

  try {
    updatingFavicon.value = true;
    await BookmarkManager.updateBookmarkFavicon(props.bookmark.id);
    ElMessage.success('图标更新成功');
  } catch (error) {
    console.error('Failed to update favicon:', error);
    ElMessage.error('图标更新失败');
  } finally {
    updatingFavicon.value = false;
  }
};

const handleClose = () => {
  emit('update:visible', false);
  // 重置表单验证状态
  nextTick(() => {
    formRef.value?.clearValidate();
  });
};

// 监听visible变化
watch(() => props.visible, async (newVisible) => {
  if (newVisible) {
    await loadData();
    resetForm();
  }
});

// 监听bookmark变化
watch(() => props.bookmark, () => {
  if (props.visible) {
    resetForm();
  }
});

// 监听tags变化，当添加search标签时自动填充searchUrl
watch(() => form.tags, (newTags, oldTags) => {
  const hasSearchNow = newTags.includes('search');
  const hadSearchBefore = oldTags?.includes('search');

  if (hasSearchNow && !hadSearchBefore) {
    // 刚添加search标签，自动填充searchUrl
    if (!form.searchUrl && form.url) {
      // 尝试从URL生成搜索URL
      try {
        const url = new URL(form.url);
        if (url.hostname.includes('google')) {
          form.searchUrl = `${url.origin}/search?q=\${keyword}`;
        } else if (url.hostname.includes('baidu')) {
          form.searchUrl = `${url.origin}/s?wd=\${keyword}`;
        } else if (url.hostname.includes('bing')) {
          form.searchUrl = `${url.origin}/search?q=\${keyword}`;
        } else {
          // 默认模板
          form.searchUrl = `${form.url}?q=\${keyword}`;
        }
      } catch {
        // URL解析失败，使用默认模板
        form.searchUrl = `${form.url}?q=\${keyword}`;
      }
    }
  } else if (!hasSearchNow && hadSearchBefore) {
    // 移除了search标签，清空searchUrl
    form.searchUrl = '';
  }
}, { deep: true });
</script>

<style scoped>
.tag-hint {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-left {
  flex: 1;
}

.footer-right {
  display: flex;
  gap: 12px;
}

:deep(.el-form-item__label) {
  font-weight: 500;
}

:deep(.el-input__count) {
  font-size: 12px;
}

.search-url-hint {
  margin-top: 8px;
  padding: 8px 12px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 4px;
  font-size: 12px;
  color: #0369a1;
  display: flex;
  align-items: center;
  gap: 4px;
}

.search-url-hint code {
  background: #e0f2fe;
  padding: 2px 4px;
  border-radius: 2px;
  font-family: 'Courier New', monospace;
  font-weight: bold;
}
</style>
