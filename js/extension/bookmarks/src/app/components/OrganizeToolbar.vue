<script setup lang="ts">
import { FolderPlus, Plus, RotateCcw } from 'lucide-vue-next';

const emit = defineEmits<{
  'add-bookmark': [];
  'add-folder': [];
  undo: [];
}>();
</script>

<template>
  <div class="organize-toolbar">
    <div class="organize-title">
      <strong>整理模式</strong>
      <span>拖拽调整顺序 · Ctrl Z 撤销</span>
    </div>
    <div class="organize-actions">
      <button type="button" @click="emit('add-bookmark')">
        <Plus :size="12" />
        <span>新增书签</span>
      </button>
      <button type="button" @click="emit('add-folder')">
        <FolderPlus :size="12" />
        <span>新增目录</span>
      </button>
      <button type="button" @click="emit('undo')">
        <RotateCcw :size="12" />
        <span>撤销</span>
      </button>
    </div>
  </div>
</template>
