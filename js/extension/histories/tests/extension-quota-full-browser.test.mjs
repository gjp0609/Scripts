import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { cp, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { chromium } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const PROJECT = path.join(ROOT, 'js/extension/histories');
const ENTRY = path.join(PROJECT, 'tests/extension-quota-full-entry.ts');
const ESBUILD = path.join(ROOT, 'node_modules/esbuild/bin/esbuild');
const FIREFOX = process.env.HISTORIES_FIREFOX ?? 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
const TEST_PUBLIC_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({
    type: 'spki',
    format: 'der',
});
const TEST_EXTENSION_KEY = TEST_PUBLIC_KEY.toString('base64');
const TEST_EXTENSION_ID = extensionIdFromPublicKey(TEST_PUBLIC_KEY);
const TARGETS = new Set(
    (process.env.HISTORIES_EXTENSION_QUOTA_BROWSERS ?? 'chromium,firefox')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
);

test('persists and recovers a full search snapshot in extension origins', { timeout: 3_600_000 }, async (t) => {
    const backupPath = process.env.HISTORIES_HTU_BACKUP;
    if (!backupPath || !existsSync(backupPath)) {
        t.skip('HISTORIES_HTU_BACKUP is not set to an existing file');
        return;
    }

    const tempDir = await mkdtemp(path.join(tmpdir(), 'histories-extension-quota-'));
    const backupStat = await stat(backupPath);
    const resultServer = await serveBackupAndResults(backupPath, backupStat.size);
    try {
        if (TARGETS.has('chromium')) {
            await t.test('Chromium extension origin', { timeout: 1_800_000 }, async (subtest) => {
                const extensionDir = path.join(tempDir, 'chromium-extension');
                await buildAndPrepareExtension('chrome', extensionDir, resultServer, 'none');
                const profileDir = path.join(tempDir, 'chromium-profile');
                const build = await runChromiumSession(extensionDir, profileDir, 'build', resultServer);
                assertBuildResult(build, process.env.HISTORIES_EXTENSION_QUOTA_MAX_ROWS);
                const verify = await runChromiumSession(extensionDir, profileDir, 'verify', resultServer);
                assertVerifyResult(build, verify);
                subtest.diagnostic(JSON.stringify(summarize({ build, verify }), null, 2));
            });
        }

        if (TARGETS.has('firefox')) {
            await t.test('Firefox extension origin', { timeout: 1_800_000 }, async (subtest) => {
                if (!existsSync(FIREFOX)) {
                    subtest.skip('Firefox executable is unavailable');
                    return;
                }
                const extensionDir = path.join(tempDir, 'firefox-extension');
                const profileDir = path.join(tempDir, 'firefox-profile');
                await mkdir(profileDir, { recursive: true });
                await buildAndPrepareExtension('firefox', extensionDir, resultServer, 'build');
                subtest.diagnostic('starting Firefox build session');
                const buildPromise = resultServer.nextResult('firefox-build');
                await runFirefoxSession(extensionDir, profileDir, buildPromise);
                const build = unwrapPostedResult(await buildPromise);
                assertBuildResult(build, process.env.HISTORIES_EXTENSION_QUOTA_MAX_ROWS);

                await injectAutoOpen(extensionDir, resultServer, 'verify');
                subtest.diagnostic('starting Firefox verify session');
                const verifyPromise = resultServer.nextResult('firefox-verify');
                await runFirefoxSession(extensionDir, profileDir, verifyPromise);
                const verify = unwrapPostedResult(await verifyPromise);
                assertVerifyResult(build, verify);
                subtest.diagnostic(JSON.stringify(summarize({ build, verify }), null, 2));
            });
        }
    } finally {
        await resultServer.close();
        await rm(tempDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    }
});

async function buildAndPrepareExtension(browser, targetDir, server, autoMode) {
    await runCommand(
        process.execPath,
        [path.join(ROOT, 'node_modules/wxt/bin/wxt.mjs'), 'build', '--browser', browser],
        PROJECT,
    );
    await cp(path.join(PROJECT, `.output/${browser === 'chrome' ? 'chrome' : 'firefox'}-mv3`), targetDir, {
        recursive: true,
    });
    await bundleEntry(targetDir);
    await writeFile(
        path.join(targetDir, 'quota-test.html'),
        '<!doctype html><meta charset="utf-8"><title>Histories quota test</title><script type="module" src="./quota-test.js"></script>',
    );
    const manifestPath = path.join(targetDir, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (browser === 'chrome') manifest.key = TEST_EXTENSION_KEY;
    manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), `${server.origin}/*`])];
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await injectAutoOpen(targetDir, server, autoMode);
}

async function bundleEntry(outDir) {
    await runCommand(
        process.execPath,
        [
            ESBUILD,
            ENTRY,
            '--bundle',
            '--format=esm',
            '--platform=browser',
            '--target=es2022',
            `--outfile=${path.join(outDir, 'quota-test.js')}`,
        ],
        ROOT,
    );
}

async function injectAutoOpen(extensionDir, server, mode) {
    const backgroundPath = path.join(extensionDir, 'background.js');
    let background = await readFile(backgroundPath, 'utf8');
    background = background.replace(/\n\/\* histories-quota-auto-start \*\/[\s\S]*$/, '');
    if (mode !== 'none') {
        const url = extensionTestUrl('', mode, server).replace(/^chrome-extension:\/\/\/|^moz-extension:\/\/\//, '');
        background += `\n/* histories-quota-auto-start */\n{const a=globalThis.browser??globalThis.chrome;let opened=false;const open=()=>{if(opened)return;opened=true;a.tabs.create({url:a.runtime.getURL(${JSON.stringify(url)})});};a.runtime.onInstalled.addListener(open);setTimeout(open,1000);}\n`;
    }
    await writeFile(backgroundPath, background);
}

async function runChromiumSession(extensionDir, profileDir, mode, server) {
    const context = await chromium.launchPersistentContext(profileDir, {
        channel: 'chromium',
        headless: true,
        args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
    });
    try {
        const page = await context.newPage();
        page.setDefaultTimeout(1_800_000);
        page.on('console', (message) => console.error(message.text()));
        await page.goto(`chrome-extension://${TEST_EXTENSION_ID}/quota-test.html`, { waitUntil: 'load' });
        const maxRows = parseOptionalPositiveInteger(process.env.HISTORIES_EXTENSION_QUOTA_MAX_ROWS);
        return await page.evaluate(
            ({ mode, backupUrl, maxRows, processPagination }) =>
                mode === 'build'
                    ? window.runHistoriesExtensionQuotaBuild({
                          backupUrl,
                          maxRows,
                          pagination: processPagination,
                      })
                    : window.runHistoriesExtensionQuotaVerify(),
            {
                mode,
                backupUrl: `${server.origin}/backup.tsv`,
                maxRows,
                processPagination: parseBoolean(process.env.HISTORIES_EXTENSION_QUOTA_PAGINATION, false),
            },
        );
    } finally {
        await context.close();
    }
}

async function runFirefoxSession(extensionDir, profileDir, resultPromise) {
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
        await resultPromise;
    } finally {
        await runner.exit();
    }
}

function extensionTestUrl(extensionBase, mode, server) {
    const query = new URLSearchParams({
        mode,
        backupUrl: `${server.origin}/backup.tsv`,
        resultUrl: `${server.origin}/result/${mode === 'build' ? 'firefox-build' : 'firefox-verify'}`,
    });
    const maxRows = parseOptionalPositiveInteger(process.env.HISTORIES_EXTENSION_QUOTA_MAX_ROWS);
    if (maxRows !== undefined) query.set('maxRows', String(maxRows));
    if (parseBoolean(process.env.HISTORIES_EXTENSION_QUOTA_PAGINATION, false)) {
        query.set('pagination', 'true');
    }
    return `${extensionBase}quota-test.html?${query}`;
}

function serveBackupAndResults(backupPath, backupSize) {
    const waiters = new Map();
    const pending = new Map();
    const server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        response.setHeader('access-control-allow-origin', '*');
        if (url.pathname === '/backup.tsv') {
            response.setHeader('content-type', 'text/tab-separated-values; charset=utf-8');
            response.setHeader('content-length', String(backupSize));
            createReadStream(backupPath).pipe(response);
            return;
        }
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
                    waiter.resolve(value);
                } else pending.set(key, value);
                response.statusCode = 204;
                response.end();
            });
            return;
        }
        response.statusCode = 404;
        response.end('not found');
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string')
                return reject(new Error('Unable to resolve result server address'));
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
                        }, 1_800_000);
                        waiters.set(key, {
                            resolve(value) {
                                clearTimeout(timer);
                                resultResolve(value);
                            },
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

function unwrapPostedResult(posted) {
    if (!posted?.ok) throw new Error(posted?.error ?? 'Firefox extension quota test failed');
    return posted.result;
}

function assertBuildResult(result, maxRowsValue) {
    assert.ok(result.imported.rows > 0);
    const maxRows = parseOptionalPositiveInteger(maxRowsValue);
    if (maxRows !== undefined) assert.equal(result.imported.rows, maxRows);
    assert.equal(result.summary.pages, result.imported.pages);
    assert.equal(result.summary.visits, result.imported.visits);
    assert.equal(result.snapshot.pageCount, result.imported.pages);
    assert.ok(result.snapshot.snapshotSize > 0);
}

function assertVerifyResult(build, verify) {
    assert.deepEqual(verify.summaryBefore, build.summary);
    assert.equal(verify.snapshot.pageCount, build.snapshot.pageCount);
    assert.equal(verify.snapshot.snapshotSize, build.snapshot.snapshotSize);
    assert.equal(verify.corruptionRejected, true);
    assert.equal(verify.snapshotMissingAfterDelete, true);
    assert.equal(verify.summaryAfterDelete.pages, build.summary.pages);
    assert.equal(verify.summaryAfterDelete.visits, build.summary.visits);
}

function summarize(value) {
    if (Array.isArray(value)) return value.map(summarize);
    if (!value || typeof value !== 'object') return typeof value === 'number' ? Math.round(value * 1000) / 1000 : value;
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, key === 'bytes' ? undefined : summarize(item)]),
    );
}

function parseOptionalPositiveInteger(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function parseBoolean(value, fallback) {
    if (value === undefined || value === '') return fallback;
    return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

function extensionIdFromPublicKey(publicKey) {
    const digest = createHash('sha256').update(publicKey).digest().subarray(0, 16);
    return [...digest]
        .map((byte) => `${String.fromCharCode(97 + (byte >> 4))}${String.fromCharCode(97 + (byte & 15))}`)
        .join('');
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
            code === 0 ? resolve() : reject(new Error(stderr || `${pathToFileURL(command)} exited with ${code}`)),
        );
    });
}
