<script setup lang="ts">
import { AlertTriangle, X } from 'lucide-vue-next';
import {
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle
} from 'reka-ui';

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

function updateOpen(value: boolean) {
  if (!value) emit('close');
}
</script>

<template>
  <AlertDialogRoot :open="open" @update:open="updateOpen">
    <AlertDialogPortal>
      <AlertDialogOverlay class="dialog-overlay" />
      <AlertDialogContent class="dialog-content confirm-dialog">
      <header class="dialog-head">
        <div class="confirm-title">
          <span class="confirm-icon">
            <AlertTriangle :size="18" />
          </span>
          <div class="confirm-copy">
            <AlertDialogTitle>{{ title }}</AlertDialogTitle>
          </div>
        </div>
        <button type="button" aria-label="关闭" @click="emit('close')">
          <X :size="18" />
        </button>
      </header>
      <div class="confirm-body">
        <AlertDialogDescription>{{ description }}</AlertDialogDescription>
      </div>
      <footer class="dialog-foot confirm-actions">
        <AlertDialogCancel class="button-secondary" @click="emit('close')">取消</AlertDialogCancel>
        <button type="button" class="button-primary" :class="{ 'button-danger': danger }" @click="emit('confirm')">
          {{ confirmText || '确认' }}
        </button>
      </footer>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
