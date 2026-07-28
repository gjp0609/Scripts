<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { reactive, watch } from 'vue';
import type { BookmarkView, FolderView } from '../../types/bookmark';
import { useModalEscape } from '../useModalEscape';
import FolderSelect from './FolderSelect.vue';

const props = defineProps<{
  open: boolean;
  folders: FolderView[];
  bookmark?: BookmarkView;
}>();

const emit = defineEmits<{
  close: [];
  save: [value: { id?: string; parentId: string; title: string; url: string; tags: string[]; description?: string; searchUrl?: string }];
}>();

useModalEscape(() => props.open, () => emit('close'));

const form = reactive({
  title: '',
  url: '',
  parentId: '',
  tags: '',
  description: '',
  searchUrl: ''
});

watch(
  () => [props.open, props.bookmark, props.folders] as const,
  () => {
    form.title = props.bookmark?.title ?? '';
    form.url = props.bookmark?.url ?? '';
    form.parentId = props.bookmark?.parentId ?? props.folders[0]?.id ?? '';
    form.tags = props.bookmark?.extra.tags.join(', ') ?? '';
    form.description = props.bookmark?.extra.description ?? '';
    form.searchUrl = props.bookmark?.extra.searchUrl ?? '';
  },
  { immediate: true }
);

function save() {
  emit('save', {
    id: props.bookmark?.id,
    parentId: form.parentId,
    title: form.title.trim(),
    url: form.url.trim(),
    tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    description: form.description.trim(),
    searchUrl: form.searchUrl.trim()
  });
}
</script>

<template>
  <div v-if="open" class="modal-layer">
    <button class="modal-backdrop" type="button" aria-label="关闭" @click="emit('close')"></button>
    <section class="modal-card bookmark-modal">
      <div class="modal-accent"></div>
      <header class="modal-head">
        <h2>{{ bookmark ? '编辑书签' : '添加书签' }}</h2>
        <button type="button" aria-label="关闭" @click="emit('close')">
          <X :size="20" />
        </button>
      </header>
      <form class="modal-form" @submit.prevent="save">
        <label>
          <span>标题</span>
          <input v-model="form.title" required type="text" />
        </label>
        <label>
          <span>URL</span>
          <input v-model="form.url" required type="url" />
        </label>
        <label>
          <span>目录</span>
          <FolderSelect v-model="form.parentId" :folders="folders" />
        </label>
        <label>
          <span>标签</span>
          <input v-model="form.tags" type="text" placeholder="用英文逗号分隔" />
        </label>
        <label>
          <span>备注</span>
          <textarea v-model="form.description" rows="2"></textarea>
        </label>
        <label>
          <span>搜索 URL 模板</span>
          <input v-model="form.searchUrl" type="url" placeholder="https://example.com/search?q={keyword}" />
        </label>
        <footer class="modal-foot">
          <button class="ghost-pill" type="button" @click="emit('close')">取消</button>
          <button class="primary-pill" type="submit" :disabled="!form.parentId">保存</button>
        </footer>
      </form>
    </section>
  </div>
</template>
