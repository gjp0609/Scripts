<script setup lang="ts">
import { Check, ChevronDown } from 'lucide-vue-next';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import type { FolderView } from '../../types/bookmark';

const props = defineProps<{
  modelValue: string;
  folders: FolderView[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const rootRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const activeIndex = ref(0);
const listboxId = `folder-listbox-${useId()}`;

const selectedIndex = computed(() => props.folders.findIndex((folder) => folder.id === props.modelValue));
const selectedFolder = computed(() => props.folders[selectedIndex.value]);

function normalizeIndex(index: number) {
  if (!props.folders.length) return 0;
  return Math.min(Math.max(index, 0), props.folders.length - 1);
}

function openList() {
  if (!props.folders.length) return;
  activeIndex.value = normalizeIndex(selectedIndex.value >= 0 ? selectedIndex.value : 0);
  open.value = true;
}

function closeList(restoreFocus = false) {
  open.value = false;
  if (restoreFocus) void nextTick(() => triggerRef.value?.focus());
}

function selectFolder(index: number) {
  const folder = props.folders[index];
  if (!folder) return;
  emit('update:modelValue', folder.id);
  closeList(true);
}

function toggleList() {
  if (open.value) closeList();
  else openList();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault();
    event.stopPropagation();
    closeList(true);
    return;
  }

  if (event.key === 'Tab') {
    closeList();
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!open.value) {
      openList();
      return;
    }
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    activeIndex.value = normalizeIndex(activeIndex.value + delta);
    return;
  }

  if (event.key === 'Home' || event.key === 'End') {
    if (!open.value) return;
    event.preventDefault();
    activeIndex.value = event.key === 'Home' ? 0 : props.folders.length - 1;
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (open.value) selectFolder(activeIndex.value);
    else openList();
  }
}

function handleOutsidePointer(event: PointerEvent) {
  if (!open.value || rootRef.value?.contains(event.target as Node)) return;
  closeList();
}

watch(
  () => props.modelValue,
  () => {
    if (open.value) activeIndex.value = normalizeIndex(selectedIndex.value);
  }
);

onMounted(() => {
  document.addEventListener('pointerdown', handleOutsidePointer);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsidePointer);
});
</script>

<template>
  <div ref="rootRef" class="folder-select" @keydown="handleKeydown">
    <button
      ref="triggerRef"
      class="folder-select-trigger"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="listboxId"
      :aria-activedescendant="open ? `${listboxId}-option-${activeIndex}` : undefined"
      :disabled="folders.length === 0"
      @click="toggleList"
    >
      <span>{{ selectedFolder?.title || '暂无可用目录' }}</span>
      <ChevronDown :size="16" :class="{ open }" />
    </button>

    <div v-if="open" :id="listboxId" class="folder-select-list" role="listbox">
      <button
        v-for="(folder, index) in folders"
        :id="`${listboxId}-option-${index}`"
        :key="folder.id"
        class="folder-select-option"
        :class="{ active: index === activeIndex, selected: folder.id === modelValue }"
        type="button"
        role="option"
        tabindex="-1"
        :aria-selected="folder.id === modelValue"
        @mouseenter="activeIndex = index"
        @click="selectFolder(index)"
      >
        <span>{{ folder.title }}</span>
        <Check v-if="folder.id === modelValue" :size="15" />
      </button>
    </div>
  </div>
</template>
