import { createRuntimeAdapter } from '../src/runtime/browser-adapter';
import { runHistorySyncJob } from '../src/jobs/history-sync-job';

export default defineBackground(() => {
    const runtime = createRuntimeAdapter();
    const activeSyncJobs = new Map<string, AbortController>();
    const pendingVisitedItems = new Map<
        string,
        { url?: string; title?: string; lastVisitTime?: number; visitCount?: number }
    >();
    let realtimeTimer: ReturnType<typeof setTimeout> | undefined;
    let syncQueue: Promise<void> = Promise.resolve();

    const history = {
        search(query: { text: string; startTime: number; endTime?: number; maxResults: number }) {
            return runtime.searchHistory(query);
        },
        getVisits(details: { url: string }) {
            return runtime.getHistoryVisits(details);
        },
    };

    function enqueueSync(
        jobId: string,
        controller: AbortController,
        options: Omit<Parameters<typeof runHistorySyncJob>[0], 'jobId' | 'history' | 'signal'>,
    ): void {
        activeSyncJobs.set(jobId, controller);
        const task = syncQueue
            .catch(() => undefined)
            .then(() => runHistorySyncJob({ jobId, history, signal: controller.signal, ...options }));
        syncQueue = task;
        void task
            .catch((error) => {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    console.error('[histories] history sync failed', error);
                }
            })
            .finally(() => {
                activeSyncJobs.delete(jobId);
            });
    }

    async function flushRealtimeVisits(): Promise<void> {
        realtimeTimer = undefined;
        const items = [...pendingVisitedItems.values()];
        pendingVisitedItems.clear();
        if (items.length === 0) return;
        const thresholdSeconds = await runtime.getFrequentVisitThresholdSeconds();
        const eventStartTime = items.reduce(
            (minimum, item) => Math.min(minimum, Number(item.lastVisitTime) || Date.now()),
            Date.now(),
        );
        enqueueSync(`realtime:${crypto.randomUUID()}`, new AbortController(), {
            mode: 'incremental',
            items,
            startTimeOverride: Math.max(0, eventStartTime - 5_000),
            frequentVisitThresholdMs: thresholdSeconds * 1000,
        });
    }

    runtime.onInstalled(() => {
        console.info('[histories] installed');
        void runtime.getFrequentVisitThresholdSeconds().then((thresholdSeconds) => {
            enqueueSync(`initial:${crypto.randomUUID()}`, new AbortController(), {
                mode: 'full',
                frequentVisitThresholdMs: thresholdSeconds * 1000,
            });

            runtime.onStartup(() => {
                void runtime.getFrequentVisitThresholdSeconds().then((thresholdSeconds) => {
                    enqueueSync(`startup:${crypto.randomUUID()}`, new AbortController(), {
                        mode: 'incremental',
                        frequentVisitThresholdMs: thresholdSeconds * 1000,
                    });
                });
            });
        });
    });

    runtime.onHistoryVisited((item) => {
        if (!item.url || item.url.trimStart().toLowerCase().startsWith('data:image/')) return;
        pendingVisitedItems.set(item.url, item);
        if (realtimeTimer === undefined) {
            realtimeTimer = setTimeout(() => void flushRealtimeVisits(), 250);
        }
    });

    runtime.onActionClicked(() => {
        runtime.openOptionsPage();
    });

    runtime.onMessage(async (message) => {
        if (message?.type === 'histories:ping') {
            return {
                type: 'histories:pong',
                version: runtime.getManifest().version,
            };
        }

        if (message?.type === 'histories:history-sync-start') {
            const requestedJobId =
                typeof message.jobId === 'string' && message.jobId.length > 0 ? message.jobId : crypto.randomUUID();
            if (activeSyncJobs.has(requestedJobId)) {
                return {
                    type: 'histories:history-sync-accepted',
                    jobId: requestedJobId,
                };
            }

            const controller = new AbortController();
            activeSyncJobs.set(requestedJobId, controller);
            void runtime
                .getFrequentVisitThresholdSeconds()
                .then((thresholdSeconds) => {
                    enqueueSync(requestedJobId, controller, {
                        mode: message.mode === 'full' ? 'full' : 'incremental',
                        frequentVisitThresholdMs: thresholdSeconds * 1000,
                    });
                })
                .catch((error) => {
                    activeSyncJobs.delete(requestedJobId);
                    console.error('[histories] failed to read sync settings', error);
                });

            return {
                type: 'histories:history-sync-accepted',
                jobId: requestedJobId,
            };
        }

        if (message?.type === 'histories:history-sync-cancel' && typeof message.jobId === 'string') {
            activeSyncJobs.get(message.jobId)?.abort();
            return {
                type: 'histories:history-sync-cancelled',
                jobId: message.jobId,
            };
        }

        return undefined;
    });
});
