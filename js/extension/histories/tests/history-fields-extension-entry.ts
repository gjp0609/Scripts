type BrowserHistoryItem = {
  id?: string;
  url?: string;
  title?: string;
  lastVisitTime?: number;
  visitCount?: number;
  typedCount?: number;
};

type BrowserVisitItem = {
  id?: string;
  visitId?: string;
  visitTime?: number;
  referringVisitId?: string;
  transition?: string;
};

type BrowserApi = {
  history: {
    onVisited: { addListener: (listener: (item: BrowserHistoryItem) => void) => void };
    search: (query: { text: string; startTime: number; maxResults: number }) => Promise<BrowserHistoryItem[]>;
    getVisits: (query: { url: string }) => Promise<BrowserVisitItem[]>;
  };
  tabs: {
    create: (options: { url: string; active: boolean }) => Promise<{ id?: number }>;
    update: (tabId: number, options: { url: string }) => Promise<unknown>;
    reload: (tabId: number) => Promise<void>;
    get: (tabId: number) => Promise<{ status?: string; url?: string }>;
    remove: (tabId: number) => Promise<void>;
    goBack?: (tabId: number) => Promise<void>;
    goForward?: (tabId: number) => Promise<void>;
  };
};

type FieldTestConfig = {
  siteOrigin: string;
  resultUrl: string;
  browser: string;
};

const extensionGlobal = globalThis as typeof globalThis & {
  browser?: BrowserApi;
  chrome?: BrowserApi;
  __HISTORIES_FIELD_TEST__?: FieldTestConfig;
};
const api = extensionGlobal.browser ?? extensionGlobal.chrome;
const config = extensionGlobal.__HISTORIES_FIELD_TEST__;

if (api && config) void runFieldTest(api, config);

async function runFieldTest(browser: BrowserApi, options: FieldTestConfig) {
  const startedAt = Date.now() - 1000;
  const events: BrowserHistoryItem[] = [];
  browser.history.onVisited.addListener((item) => {
    if (item.url?.startsWith(options.siteOrigin)) events.push(item);
  });

  let tabId: number | undefined;
  try {
    const tab = await browser.tabs.create({
      url: `${options.siteOrigin}/start?case=create`,
      active: false
    });
    tabId = tab.id;
    if (tabId === undefined) throw new Error('Test tab does not have an id.');
    await waitForTab(browser, tabId, '/start');

    await browser.tabs.update(tabId, { url: `${options.siteOrigin}/second?case=update` });
    await waitForTab(browser, tabId, '/second');

    await browser.tabs.reload(tabId);
    await waitForTab(browser, tabId, '/second');

    await browser.tabs.update(tabId, { url: `${options.siteOrigin}/redirect?case=redirect` });
    await waitForTab(browser, tabId, '/final');

    if (browser.tabs.goBack && browser.tabs.goForward) {
      try {
        await browser.tabs.goBack(tabId);
        await waitForTab(browser, tabId, '/second');
        await browser.tabs.goForward(tabId);
        await waitForTab(browser, tabId, '/final');
      } catch {
        // Some headless browser profiles do not expose a back entry for a newly created tab.
      }
    }
    await delay(500);

    const items = (await browser.history.search({
      text: options.siteOrigin,
      startTime: startedAt,
      maxResults: 100
    })).filter((item) => item.url?.startsWith(options.siteOrigin));
    const visits = [];
    for (const item of items) {
      const url = requireString(item.url, 'history item URL');
      const eventTimes = events
        .filter((event) => event.url === url)
        .map((event) => event.lastVisitTime)
        .filter((value): value is number => Number.isFinite(value));
      const visitItems = await browser.history.getVisits({ url });
      visits.push({
        path: safePath(url),
        historyItemFields: fieldShape(item),
        eventCount: eventTimes.length,
        visitCount: visitItems.length,
        visits: visitItems.map((visit) => ({
          fields: fieldShape(visit),
          transition: visit.transition ?? 'missing',
          hasVisitId: Boolean(visit.visitId),
          hasReferringVisitId: Boolean(visit.referringVisitId),
          nearestEventDeltaMs: nearestDelta(visit.visitTime, eventTimes)
        }))
      });
    }

    await postResult(options.resultUrl, {
      ok: true,
      result: {
        browser: options.browser,
        eventCount: events.length,
        eventFieldShapes: uniqueShapes(events),
        historyItems: visits.sort((left, right) => left.path.localeCompare(right.path))
      }
    });
  } catch (error) {
    await postResult(options.resultUrl, {
      ok: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    });
  } finally {
    if (tabId !== undefined) await browser.tabs.remove(tabId).catch(() => undefined);
  }
}

async function waitForTab(browser: BrowserApi, tabId: number, expectedPath: string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const tab = await browser.tabs.get(tabId);
    if (tab.status === 'complete' && tab.url && safePath(tab.url).startsWith(expectedPath)) {
      await delay(150);
      return;
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for test path ${expectedPath}.`);
}

function fieldShape(value: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !['url', 'title'].includes(key))
      .map(([key, item]) => [key, item === null ? 'null' : typeof item])
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function uniqueShapes(values: object[]) {
  const shapes = new Map<string, Record<string, string>>();
  for (const value of values) {
    const shape = fieldShape(value);
    shapes.set(JSON.stringify(shape), shape);
  }
  return [...shapes.values()];
}

function nearestDelta(visitTime: number | undefined, eventTimes: number[]): number | undefined {
  if (!Number.isFinite(visitTime) || eventTimes.length === 0) return undefined;
  return Math.min(...eventTimes.map((eventTime) => Math.abs(eventTime - Number(visitTime))));
}

function safePath(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

function requireString(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

async function postResult(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Unable to post field test result: ${response.status}`);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export {};
