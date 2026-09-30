import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { chromium } from 'playwright';

const root = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const entry = path.join(root, 'js/extension/histories/tests/native-backup-browser-entry.ts');
const esbuild = path.join(root, 'node_modules/esbuild/bin/esbuild');

test('native backup restores main data and rejects tampered chunks before publication', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'histories-native-browser-'));
    try {
        await bundle(dir);
        await writeFile(path.join(dir, 'index.html'), '<script type="module" src="./entry.js"></script>');
        const server = await serve(dir);
        try {
            const browser = await chromium.launch({ channel: 'chromium', headless: true });
            try {
                const page = await browser.newPage();
                await page.goto(server.url);
                const result = await page.evaluate(() => window.runNativeBackupBrowserSmoke());
                assert.equal(result.before.pages, 2);
                assert.equal(result.before.visits, 2);
                assert.equal(result.after.pages, 2);
                assert.equal(result.after.visits, 2);
                assert.deepEqual(result.sourceCount, [1, 1]);
                assert.deepEqual(result.batchCount, [1, 1]);
                assert.equal(result.manifest.entries.length, 2);
                assert.match(result.filename, /\.hbk$/);
                assert.equal(result.tamperRejected, true);
                assert.equal(result.tamperVisits, 0);
            } finally {
                await browser.close();
            }
        } finally {
            await server.close();
        }
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

function bundle(dir) {
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [
                esbuild,
                entry,
                '--bundle',
                '--format=esm',
                '--platform=browser',
                `--outfile=${path.join(dir, 'entry.js')}`,
            ],
            { cwd: root },
        );
        child.on('error', reject);
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`esbuild ${code}`))));
    });
}

function serve(dir) {
    const server = createServer(async (request, response) => {
        const name = request.url === '/' ? 'index.html' : String(request.url).slice(1);
        try {
            const { readFile } = await import('node:fs/promises');
            response.setHeader('content-type', name.endsWith('.js') ? 'text/javascript' : 'text/html');
            response.end(await readFile(path.join(dir, name)));
        } catch {
            response.statusCode = 404;
            response.end();
        }
    });
    return new Promise((resolve) =>
        server.listen(0, '127.0.0.1', () =>
            resolve({
                url: `http://127.0.0.1:${server.address().port}/`,
                close: () => new Promise((done) => server.close(done)),
            }),
        ),
    );
}
