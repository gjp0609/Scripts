<script setup lang="ts">
    import { computed, onMounted, ref } from 'vue';
    import { GripVertical, Pencil, Trash2 } from 'lucide-vue-next';
    import type { FolderView } from '../../types/bookmark';

    const props = defineProps<{ folders: FolderView[]; projectedOrder: string[]; draggingFolderId: string }>();

    const emit = defineEmits<{
        'board-ready': [element: HTMLElement];
        'edit-folder': [folder: FolderView];
        'delete-folder': [folder: FolderView];
    }>();

    const boardEl = ref<HTMLElement>();
    onMounted(() => {
        if (boardEl.value) emit('board-ready', boardEl.value);
    });

    const orderedFolders = computed(() => {
        if (!props.projectedOrder.length) return props.folders;
        const positions = new Map(props.projectedOrder.map((id, index) => [id, index]));
        return [...props.folders].sort(
            (left, right) =>
                (positions.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
                (positions.get(right.id) ?? Number.MAX_SAFE_INTEGER),
        );
    });
</script>

<template>
    <section ref="boardEl" class="folder-board folder-organize-board">
        <TransitionGroup name="folder-grid">
            <article
                v-for="folder in orderedFolders"
                :key="folder.id"
                class="folder-section"
                :class="{ 'folder-prediction': draggingFolderId === folder.id }"
                :data-folder-id="folder.id"
            >
                <header class="folder-head">
                    <button class="folder-drag-handle" type="button" aria-label="拖拽目录"
                        ><GripVertical :size="15"
                    /></button>
                    <span class="folder-title">
                        <strong>{{ folder.title }}</strong>
                        <small>{{ folder.bookmarks.length }}</small>
                    </span>
                    <span class="folder-actions">
                        <button type="button" title="编辑目录" @click="emit('edit-folder', folder)"
                            ><Pencil :size="13"
                        /></button>
                        <button class="danger" type="button" title="删除目录" @click="emit('delete-folder', folder)"
                            ><Trash2 :size="13"
                        /></button>
                    </span>
                </header>
            </article>
        </TransitionGroup>
    </section>
</template>
