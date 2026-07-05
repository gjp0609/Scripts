import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { chromium } from 'playwright';

const ROOT = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const ENTRY = path.join(ROOT, 'js/extension/histories/tests/storage-smoke-entry.ts');
const ESBUILD = path.join(ROOT, 'node_modules/esbuild/bin/esbuild');
const CHROME_EXECUTABLES = [
  process.env.HISTORIES_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

test('browser IndexedDB storage APIs support pages, visits, jobs, and snapshots', async (t) => {
  const chromeExecutable = CHROME_EXECUTABLES.find((executable) => existsSync(executable));
  if (!chromeExecutable) {
    t.skip('No local Chrome or Edge executable found for browser IndexedDB smoke test');
    return;
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), 'histories-storage-smoke-'));

  try {
    await bundleSmoke(tempDir);
    await writeFile(
      path.join(tempDir, 'index.html'),
      '<!doctype html><meta charset="utf-8"><script type="module" src="./storage-smoke.js"></script>'
    );

    const server = await serveDirectory(tempDir);

    try {
      const browser = await chromium.launch({
        executablePath: chromeExecutable,
        headless: true
      });

      try {
        const page = await browser.newPage();
        await page.goto(server.url, { waitUntil: 'networkidle' });
        const result = await page.evaluate(() => window.runHistoriesStorageSmoke());

        assert.equal(result.pageCount, 2);
        assert.equal(result.visitCount, 4);
        assert.deepEqual(result.rangeIds, ['v-2000-typed', 'v-3000-link']);
        assert.deepEqual(result.pageRangeIds, ['v-1000-link', 'v-2000-typed']);
        assert.deepEqual(result.transitionRangeIds, ['v-1000-link', 'v-3000-link']);
        assert.deepEqual(result.reverseIds, ['v-4000-reload', 'v-3000-link']);
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

function bundleSmoke(outDir) {
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
        `--outfile=${path.join(outDir, 'storage-smoke.js')}`
      ],
      {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `esbuild exited with ${code}`));
    });
  });
}

function serveDirectory(root) {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
    const filePath = path.join(root, pathname);

    try {
      response.setHeader('content-type', pathname.endsWith('.js') ? 'text/javascript' : 'text/html');
      response.end(await readFile(filePath));
    } catch {
      response.statusCode = 404;
      response.end('not found');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve smoke server address'));
        return;
      }

      resolve({
        url: `http://127.0.0.1:${address.port}/`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          })
      });
    });
  });
}
