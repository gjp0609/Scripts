<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [title: string];
}>();

const title = ref('');

watch(
  () => props.open,
  () => {
    title.value = '';
  }
);
</script>

<template>
  <div v-if="open" class="modal-layer">
    <button class="modal-backdrop" type="button" aria-label="关闭" @click="emit('close')"></button>
    <section class="modal-card folder-modal">
      <div class="modal-accent"></div>
      <header class="modal-head">
        <h2>添加目录</h2>
        <button type="button" aria-label="关闭" @click="emit('close')">
          <X :size="20" />
        </button>
      </header>
      <form class="modal-form" @submit.prevent="emit('save', title.trim())">
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
