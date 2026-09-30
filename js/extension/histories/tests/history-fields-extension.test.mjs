import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { chromium } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const PROJECT = path.join(ROOT, 'js/extension/histories');
const ENTRY = path.join(PROJECT, 'tests/history-fields-extension-entry.ts');
const ESBUILD = path.join(ROOT, 'node_modules/esbuild/bin/esbuild');
const FIREFOX = process.env.HISTORIES_FIREFOX ?? 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
const TARGETS = new Set(
    (process.env.HISTORIES_FIELD_TEST_BROWSERS ?? 'chromium,firefox')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
);

test('compares onVisited and getVisits fields in real extensions', { timeout: 300_000 }, async (t) => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'histories-field-test-'));
    const server = await serveTestSite();
    try {
        if (TARGETS.has('chromium')) {
            await t.test('Chromium', async (subtest) => {
                const resultKey = 'chromium';
                const extensionDir = path.join(tempDir, 'chromium-extension');
                await prepareExtension('chrome', extensionDir, server, resultKey);
                const resultPromise = server.nextResult(resultKey);
                const context = await chromium.launchPersistentContext(path.join(tempDir, 'chromium-profile'), {
                    channel: 'chromium',
                    headless: true,
                    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
                });
                try {
                    const result = unwrap(await resultPromise);
                    subtest.diagnostic(JSON.stringify(result, null, 2));
                    assertFieldResult(result);
                } finally {
                    await context.close();
                }
            });
        }

        if (TARGETS.has('firefox')) {
            await t.test('Firefox', async (subtest) => {
                const resultKey = 'firefox';
                const extensionDir = path.join(tempDir, 'firefox-extension');
                const profileDir = path.join(tempDir, 'firefox-profile');
                await mkdir(profileDir, { recursive: true });
                await prepareExtension('firefox', extensionDir, server, resultKey);
                const resultPromise = server.nextResult(resultKey);
                const webExt = (await import('web-ext-run')).default;
                const runner = await webExt.cmd.run(
                    {
                        target: 'firefox-desktop',
                        sourceDir: extensionDir,
                        firefox: FIREFOX,
                        firefoxProfile: profileDir,
                        keepProfileChanges: true,
                        args: ['-headless'],
                        noInput: true,
                        noReload: true,
                        noReloadManagerExtension: true,
                    },
                    { shouldExitProgram: false },
                );
                try {
                    const result = unwrap(await resultPromise);
                    subtest.diagnostic(JSON.stringify(result, null, 2));
                    assertFieldResult(result);
                } finally {
                    await runner.exit();
                }
            });
        }
    } finally {
        await server.close();
        await rm(tempDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    }
});

async function prepareExtension(browser, targetDir, server, resultKey) {
    await runCommand(
        process.execPath,
        [path.join(ROOT, 'node_modules/wxt/bin/wxt.mjs'), 'build', '--browser', browser],
        PROJECT,
    );
    await cp(path.join(PROJECT, `.output/${browser === 'chrome' ? 'chrome' : 'firefox'}-mv3`), targetDir, {
        recursive: true,
    });
    const bundlePath = path.join(targetDir, 'history-fields-test.js');
    await runCommand(
        process.execPath,
        [
            ESBUILD,
            ENTRY,
            '--bundle',
            '--format=iife',
            '--platform=browser',
            '--target=es2022',
            `--outfile=${bundlePath}`,
        ],
        ROOT,
    );
    const manifestPath = path.join(targetDir, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.permissions = [...new Set([...(manifest.permissions ?? []), 'tabs'])];
    manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), `${server.origin}/*`])];
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const backgroundPath = path.join(targetDir, 'background.js');
    const background = await readFile(backgroundPath, 'utf8');
    const config = {
        siteOrigin: server.origin,
        resultUrl: `${server.origin}/result/${resultKey}`,
        browser: resultKey,
    };
    const testBundle = await readFile(bundlePath, 'utf8');
    await writeFile(
        backgroundPath,
        `${background}\n/* histories-field-test */\nglobalThis.__HISTORIES_FIELD_TEST__=${JSON.stringify(config)};\n${testBundle}\n`,
    );
}

function serveTestSite() {
    const waiters = new Map();
    const pending = new Map();
    const server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        response.setHeader('access-control-allow-origin', '*');
        if (request.method === 'POST' && url.pathname.startsWith('/result/')) {
            const key = url.pathname.slice('/result/'.length);
            let body = '';
            request.on('data', (chunk) => {
                body += chunk;
            });
            request.on('end', () => {
                const value = JSON.parse(body);
                const waiter = waiters.get(key);
                if (waiter) {
                    waiters.delete(key);
                    waiter(value);
                } else pending.set(key, value);
                response.statusCode = 204;
                response.end();
            });
            return;
        }
        if (url.pathname === '/redirect') {
            response.statusCode = 302;
            response.setHeader('location', `/final${url.search}`);
            response.end();
            return;
        }
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.end(`<!doctype html><meta charset="utf-8"><title>${url.pathname}</title><p>Histories field test</p>`);
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string')
                return reject(new Error('Unable to resolve field server address'));
            const origin = `http://127.0.0.1:${address.port}`;
            resolve({
                origin,
                nextResult(key) {
                    if (pending.has(key)) {
                        const value = pending.get(key);
                        pending.delete(key);
                        return Promise.resolve(value);
                    }
                    return new Promise((resultResolve, resultReject) => {
                        const timer = setTimeout(() => {
                            waiters.delete(key);
                            resultReject(new Error(`Timed out waiting for ${key}`));
                        }, 120_000);
                        waiters.set(key, (value) => {
                            clearTimeout(timer);
                            resultResolve(value);
                        });
                    });
                },
                close: () =>
                    new Promise((closeResolve, closeReject) =>
                        server.close((error) => (error ? closeReject(error) : closeResolve())),
                    ),
            });
        });
    });
}

function unwrap(posted) {
    if (!posted?.ok) throw new Error(posted?.error ?? 'History field test failed');
    return posted.result;
}

function assertFieldResult(result) {
    assert.ok(result.eventCount >= 4, 'expected multiple onVisited events');
    assert.ok(result.historyItems.length >= 3, 'expected multiple history URLs');
    const visits = result.historyItems.flatMap((item) => item.visits);
    assert.ok(visits.length >= result.historyItems.length);
    assert.ok(
        visits.every((visit) => visit.hasVisitId),
        'getVisits should expose visitId',
    );
    assert.ok(
        visits.every((visit) => visit.transition !== 'missing'),
        'transition should be observable',
    );
    if (result.browser === 'chromium') {
        assert.ok(
            visits.some((visit) => visit.transition === 'reload'),
            'Chromium should expose reload',
        );
    }
    assert.ok(visits.some((visit) => visit.nearestEventDeltaMs !== undefined && visit.nearestEventDeltaMs <= 1000));
    assert.ok(result.eventFieldShapes.every((shape) => !Object.hasOwn(shape, 'visitId')));
}

function runCommand(command, args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', (chunk) => {
            stderr += String(chunk);
        });
        child.on('error', reject);
        child.on('exit', (code) =>
            code === 0 ? resolve() : reject(new Error(stderr || `${command} exited with ${code}`)),
        );
    });
}
