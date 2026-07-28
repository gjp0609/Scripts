<script setup lang="ts">
import { AlertTriangle, X } from 'lucide-vue-next';
import { useModalEscape } from '../useModalEscape';

const props = defineProps<{
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  danger?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();

useModalEscape(() => props.open, () => emit('close'));
</script>

<template>
  <div v-if="open" class="modal-layer">
    <button class="modal-backdrop" type="button" aria-label="关闭" @click="emit('close')"></button>
    <section class="modal-card confirm-modal">
      <div class="modal-accent"></div>
      <header class="modal-head">
        <div class="confirm-title">
          <span class="confirm-icon">
            <AlertTriangle :size="18" />
          </span>
          <div class="confirm-copy">
            <h2>{{ title }}</h2>
            <p>此操作会立即写回浏览器书签。</p>
          </div>
        </div>
        <button type="button" aria-label="关闭" @click="emit('close')">
          <X :size="20" />
        </button>
      </header>
      <div class="confirm-body">
        <p>{{ description }}</p>
      </div>
      <footer class="modal-foot">
        <button class="ghost-pill" type="button" @click="emit('close')">取消</button>
        <button class="primary-pill" :class="{ 'danger-pill': danger }" type="button" @click="emit('confirm')">
          {{ confirmText || '确认' }}
        </button>
      </footer>
    </section>
  </div>
</template>
