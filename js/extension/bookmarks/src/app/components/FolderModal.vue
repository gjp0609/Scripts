<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { ref, watch } from 'vue';
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
  }
);
</script>

<template>
  <div v-if="open" class="modal-layer">
    <button class="modal-backdrop" type="button" aria-label="关闭" @click="emit('close')"></button>
    <section class="modal-card folder-modal">
      <div class="modal-accent"></div>
      <header class="modal-head">
        <h2>{{ folder ? '编辑目录' : '添加目录' }}</h2>
        <button type="button" aria-label="关闭" @click="emit('close')">
          <X :size="20" />
        </button>
      </header>
      <form class="modal-form" @submit.prevent="emit('save', { id: folder?.id, title: title.trim() })">
        <label>
          <span>目录名称</span>
          <input v-model="title" required type="text" />
        </label>
        <footer class="modal-foot">
          <button class="ghost-pill" type="button" @click="emit('close')">取消</button>
          <button class="primary-pill" type="submit">保存</button>
        </footer>
      </form>
    </section>
  </div>
</template>
