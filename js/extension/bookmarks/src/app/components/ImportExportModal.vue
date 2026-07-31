<script setup lang="ts">
import { Download, FileUp, X } from 'lucide-vue-next';
import { ref } from 'vue';
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';

const props = defineProps<{
  open: boolean;
  busy?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  close: [];
  'export-full': [];
  'import-full': [file: File];
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
      <DialogOverlay class="dialog-overlay" />
      <DialogContent class="dialog-content import-export-dialog" :disable-outside-pointer-events="busy" @escape-key-down="busy && $event.preventDefault()" @pointer-down-outside="busy && $event.preventDefault()">
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
              <strong>导出当前数据</strong>
              <span>导出当前书签、标签、备注、搜索 URL 和界面偏好；文件名自动带日期时间。</span>
            </div>
            <button class="button-secondary import-export-action" type="button" :disabled="busy" @click="emit('export-full')">
              <Download :size="14" />
              <span>导出全量</span>
            </button>
          </div>
          <div class="import-export-row">
            <div class="import-export-copy">
              <strong>导入全量数据</strong>
              <span>增量新增导入；同名目录合并，新导入内容追加到目标目录末尾；完全相同的数据会直接跳过。</span>
            </div>
            <button class="button-primary import-export-action" type="button" :disabled="busy" @click="pickFile(fullInputRef)">
              <FileUp :size="14" />
              <span>导入全量</span>
            </button>
          </div>
        </section>

        <p v-if="error" class="import-export-error">{{ error }}</p>
      </div>

      <input ref="fullInputRef" hidden type="file" accept=".json,application/json" @change="emitSelectedFile($event)" />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
