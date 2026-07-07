<script setup lang="ts">
import { Download, FileJson, FileUp, X } from 'lucide-vue-next';
import { ref } from 'vue';

defineProps<{
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
  <div v-if="open" class="modal-layer">
    <button class="modal-backdrop" type="button" aria-label="关闭" @click="emit('close')"></button>
    <section class="modal-card import-export-modal">
      <div class="modal-accent"></div>
      <header class="modal-head">
        <h2>设置与导入导出</h2>
        <button type="button" aria-label="关闭" @click="emit('close')">
          <X :size="20" />
        </button>
      </header>

      <div class="import-export-body">
        <p class="import-export-intro">仅保留全量导入导出。导入时按增量新增处理：同名目录合并，新内容追加到目录末尾。</p>

        <section class="import-export-group">
          <div class="import-export-heading">
            <FileJson :size="16" />
            <strong>全量备份</strong>
          </div>
          <div class="import-export-row">
            <div class="import-export-copy">
              <strong>导出当前数据</strong>
              <span>导出当前书签、标签、备注、搜索 URL 和界面偏好；文件名自动带日期时间。</span>
            </div>
            <button class="ghost-pill" type="button" :disabled="busy" @click="emit('export-full')">
              <Download :size="14" />
              <span>导出全量</span>
            </button>
          </div>
          <div class="import-export-row">
            <div class="import-export-copy">
              <strong>导入全量数据</strong>
              <span>增量新增导入；同名目录合并，新导入内容追加到目标目录末尾；完全相同的数据会直接跳过。</span>
            </div>
            <button class="primary-pill" type="button" :disabled="busy" @click="pickFile(fullInputRef)">
              <FileUp :size="14" />
              <span>导入全量</span>
            </button>
          </div>
        </section>

        <p v-if="error" class="import-export-error">{{ error }}</p>
      </div>

      <input ref="fullInputRef" hidden type="file" accept=".json,application/json" @change="emitSelectedFile($event)" />
    </section>
  </div>
</template>
