import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void browser.storage.local.get('markhubInstalledAt').then((result) => {
      if (!result.markhubInstalledAt) {
        void browser.storage.local.set({ markhubInstalledAt: Date.now() });
      }
    });
  });

  browser.bookmarks.onRemoved.addListener((id) => {
    void browser.storage.local.get('markhubExtras').then((result) => {
      const extras = result.markhubExtras as Record<string, unknown> | undefined;
      if (!extras || !(id in extras)) return;

      const next = { ...extras };
      delete next[id];
      void browser.storage.local.set({ markhubExtras: next });
    });
  });
});
