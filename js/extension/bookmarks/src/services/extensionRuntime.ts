import { browser } from 'wxt/browser';

export type CurrentTab = {
  id?: number;
  title?: string;
  url?: string;
};

export async function getCurrentTab(): Promise<CurrentTab | undefined> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

export async function openAppPage(): Promise<void> {
  const runtime = (globalThis as { chrome?: { runtime?: { getURL?: (path: string) => string } } }).chrome?.runtime;
  const url = runtime?.getURL?.('app.html') ?? `${location.origin}/app.html`;
  await browser.tabs.create({ url });
}

export async function openUrl(url: string): Promise<void> {
  await browser.tabs.create({ url });
}

export function closePopup(): void {
  window.close();
}

function decodeBookmarkletSource(source: string): string {
  try {
    return decodeURIComponent(source);
  } catch {
    return source.replace(/(?:%[0-9a-f]{2})+/gi, (encoded) => {
      try {
        return decodeURIComponent(encoded);
      } catch {
        return encoded;
      }
    });
  }
}

export async function executeBookmarklet(tabId: number, bookmarkletUrl: string): Promise<void> {
  const code = decodeBookmarkletSource(bookmarkletUrl.replace(/^javascript:/i, ''));
  const results = await browser.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (source: string) => {
      (0, eval)(source);
    },
    args: [code]
  });
  const executionError = (results[0] as { error?: { message?: string } } | undefined)?.error;
  if (executionError) throw new Error(executionError.message || 'Bookmarklet 执行失败');
}
