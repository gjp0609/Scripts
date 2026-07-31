<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { ref, watch } from 'vue';
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import type { FolderView } from '../../types/bookmark';

const props = defineProps<{
  open: boolean;
  folder?: FolderView;
}>();

const emit = defineEmits<{
  close: [];
  save: [value: { id?: string; title: string }];
}>();

const title = ref('');

watch(
  () => [props.open, props.folder] as const,
  () => {
    title.value = props.folder?.title ?? '';
  },
  { immediate: true }
);

function updateOpen(value: boolean) {
  if (!value) emit('close');
}
</script>

<template>
  <DialogRoot :open="open" @update:open="updateOpen">
    <DialogPortal>
      <DialogOverlay class="dialog-overlay" />
      <DialogContent class="dialog-content folder-dialog">
      <header class="dialog-head">
        <div>
          <DialogTitle>{{ folder ? '编辑目录' : '添加目录' }}</DialogTitle>
          <DialogDescription class="sr-only">编辑目录名称</DialogDescription>
        </div>
        <button type="button" aria-label="关闭" @click="emit('close')">
          <X :size="18" />
        </button>
      </header>
      <form class="editor-form" @submit.prevent="emit('save', { id: folder?.id, title: title.trim() })">
        <label>
          <span>目录名称</span>
          <input v-model="title" required type="text" autofocus />
        </label>
        <footer class="dialog-foot">
          <button class="button-secondary" type="button" @click="emit('close')">取消</button>
          <button class="button-primary" type="submit">保存</button>
        </footer>
      </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
