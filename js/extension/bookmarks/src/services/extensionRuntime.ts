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

export async function executeBookmarklet(tabId: number, bookmarkletUrl: string): Promise<void> {
  const code = bookmarkletUrl.replace(/^javascript:/i, '');
  await browser.scripting.executeScript({
    target: { tabId },
    func: (source: string) => {
      const script = document.createElement('script');
      script.textContent = decodeURIComponent(source);
      document.documentElement.appendChild(script);
      script.remove();
    },
    args: [code]
  });
}
