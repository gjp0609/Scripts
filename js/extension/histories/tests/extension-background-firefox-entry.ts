export {};

type CollectionTestConfig = {
    mode: 'collect' | 'verify';
    visitUrl: string;
    resultUrl: string;
    minimum: number;
};

declare global {
    var __HISTORIES_COLLECTION_TEST__: CollectionTestConfig;
}

void runCollectionTest(globalThis.__HISTORIES_COLLECTION_TEST__);

async function runCollectionTest(config: CollectionTestConfig): Promise<void> {
    try {
        await postResult(`${config.resultUrl}-started`, { ok: true, count: 0 });
        if (config.mode === 'collect') {
            const tab = await browser.tabs.create({ url: config.visitUrl, active: false });
            if (tab.id === undefined) throw new Error('Test tab does not have an id.');
            await waitForTab(tab.id, config.visitUrl);
            await browser.tabs.remove(tab.id);
        }
        const count = await waitForVisitCount(config.minimum);
        await postResult(config.resultUrl, { ok: true, count });
    } catch (error) {
        await postResult(config.resultUrl, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

async function waitForTab(tabId: number, expectedUrl: string): Promise<void> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        const tab = await browser.tabs.get(tabId);
        if (tab.status === 'complete' && tab.url === expectedUrl) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Timed out waiting for Firefox test tab.');
}

async function waitForVisitCount(minimum: number): Promise<number> {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
        const count = await readActiveVisitCount();
        if (count >= minimum) return count;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for ${minimum} persisted visits.`);
}

async function readActiveVisitCount(): Promise<number> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('histories', 6);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    try {
        return await new Promise<number>((resolve, reject) => {
            const request = db
                .transaction('historyGenerations', 'readonly')
                .objectStore('historyGenerations')
                .openCursor();
            let maximum = 0;
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) {
                    resolve(maximum);
                    return;
                }
                if (cursor.value.status === 'active') maximum = Math.max(maximum, Number(cursor.value.visitCount) || 0);
                cursor.continue();
            };
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
}

async function postResult(url: string, value: unknown): Promise<void> {
    await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(value),
    });
}
