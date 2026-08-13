<script setup lang="ts">
    import { AlertTriangle, X } from 'lucide-vue-next';
    import { nextTick, ref } from 'vue';
    import {
        AlertDialogCancel,
        AlertDialogContent,
        AlertDialogDescription,
        AlertDialogOverlay,
        AlertDialogPortal,
        AlertDialogRoot,
        AlertDialogTitle,
    } from 'reka-ui';

    const props = defineProps<{
        open: boolean;
        title: string;
        description: string;
        confirmText?: string;
        danger?: boolean;
        error?: string;
        pending?: boolean;
    }>();

    const emit = defineEmits<{
        close: [];
        confirm: [];
    }>();

    function updateOpen(value: boolean) {
        if (!value && !props.pending) emit('close');
    }

    const confirmButton = ref<HTMLButtonElement>();

    function focusConfirm(event: Event) {
        event.preventDefault();
        void nextTick(() => confirmButton.value?.focus());
    }

    function confirmOnEnter(event: KeyboardEvent) {
        if (event.isComposing || props.pending) return;
        event.preventDefault();
        event.stopPropagation();
        emit('confirm');
    }
</script>

<template>
    <AlertDialogRoot :open="open" @update:open="updateOpen">
        <AlertDialogPortal>
            <AlertDialogOverlay class="dialog-overlay" />
            <AlertDialogContent
                class="dialog-content confirm-dialog"
                @open-auto-focus="focusConfirm"
                @escape-key-down="pending && $event.preventDefault()"
                @keydown.enter="confirmOnEnter"
            >
                <header class="dialog-head">
                    <div class="confirm-title">
                        <span class="confirm-icon">
                            <AlertTriangle :size="18" />
                        </span>
                        <div class="confirm-copy">
                            <AlertDialogTitle>{{ title }}</AlertDialogTitle>
                        </div>
                    </div>
                    <button type="button" aria-label="关闭" :disabled="pending" @click="emit('close')">
                        <X :size="18" />
                    </button>
                </header>
                <div class="confirm-body">
                    <AlertDialogDescription>{{ description }}</AlertDialogDescription>
                    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
                </div>
                <footer class="dialog-foot confirm-actions">
                    <AlertDialogCancel class="button-secondary" :disabled="pending" @click="emit('close')"
                        >取消</AlertDialogCancel
                    >
                    <button
                        ref="confirmButton"
                        type="button"
                        class="button-primary"
                        :class="{ 'button-danger': danger }"
                        :disabled="pending"
                        @click="emit('confirm')"
                    >
                        {{ confirmText || '确认' }}
                    </button>
                </footer>
            </AlertDialogContent>
        </AlertDialogPortal>
    </AlertDialogRoot>
</template>
