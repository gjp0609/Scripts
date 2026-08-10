<script setup lang="ts">
    import { Bookmark, Folder, FolderPlus, Maximize2, Minimize2, Plus, X } from 'lucide-vue-next';

    defineProps<{ kind: 'bookmark' | 'folder' }>();

    const emit = defineEmits<{
        'update:kind': [value: 'bookmark' | 'folder'];
        'add-bookmark': [];
        'add-folder': [];
        'expand-all': [];
        'collapse-all': [];
        'exit': [];
    }>();
</script>

<template>
    <div class="organize-toolbar" aria-label="整理工具栏">
        <div class="organize-segments" role="group" aria-label="整理类型">
            <button :class="{ active: kind === 'bookmark' }" type="button" @click="emit('update:kind', 'bookmark')"
                ><Bookmark :size="14" /><span>书签</span></button
            >
            <button :class="{ active: kind === 'folder' }" type="button" @click="emit('update:kind', 'folder')"
                ><Folder :size="14" /><span>目录</span></button
            >
        </div>
        <button
            v-if="kind === 'bookmark'"
            type="button"
            title="全部展开"
            aria-label="全部展开"
            @click="emit('expand-all')"
            ><Maximize2 :size="15"
        /></button>
        <button
            v-if="kind === 'bookmark'"
            type="button"
            title="全部收缩"
            aria-label="全部收缩"
            @click="emit('collapse-all')"
            ><Minimize2 :size="15"
        /></button>
        <button type="button" title="添加书签" @click="emit('add-bookmark')"><Plus :size="15" /></button>
        <button type="button" title="添加目录" @click="emit('add-folder')"><FolderPlus :size="15" /></button>
        <button class="organize-exit" type="button" title="退出整理" aria-label="退出整理" @click="emit('exit')"
            ><X :size="15"
        /></button>
    </div>
</template>
