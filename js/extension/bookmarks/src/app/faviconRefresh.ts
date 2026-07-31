import type { InjectionKey, Ref } from 'vue';

export const faviconRefreshTokenKey: InjectionKey<Ref<number>> = Symbol('favicon-refresh-token');
