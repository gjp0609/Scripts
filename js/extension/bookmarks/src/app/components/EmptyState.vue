<script setup lang="ts">
    import { BookmarkX } from 'lucide-vue-next';

    defineProps<{
        title: string;
        description: string;
    }>();
</script>

<template>
    <div class="empty-state">
        <div class="empty-icon">
            <BookmarkX :size="30" />
        </div>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
    </div>
</template>
