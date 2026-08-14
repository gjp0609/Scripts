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
const ENTRY = path.join(ROOT, 'js/extension/histories/tests/search-incremental-full-browser-entry.ts');
const ESBUILD = path.join(ROOT, 'node_modules/esbuild/bin/esbuild');
const SQLITE_DIR = path.join(ROOT, 'js/extension/histories/public/sqlite');
const CHROME_EXECUTABLES = [
  process.env.HISTORIES_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

test(
  'benchmarks incremental SQLite FTS updates on an external HTU backup',
  { timeout: 1_800_000 },
  async (t) => {
    const backupPath = process.env.HISTORIES_HTU_BACKUP;
    if (!backupPath) {
      t.skip('HISTORIES_HTU_BACKUP is not set');
      return;
    }
    if (!existsSync(backupPath)) {
      t.skip(`HISTORIES_HTU_BACKUP does not exist: ${backupPath}`);
      return;
    }
    const chromeExecutable = CHROME_EXECUTABLES.find((executable) => existsSync(executable));
    if (!chromeExecutable) {
      t.skip('No local Chrome or Edge executable found');
      return;
    }

    const tempDir = await mkdtemp(path.join(tmpdir(), 'histories-incremental-index-'));
    try {
      await bundleEntry(tempDir);
      await writeFile(
        path.join(tempDir, 'index.html'),
        '<!doctype html><meta charset="utf-8"><script type="module" src="./benchmark.js"></script>'
      );
      const backupStat = await stat(backupPath);
      const server = await serveBenchmark(tempDir, backupPath, backupStat.size);

      try {
        const browser = await chromium.launch({ executablePath: chromeExecutable, headless: true });
        try {
          const page = await browser.newPage();
          page.setDefaultTimeout(1_800_000);
          page.on('console', (message) => t.diagnostic(message.text()));
          await page.goto(server.url, { waitUntil: 'networkidle' });
          const result = await page.evaluate(
            (options) => window.runHistoriesIncrementalBenchmark(options),
            {
              holdoutDays: parsePositiveNumber(process.env.HISTORIES_INCREMENTAL_HOLDOUT_DAYS, 7),
              queryIterations: parsePositiveNumber(process.env.HISTORIES_INCREMENTAL_QUERY_ITERATIONS, 12),
              interleavedSearchSamples: 20,
              updateMetadataInFts: parseBoolean(
                process.env.HISTORIES_INCREMENTAL_UPDATE_FTS_METADATA,
                false
              )
            }
          );

          assert.ok(result.dataset.baselineVisits > 0);
          assert.ok(result.dataset.baselinePages > 0);
          assert.ok(result.dataset.heldoutVisits > 0);
          assert.equal(
            result.finalPageCount,
            result.dataset.baselinePages + result.replay.mutations.newPages
          );
          assert.equal(result.gradual.mutations.visits, result.dataset.heldoutVisits);
          assert.deepEqual(result.gradual.mutations, result.replay.mutations);
          assert.equal(result.checkpointLoad.pages, result.finalPageCount);
          t.diagnostic(JSON.stringify(roundMetrics(result), null, 2));
        } finally {
          await browser.close();
        }
      } finally {
        await server.close();
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
);

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
        `--outfile=${path.join(outDir, 'benchmark.js')}`
      ],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
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

function serveBenchmark(root, backupPath, backupSize) {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    response.setHeader('cross-origin-opener-policy', 'same-origin');
    response.setHeader('cross-origin-embedder-policy', 'require-corp');
    if (requestUrl.pathname === '/backup.tsv') {
      response.setHeader('content-type', 'text/tab-separated-values; charset=utf-8');
      response.setHeader('content-length', String(backupSize));
      createReadStream(backupPath).pipe(response);
      return;
    }

    const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
    const sourcePath = pathname.startsWith('/sqlite/')
      ? path.join(SQLITE_DIR, pathname.slice('/sqlite/'.length))
      : path.join(root, pathname.slice(1));
    try {
      response.setHeader('content-type', contentType(pathname));
      response.end(await readFile(sourcePath));
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
        reject(new Error('Unable to resolve benchmark server address'));
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

function contentType(pathname) {
  if (pathname.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (pathname.endsWith('.wasm')) return 'application/wasm';
  return 'text/html; charset=utf-8';
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

function roundMetrics(value) {
  if (Array.isArray(value)) return value.map(roundMetrics);
  if (!value || typeof value !== 'object') {
    return typeof value === 'number' ? Math.round(value * 1000) / 1000 : value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundMetrics(item)]));
}
