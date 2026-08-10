<script setup lang="ts">
    import { computed, onBeforeUnmount, ref, watch } from 'vue';
    import { Search, Tag } from 'lucide-vue-next';
    import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui';
    import type { TagSummary } from '../../types/bookmark';
    import { normalizeTag } from '../../services/searchService';

    const props = defineProps<{
        tags: TagSummary[];
        query: string;
        open: boolean;
    }>();

    const emit = defineEmits<{
        'select': [tag: TagSummary];
        'update:open': [value: boolean];
    }>();

    const filter = ref('');
    let closeTimer: number | undefined;

    const currentTag = computed(() => {
        const value = props.query.trimStart();
        if (!value.startsWith('#')) return '';
        return normalizeTag(value.slice(1));
    });

    const filteredTags = computed(() => {
        const value = normalizeTag(filter.value);
        if (!value) return props.tags;
        return props.tags.filter((tag) => tag.normalizedName.includes(value));
    });

    function selectTag(tag: TagSummary) {
        emit('select', tag);
        closePanel();
    }

    function openPanel() {
        window.clearTimeout(closeTimer);
        emit('update:open', true);
    }

    function scheduleClosePanel() {
        window.clearTimeout(closeTimer);
        closeTimer = window.setTimeout(closePanel, 140);
    }

    function closePanel() {
        window.clearTimeout(closeTimer);
        if (!props.open) return;
        filter.value = '';
        emit('update:open', false);
    }

    function updateOpen(value: boolean) {
        if (value) openPanel();
        else closePanel();
    }

    onBeforeUnmount(() => window.clearTimeout(closeTimer));
    watch(
        () => props.open,
        (open) => {
            if (!open) filter.value = '';
        },
    );
</script>

<template>
    <PopoverRoot v-if="tags.length" :open="open" @update:open="updateOpen">
        <PopoverAnchor as-child>
            <button
                class="tag-panel-trigger"
                type="button"
                aria-label="打开标签筛选"
                aria-haspopup="dialog"
                :aria-expanded="open"
                @pointerenter="openPanel"
                @pointerleave="scheduleClosePanel"
                @focus="openPanel"
                @click="openPanel"
            >
                <Tag :size="15" />
            </button>
        </PopoverAnchor>
        <PopoverPortal>
            <PopoverContent
                class="tag-panel"
                side="right"
                align="start"
                :side-offset="0"
                @pointerenter="openPanel"
                @pointerleave="scheduleClosePanel"
                @focusin="openPanel"
                @close-auto-focus="$event.preventDefault()"
            >
                <label class="tag-panel-search">
                    <Search :size="14" />
                    <input v-model="filter" type="text" autocomplete="off" aria-label="筛选标签" />
                </label>
                <div class="tag-panel-list" role="listbox" aria-label="标签列表">
                    <button
                        v-for="tag in filteredTags"
                        :key="tag.normalizedName"
                        class="tag-panel-row"
                        :class="{ current: currentTag === tag.normalizedName }"
                        type="button"
                        role="option"
                        :aria-selected="currentTag === tag.normalizedName"
                        @click="selectTag(tag)"
                    >
                        <span>#{{ tag.name }}</span>
                        <small v-if="tag.searchCapability">搜索能力</small>
                        <strong>{{ tag.count }}</strong>
                    </button>
                    <p v-if="!filteredTags.length" class="tag-panel-empty">没有匹配标签</p>
                </div>
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>
