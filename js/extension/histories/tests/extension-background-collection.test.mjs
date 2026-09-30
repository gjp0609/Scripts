import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const EXTENSION = path.join(ROOT, 'js/extension/histories/.output/chrome-mv3');

test('production Chrome extension records onVisited history and survives restart', { timeout: 300_000 }, async (t) => {
    if (!existsSync(path.join(EXTENSION, 'manifest.json'))) {
        t.skip('Build js/extension/histories before running production extension collection test');
        return;
    }
    const configuredProfile = process.env.HISTORIES_CHROME_PROFILE;
    const profile = configuredProfile
        ? path.resolve(configuredProfile)
        : await mkdtemp(path.join(tmpdir(), 'histories-production-profile-'));
    const ownsProfile = !configuredProfile;
    const server = await serveFixture();
    try {
        const first = await chromium.launchPersistentContext(profile, {
            channel: 'chromium',
            headless: true,
            args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
        });
        let extensionId;
        try {
            extensionId = await waitForExtensionId(first);
            const options = await first.newPage();
            await options.goto(`chrome-extension://${extensionId}/options.html`, { waitUntil: 'domcontentloaded' });
            const target = await first.newPage();
            await target.goto(`${server.url}/visit?case=production`, { waitUntil: 'load' });
            await target.close();
            const firstCount = await waitForVisitCount(options, 1);
            assert.ok(firstCount >= 1, 'formal background should persist a visit generation');
            await options.evaluate(async (url) => {
                await chrome.history.deleteUrl({ url });
            }, `${server.url}/visit?case=production`);
            await new Promise((resolve) => setTimeout(resolve, 300));
            assert.ok(
                (await waitForVisitCount(options, firstCount)) >= firstCount,
                'deleting browser history must not delete Histories visits',
            );
            await first.close();

            const second = await chromium.launchPersistentContext(profile, {
                channel: 'chromium',
                headless: true,
                args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
            });
            try {
                const reopenedId = await waitForExtensionId(second);
                const reopened = await second.newPage();
                await reopened.goto(`chrome-extension://${reopenedId}/options.html`, { waitUntil: 'domcontentloaded' });
                const persistedCount = await waitForVisitCount(reopened, firstCount);
                assert.ok(persistedCount >= firstCount, 'visit count should survive browser restart');
            } finally {
                await second.close();
            }
        } finally {
            if (!first.isClosed()) await first.close();
        }
    } finally {
        await server.close();
        if (ownsProfile) await rm(profile, { recursive: true, force: true });
    }
});

async function waitForExtensionId(context) {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    return new URL(worker.url()).hostname;
}

async function waitForVisitCount(page, minimum) {
    const handle = await page.waitForFunction(
        async (expected) => {
            const request = indexedDB.open('histories', 6);
            const count = await new Promise((resolve, reject) => {
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const db = request.result;
                    const transaction = db.transaction('historyGenerations', 'readonly');
                    const cursor = transaction.objectStore('historyGenerations').openCursor();
                    let maximum = 0;
                    cursor.onsuccess = () => {
                        const current = cursor.result;
                        if (!current) {
                            db.close();
                            resolve(maximum);
                            return;
                        }
                        if (current.value.status === 'active')
                            maximum = Math.max(maximum, current.value.visitCount || 0);
                        current.continue();
                    };
                    cursor.onerror = () => reject(cursor.error);
                };
            });
            return count >= expected ? count : false;
        },
        minimum,
        { timeout: 120_000 },
    );
    return await handle.jsonValue();
}

async function serveFixture() {
    const server = createServer(async (request, response) => {
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.end('<!doctype html><title>Histories production test</title><p>visited</p>');
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    return {
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    };
}
