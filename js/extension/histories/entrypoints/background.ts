import { createRuntimeAdapter } from '../src/runtime/browser-adapter';
import { runHistorySyncJob } from '../src/jobs/history-sync-job';
import { getDatabaseSummary } from '../src/storage/database';

export default defineBackground(() => {
  const runtime = createRuntimeAdapter();
  const activeSyncJobs = new Map<string, AbortController>();

  runtime.onInstalled(() => {
    console.info('[histories] installed');
  });

  runtime.onActionClicked(() => {
    runtime.openOptionsPage();
  });

  runtime.onMessage(async (message) => {
    if (message?.type === 'histories:ping') {
      return {
        type: 'histories:pong',
        version: runtime.getManifest().version
      };
    }

    if (message?.type === 'histories:history-sync-start') {
      const summary = await getDatabaseSummary();
      if (summary.pageChunks > 0 || summary.visitChunks > 0) {
        return {
          type: 'histories:error',
          error: 'History sync is not enabled on chunk-backed imports yet. Start from an empty database or finish the merge path first.'
        };
      }

      const requestedJobId =
        typeof message.jobId === 'string' && message.jobId.length > 0 ? message.jobId : crypto.randomUUID();
      if (activeSyncJobs.has(requestedJobId)) {
        return {
          type: 'histories:history-sync-accepted',
          jobId: requestedJobId
        };
      }

      const controller = new AbortController();
      activeSyncJobs.set(requestedJobId, controller);
      void runHistorySyncJob({
        jobId: requestedJobId,
        history: {
          search(query) {
            return runtime.searchHistory(query);
          },
          getVisits(details) {
            return runtime.getHistoryVisits(details);
          }
        },
        signal: controller.signal,
        mode: message.mode === 'full' ? 'full' : 'incremental'
      }).finally(() => {
        activeSyncJobs.delete(requestedJobId);
      });

      return {
        type: 'histories:history-sync-accepted',
        jobId: requestedJobId
      };
    }

    if (message?.type === 'histories:history-sync-cancel' && typeof message.jobId === 'string') {
      activeSyncJobs.get(message.jobId)?.abort();
      return {
        type: 'histories:history-sync-cancelled',
        jobId: message.jobId
      };
    }

    return undefined;
  });
});
