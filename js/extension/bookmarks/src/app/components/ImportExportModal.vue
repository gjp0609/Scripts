<script setup lang="ts">
import { Download, FileCheck, FileUp, X } from 'lucide-vue-next';
import { ref } from 'vue';
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';

const props = defineProps<{
  open: boolean;
  busy?: boolean;
  error?: string;
  maintenanceResult?: string;
}>();

const emit = defineEmits<{
  close: [];
  'export-full': [];
  'import-full': [file: File];
  'repair-data': [];
}>();

const fullInputRef = ref<HTMLInputElement | null>(null);

function updateOpen(value: boolean) {
  if (!value && !props.busy) emit('close');
}

function pickFile(input: HTMLInputElement | null) {
  input?.click();
}

function emitSelectedFile(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;

  emit('import-full', file);
  input.value = '';
}
</script>

<template>
  <DialogRoot :open="open" @update:open="updateOpen">
    <DialogPortal>
      <DialogOverlay class="dialog-overlay" @pointerdown.self="!busy && emit('close')" />
      <DialogContent class="dialog-content import-export-dialog" @escape-key-down="busy && $event.preventDefault()" @pointer-down-outside="busy && $event.preventDefault()">
      <header class="dialog-head">
        <div>
          <DialogTitle>导入与导出</DialogTitle>
          <DialogDescription class="sr-only">备份或导入全部书签数据</DialogDescription>
        </div>
        <button type="button" aria-label="关闭" :disabled="busy" @click="emit('close')">
          <X :size="18" />
        </button>
      </header>

      <div class="import-export-body">
        <section class="import-export-group">
          <div class="import-export-row">
            <div class="import-export-copy">
              <strong>导出完整数据</strong>
              <span>递归导出书签栏中的直属书签、嵌套目录、全部书签数据和界面偏好。</span>
            </div>
            <button class="button-secondary import-export-action" type="button" :disabled="busy" @click="emit('export-full')">
              <Download :size="14" />
              <span>导出全量</span>
            </button>
          </div>
          <div class="import-export-row">
            <div class="import-export-copy">
              <strong>导入全量数据</strong>
              <span>按同级结构增量恢复；已有节点复用，新节点追加，并同步恢复标签、备注和界面偏好。</span>
            </div>
            <button class="button-primary import-export-action" type="button" :disabled="busy" @click="pickFile(fullInputRef)">
              <FileUp :size="14" />
              <span>导入全量</span>
            </button>
          </div>
          <div class="import-export-row">
            <div class="import-export-copy">
              <strong>校验扩展数据</strong>
              <span>清理孤立标签、恢复映射和无效偏好，不删除浏览器书签。</span>
            </div>
            <button class="button-secondary import-export-action" type="button" :disabled="busy" @click="emit('repair-data')">
              <FileCheck :size="14" />
              <span>校验并清理</span>
            </button>
          </div>
        </section>

        <p v-if="error" class="import-export-error">{{ error }}</p>
        <p v-else-if="maintenanceResult" class="import-export-success">{{ maintenanceResult }}</p>
      </div>

      <input ref="fullInputRef" hidden type="file" accept=".json,application/json" @change="emitSelectedFile($event)" />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
