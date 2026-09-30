import assert from 'node:assert/strict';
import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { chromium } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const PROJECT = path.join(ROOT, 'js/extension/histories');
const ENTRY = path.join(PROJECT, 'tests/htu-multi-import-full-entry.ts');
const FIXTURES = path.join(PROJECT, 'dev-browser-data/test-files');
const MANIFEST = path.join(FIXTURES, 'htu-incremental-fixture.json');
const ESBUILD = path.join(ROOT, 'node_modules/esbuild/bin/esbuild');
const CHROME_EXECUTABLES = [
    process.env.HISTORIES_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

test('merges the real baseline and overlapping incremental HTU fixtures', { timeout: 900_000 }, async (t) => {
    if (!existsSync(MANIFEST)) {
        t.skip('Generate dev-browser-data/test-files with create-incremental-fixture.mjs first');
        return;
    }
    const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
    const baselinePath = path.join(FIXTURES, manifest.baselineFile);
    const incrementalPath = path.join(FIXTURES, manifest.incrementalFile);
    if (!existsSync(baselinePath) || !existsSync(incrementalPath)) {
        t.skip('Generated HTU baseline/incremental TSV files are missing');
        return;
    }
    const chromeExecutable = CHROME_EXECUTABLES.find((file) => existsSync(file));
    if (!chromeExecutable) {
        t.skip('No local Chrome or Edge executable found');
        return;
    }

    const tempDir = await mkdtemp(path.join(tmpdir(), 'histories-multi-full-'));
    try {
        await bundleEntry(tempDir);
        await writeFile(
            path.join(tempDir, 'index.html'),
            '<!doctype html><meta charset="utf-8"><script type="module" src="./multi-full.js"></script>',
        );
        const server = await serve(tempDir, manifest, baselinePath, incrementalPath);
        try {
            const browser = await chromium.launch({ executablePath: chromeExecutable, headless: true });
            try {
                const page = await browser.newPage();
                page.setDefaultTimeout(900_000);
                await page.goto(server.url, { waitUntil: 'networkidle' });
                const result = await page.evaluate(() => window.runHistoriesMultiImportFull());
                assert.equal(result.baselineAdded, manifest.baselineRows - manifest.dataImageRows);
                assert.equal(result.baselineIgnored, manifest.dataImageRows);
                assert.equal(result.incrementalAdded, manifest.expectedFinalRows - result.baselineAdded);
                assert.equal(result.visits, manifest.expectedFinalRows);
                assert.equal(result.repeatedAdded, 0);
                assert.equal(result.repeatedDuplicates, manifest.incrementalRows);
                assert.equal(result.restoredPages, result.pages);
                assert.equal(result.restoredVisits, result.visits);
                assert.ok(result.nativeBackupBytes > 0);
                t.diagnostic(
                    JSON.stringify({
                        pages: result.pages,
                        visits: result.visits,
                        baselineAdded: result.baselineAdded,
                        incrementalAdded: result.incrementalAdded,
                        incrementalDuplicates: result.incrementalDuplicates,
                        baselineMs: Math.round(result.baselineMs),
                        incrementalMs: Math.round(result.incrementalMs),
                        repeatedMs: Math.round(result.repeatedMs),
                        nativeBackupBytes: result.nativeBackupBytes,
                        nativeExportMs: Math.round(result.nativeExportMs),
                        nativeRestoreMs: Math.round(result.nativeRestoreMs),
                    }),
                );
            } finally {
                await browser.close();
            }
        } finally {
            await server.close();
        }
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

function bundleEntry(outDir) {
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [
                ESBUILD,
                ENTRY,
                '--bundle',
                '--format=esm',
                '--platform=browser',
                '--target=es2022',
                `--outfile=${path.join(outDir, 'multi-full.js')}`,
            ],
            { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let stderr = '';
        child.stderr.on('data', (chunk) => (stderr += String(chunk)));
        child.on('error', reject);
        child.on('exit', (code) =>
            code === 0 ? resolve() : reject(new Error(stderr || `esbuild exited with ${code}`)),
        );
    });
}

async function serve(root, manifest, baselinePath, incrementalPath) {
    const sizes = {
        baseline: (await stat(baselinePath)).size,
        incremental: (await stat(incrementalPath)).size,
    };
    const server = createServer(async (request, response) => {
        const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
        if (pathname === '/fixture/manifest') {
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify(manifest));
            return;
        }
        if (pathname === '/fixture/baseline' || pathname === '/fixture/incremental') {
            const key = pathname.endsWith('baseline') ? 'baseline' : 'incremental';
            const file = key === 'baseline' ? baselinePath : incrementalPath;
            response.setHeader('content-type', 'text/tab-separated-values; charset=utf-8');
            response.setHeader('content-length', String(sizes[key]));
            createReadStream(file).pipe(response);
            return;
        }
        const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
        try {
            response.setHeader('content-type', pathname.endsWith('.js') ? 'text/javascript' : 'text/html');
            response.end(await readFile(file));
        } catch {
            response.statusCode = 404;
            response.end('not found');
        }
    });
    return await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') return reject(new Error('Unable to resolve server address'));
            resolve({
                url: `http://127.0.0.1:${address.port}/`,
                close: () => new Promise((done, fail) => server.close((error) => (error ? fail(error) : done()))),
            });
        });
    });
}
