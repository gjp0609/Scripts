import { nextTick, onBeforeUnmount, onMounted, type Ref } from 'vue';

export function useBookmarkKeyboard(options: {
    query: Ref<string>;
    showOverlay: Ref<boolean>;
    overlaySuppressed: Ref<boolean>;
    activeQuickIndex: Ref<number>;
    activeTagIndex: Ref<number>;
    engineMenuActive: Ref<boolean>;
    tagPanelActive: Ref<boolean>;
    utilityDockOpen: Ref<boolean>;
    searchInputElement: Ref<HTMLInputElement | undefined>;
    mode: Ref<'browse' | 'organize'>;
    importBusy: Ref<boolean>;
    hasOpenModal: () => boolean;
    cancelDrag: () => boolean;
    exitOrganize: () => void;
    updateQuery: (value: string) => void;
}) {
    function resetTransientSurfaces() {
        options.engineMenuActive.value = false;
        options.tagPanelActive.value = false;
        options.utilityDockOpen.value = false;
    }

    function handleEscape(event: KeyboardEvent) {
        if (options.cancelDrag()) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (options.hasOpenModal()) {
            if (options.importBusy.value) {
                event.preventDefault();
                event.stopPropagation();
            }
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (options.engineMenuActive.value || options.tagPanelActive.value || options.utilityDockOpen.value) {
            resetTransientSurfaces();
            return;
        }
        if (options.showOverlay.value) {
            options.overlaySuppressed.value = true;
            return;
        }
        if (options.query.value) {
            options.query.value = '';
            options.overlaySuppressed.value = false;
            options.activeQuickIndex.value = 0;
            options.activeTagIndex.value = 0;
            return;
        }
        if (options.mode.value === 'organize') {
            options.exitOrganize();
            return;
        }
        void nextTick(() => options.searchInputElement.value?.focus());
    }

    function isEditableTarget(target: EventTarget | null) {
        return (
            target instanceof HTMLElement &&
            Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
        );
    }

    function handleGlobalKeydown(event: KeyboardEvent) {
        if (event.defaultPrevented) return;
        if (event.key === 'Escape') {
            handleEscape(event);
            return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            options.searchInputElement.value?.focus();
            return;
        }
        if (options.hasOpenModal() || isEditableTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey)
            return;

        if (event.isComposing || event.key === 'Process' || event.key === 'Unidentified' || event.keyCode === 229) {
            options.searchInputElement.value?.focus();
            return;
        }
        if (event.key.length !== 1) return;

        event.preventDefault();
        resetTransientSurfaces();
        options.updateQuery(`${options.query.value}${event.key}`);
        void nextTick(() => {
            const input = options.searchInputElement.value;
            if (!input) return;
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        });
    }

    onMounted(() => window.addEventListener('keydown', handleGlobalKeydown));
    onBeforeUnmount(() => window.removeEventListener('keydown', handleGlobalKeydown));

    return { handleEscape, resetTransientSurfaces };
}
