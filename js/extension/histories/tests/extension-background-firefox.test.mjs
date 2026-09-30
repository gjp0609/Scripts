import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';

const ROOT = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const PROJECT = path.join(ROOT, 'js/extension/histories');
const OUTPUT = path.join(PROJECT, '.output/firefox-mv3');
const ENTRY = path.join(PROJECT, 'tests/extension-background-firefox-entry.ts');
const ESBUILD = path.join(ROOT, 'node_modules/esbuild/bin/esbuild');
const FIREFOX = process.env.HISTORIES_FIREFOX ?? 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';

test('production Firefox extension collects a visit and keeps it across restart', { timeout: 120_000 }, async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'histories-firefox-production-'));
    const profileDir = path.join(tempDir, 'profile');
    const extensionDir = path.join(tempDir, 'extension');
    const server = await serveFixture();
    try {
        await mkdir(profileDir, { recursive: true });
        await cp(OUTPUT, extensionDir, { recursive: true });
        const verifierPath = path.join(extensionDir, 'collection-verifier.js');
        await runCommand(
            process.execPath,
            [
                ESBUILD,
                ENTRY,
                '--bundle',
                '--format=iife',
                '--platform=browser',
                '--target=es2022',
                `--outfile=${verifierPath}`,
            ],
            ROOT,
        );

        const firstResult = server.nextResult('first', 90_000);
        const firstStarted = server.nextResult('first-started', 30_000);
        await configureExtension(extensionDir, await readFile(verifierPath, 'utf8'), {
            mode: 'collect',
            visitUrl: `${server.origin}/visit?case=firefox`,
            resultUrl: `${server.origin}/result/first`,
            minimum: 1,
        });
        const firstRunner = await runFirefox(extensionDir, profileDir, `${server.origin}/wake?run=first`);
        let first;
        try {
            await firstStarted;
            first = unwrap(await firstResult);
        } finally {
            await stopFirefox(firstRunner);
        }
        assert.ok(first.count >= 1);

        const secondResult = server.nextResult('second', 90_000);
        const secondStarted = server.nextResult('second-started', 30_000);
        await configureExtension(extensionDir, await readFile(verifierPath, 'utf8'), {
            mode: 'verify',
            visitUrl: `${server.origin}/unused`,
            resultUrl: `${server.origin}/result/second`,
            minimum: first.count,
        });
        const secondRunner = await runFirefox(extensionDir, profileDir, `${server.origin}/wake?run=second`);
        try {
            await secondStarted;
            const second = unwrap(await secondResult);
            assert.ok(second.count >= first.count);
        } finally {
            await stopFirefox(secondRunner);
        }
    } finally {
        await server.close();
        await rm(tempDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    }
});

async function configureExtension(extensionDir, verifier, config) {
    const manifestPath = path.join(extensionDir, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.permissions = [...new Set([...(manifest.permissions ?? []), 'tabs'])];
    manifest.host_permissions = [
        ...new Set([...(manifest.host_permissions ?? []), `${new URL(config.visitUrl).origin}/*`]),
    ];
    manifest.content_scripts = [
        ...(manifest.content_scripts ?? []).filter((script) => !script.js?.includes('collection-wake.js')),
        {
            matches: [`${new URL(config.visitUrl).origin}/*`],
            js: ['collection-wake.js'],
            run_at: 'document_start',
        },
    ];
    manifest.background = {
        ...manifest.background,
        scripts: [
            'collection-test.js',
            ...(manifest.background?.scripts ?? []).filter((script) => script !== 'collection-test.js'),
        ],
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(
        path.join(extensionDir, 'collection-wake.js'),
        "void browser.runtime.sendMessage({ type: 'histories:collection-test-wake' }).catch(() => {});\n",
    );
    await writeFile(
        path.join(extensionDir, 'collection-test.js'),
        `globalThis.__HISTORIES_COLLECTION_TEST__=${JSON.stringify(config)};\n${verifier}\n`,
    );
}

async function runFirefox(extensionDir, profileDir, startUrl) {
    const webExt = (await import('web-ext-run')).default;
    const runner = await webExt.cmd.run(
        {
            target: 'firefox-desktop',
            sourceDir: extensionDir,
            firefox: FIREFOX,
            firefoxProfile: profileDir,
            keepProfileChanges: true,
            startUrl,
            args: ['-headless'],
            noInput: true,
            noReload: true,
            noReloadManagerExtension: true,
        },
        { shouldExitProgram: false },
    );
    const firefoxRunner = runner.extensionRunners[0];
    const addon = await firefoxRunner.remoteFirefox.getInstalledAddon('histories@example.local');
    assert.equal(addon.backgroundScriptStatus, 'RUNNING');
    assert.deepEqual(addon.warnings, []);
    return runner;
}

async function stopFirefox(runner) {
    const firefoxProcess = runner.extensionRunners[0]?.runningInfo?.firefox;
    if (process.platform === 'win32' && firefoxProcess?.pid) {
        await runCommand('taskkill.exe', ['/PID', String(firefoxProcess.pid), '/T', '/F'], PROJECT);
        return;
    }
    const closed = new Promise((resolve) => runner.registerCleanup(resolve));
    await runner.exit();
    let timeout;
    try {
        await Promise.race([
            closed,
            new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new Error('Firefox did not exit cleanly.')), 30_000);
            }),
        ]);
    } finally {
        clearTimeout(timeout);
    }
}

function unwrap(result) {
    if (!result?.ok) throw new Error(result?.error ?? 'Firefox production collection failed');
    return result;
}

function serveFixture() {
    const waiters = new Map();
    const timers = new Map();
    const server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        response.setHeader('access-control-allow-origin', '*');
        if (request.method === 'POST' && url.pathname.startsWith('/result/')) {
            const key = url.pathname.slice('/result/'.length);
            let body = '';
            request.on('data', (chunk) => (body += chunk));
            request.on('end', () => {
                console.log(`[firefox-collection] result ${key}`);
                waiters.get(key)?.(JSON.parse(body));
                waiters.delete(key);
                clearTimeout(timers.get(key));
                timers.delete(key);
                response.statusCode = 204;
                response.end();
            });
            return;
        }
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.end(
            url.pathname === '/wake'
                ? '<!doctype html><meta http-equiv="refresh" content="1"><title>Firefox Histories wake</title>'
                : '<!doctype html><title>Firefox Histories collection</title>',
        );
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const origin = `http://127.0.0.1:${address.port}`;
            resolve({
                origin,
                nextResult(key, timeoutMs) {
                    return new Promise((resultResolve, resultReject) => {
                        const timer = setTimeout(
                            () => resultReject(new Error(`Timed out waiting for ${key}`)),
                            timeoutMs,
                        );
                        timers.set(key, timer);
                        waiters.set(key, (value) => {
                            clearTimeout(timer);
                            resultResolve(value);
                        });
                    });
                },
                close: () => {
                    for (const timer of timers.values()) clearTimeout(timer);
                    timers.clear();
                    waiters.clear();
                    return new Promise((done, fail) => server.close((error) => (error ? fail(error) : done())));
                },
            });
        });
    });
}

function runCommand(command, args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', (chunk) => (stderr += String(chunk)));
        child.on('error', reject);
        child.on('exit', (code) =>
            code === 0 ? resolve() : reject(new Error(stderr || `${command} exited with ${code}`)),
        );
    });
}
