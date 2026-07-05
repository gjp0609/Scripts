type RuntimeMessage = {
  type: string;
  [key: string]: unknown;
};

type MessageHandler = (message: RuntimeMessage, sender?: unknown) => unknown | Promise<unknown>;

type ManifestLike = {
  version?: string;
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
