import { onBeforeUnmount, provide, ref } from 'vue';
import { faviconRefreshTokenKey } from './faviconRefresh';

export function useFaviconRefresh() {
    const token = ref(Date.now());
    const refreshing = ref(false);
    let timer: number | undefined;

    provide(faviconRefreshTokenKey, token);

    function refreshAll() {
        token.value = Date.now();
        refreshing.value = true;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
            refreshing.value = false;
        }, 650);
    }

    onBeforeUnmount(() => window.clearTimeout(timer));

    return { token, refreshing, refreshAll };
}
