type RuntimeMessage = {
  type: string;
  [key: string]: unknown;
};

type MessageHandler = (message: RuntimeMessage, sender?: unknown) => unknown | Promise<unknown>;

type ManifestLike = {
  version?: string;
};

type HistorySearchQuery = {
  text: string;
  startTime: number;
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
    openOptionsPage(callback?: () => void): void;
    onInstalled: {
      addListener(callback: () => void): void;
    };
    onMessage: {
      addListener(
        callback: (
          message: RuntimeMessage,
          sender: unknown,
          sendResponse: (response?: unknown) => void
        ) => boolean | void
      ): void;
    };
    sendMessage(message: RuntimeMessage): Promise<unknown>;
  };
  history?: {
    search(query: HistorySearchQuery): Promise<BrowserHistoryItem[]>;
    getVisits(query: HistoryVisitsQuery): Promise<BrowserHistoryVisit[]>;
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

    onActionClicked(callback: () => void) {
      const action = runtime.action ?? runtime.browserAction;
      action?.onClicked.addListener(callback);
    },

    openOptionsPage() {
      runtime.runtime.openOptionsPage();
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
              error: error instanceof Error ? error.message : String(error)
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
    }
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
