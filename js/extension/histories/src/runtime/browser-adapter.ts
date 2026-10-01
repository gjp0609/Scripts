type RuntimeMessage = {
    type: string;
    [key: string]: unknown;
};

type MessageHandler = (message: RuntimeMessage, sender?: unknown) => unknown | Promise<unknown>;

type ManifestLike = {
    version?: string;
    permissions?: string[];
};

type HistorySearchQuery = {
    text: string;
    startTime: number;
    endTime?: number;
    maxResults: number;
};

type HistoryVisitsQuery = {
    url: string;
};

type BrowserHistoryItem = {
    url?: string;
    title?: string;
    lastVisitTime?: number;
    visitCount?: number;
};

type BrowserHistoryVisit = {
    visitId?: string | number;
    visitTime?: number;
    transition?: string;
    referringVisitId?: string | number;
};

type BrowserLike = {
    runtime: {
        getManifest(): ManifestLike;
        getURL(path: string): string;
        openOptionsPage(callback?: () => void): void;
        onInstalled: {
            addListener(callback: () => void): void;
        };
        onStartup?: {
            addListener(callback: () => void): void;
        };
        onMessage: {
            addListener(
                callback: (
                    message: RuntimeMessage,
                    sender: unknown,
                    sendResponse: (response?: unknown) => void,
                ) => boolean | void,
            ): void;
        };
        sendMessage(message: RuntimeMessage): Promise<unknown>;
    };
    history?: {
        search(query: HistorySearchQuery): Promise<BrowserHistoryItem[]>;
        getVisits(query: HistoryVisitsQuery): Promise<BrowserHistoryVisit[]>;
        onVisited?: {
            addListener(callback: (item: BrowserHistoryItem) => void): void;
        };
    };
    storage?: {
        local: {
            get(keys: string | string[]): Promise<Record<string, unknown>>;
            set(values: Record<string, unknown>): Promise<void>;
        };
    };
    tabs?: {
        create(properties: { url: string }): Promise<unknown>;
    };
    action?: {
        onClicked: {
            addListener(callback: () => void): void;
        };
    };
    browserAction?: {
        onClicked: {
            addListener(callback: () => void): void;
        };
    };
};

export function createRuntimeAdapter() {
    const runtime = getBrowserRuntime();

    return {
        getManifest() {
            return runtime.runtime.getManifest();
        },

        onInstalled(callback: () => void) {
            runtime.runtime.onInstalled.addListener(callback);
        },

        onStartup(callback: () => void) {
            runtime.runtime.onStartup?.addListener(callback);
        },

        onActionClicked(callback: () => void) {
            const action = runtime.action ?? runtime.browserAction;
            action?.onClicked.addListener(callback);
        },

        openOptionsPage() {
            runtime.runtime.openOptionsPage();
        },

        getExtensionUrl(path: string) {
            return runtime.runtime.getURL(path);
        },

        /** 在扩展自己的标签页中打开页面；Firefox 无 tabs 权限时退化为当前标签页跳转。 */
        async openExtensionPage(path: string): Promise<void> {
            const url = runtime.runtime.getURL(path);
            if (runtime.tabs) {
                await runtime.tabs.create({ url });
                return;
            }
            location.assign(url);
        },

        /**
         * favicon 依赖 Chromium 的 `_favicon` 内部接口，且需要 `favicon` 权限。
         * Firefox 两者都没有，返回 undefined 让调用方不渲染图标，避免退化成
         * 向第三方站点发请求而泄露浏览记录。
         */
        faviconUrl(pageUrl: string): string | undefined {
            if (!runtime.runtime.getManifest().permissions?.includes('favicon')) return undefined;
            try {
                const url = new URL(runtime.runtime.getURL('/_favicon/'));
                url.searchParams.set('pageUrl', pageUrl);
                url.searchParams.set('size', '16');
                return url.toString();
            } catch {
                return undefined;
            }
        },

        onMessage(handler: MessageHandler) {
            runtime.runtime.onMessage.addListener((message, sender, sendResponse) => {
                Promise.resolve(handler(message, sender))
                    .then((response) => {
                        if (response !== undefined) sendResponse(response);
                    })
                    .catch((error) => {
                        console.error('[histories] message handler failed', error);
                        sendResponse({
                            type: 'histories:error',
                            error: error instanceof Error ? error.message : String(error),
                        });
                    });

                return true;
            });
        },

        async sendMessage<T = unknown>(message: RuntimeMessage): Promise<T> {
            return (await runtime.runtime.sendMessage(message)) as T;
        },

        async searchHistory(query: HistorySearchQuery): Promise<BrowserHistoryItem[]> {
            if (!runtime.history) {
                throw new Error('WebExtension history API is not available.');
            }
            return await runtime.history.search(query);
        },

        async getHistoryVisits(query: HistoryVisitsQuery): Promise<BrowserHistoryVisit[]> {
            if (!runtime.history) {
                throw new Error('WebExtension history API is not available.');
            }
            return await runtime.history.getVisits(query);
        },

        onHistoryVisited(callback: (item: BrowserHistoryItem) => void) {
            runtime.history?.onVisited?.addListener(callback);
        },

        async getFrequentVisitThresholdSeconds(): Promise<number> {
            const values = await runtime.storage?.local.get('frequentVisitThresholdSeconds');
            const value = Number(values?.frequentVisitThresholdSeconds);
            return Number.isFinite(value) && value >= 0 ? value : 2;
        },

        async setFrequentVisitThresholdSeconds(value: number): Promise<void> {
            const normalized = Number.isFinite(value) && value >= 0 ? value : 2;
            await runtime.storage?.local.set({ frequentVisitThresholdSeconds: normalized });
        },

        /** 默认启动页：第一阶段固定为历史页，仅展示与保存该值。 */
        async getStartPage(): Promise<string> {
            const values = await runtime.storage?.local.get('startPage');
            return typeof values?.startPage === 'string' ? values.startPage : 'history';
        },

        async setStartPage(value: string): Promise<void> {
            await runtime.storage?.local.set({ startPage: value === 'options' ? 'options' : 'history' });
        },

        /** 时间显示制式，默认 24 小时制。 */
        async getTimeDisplay(): Promise<'24' | '12'> {
            const values = await runtime.storage?.local.get('timeDisplay');
            return values?.timeDisplay === '12' ? '12' : '24';
        },

        async setTimeDisplay(value: '24' | '12'): Promise<void> {
            await runtime.storage?.local.set({ timeDisplay: value === '12' ? '12' : '24' });
        },

        async getOpenLinksInNewTab(): Promise<boolean> {
            const values = await runtime.storage?.local.get('openLinksInNewTab');
            return values?.openLinksInNewTab !== false;
        },

        async setOpenLinksInNewTab(value: boolean): Promise<void> {
            await runtime.storage?.local.set({ openLinksInNewTab: value });
        },
    };
}

function getBrowserRuntime(): BrowserLike {
    const globalBrowser = globalThis as typeof globalThis & {
        browser?: BrowserLike;
        chrome?: BrowserLike;
    };

    if (globalBrowser.browser?.runtime) return globalBrowser.browser;
    if (globalBrowser.chrome?.runtime) return globalBrowser.chrome;
    throw new Error('WebExtension runtime API is not available.');
}
