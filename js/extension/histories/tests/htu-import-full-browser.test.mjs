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
const ENTRY = path.join(ROOT, 'js/extension/histories/tests/htu-import-full-entry.ts');
const ESBUILD = path.join(ROOT, 'node_modules/esbuild/bin/esbuild');
const CHROME_EXECUTABLES = [
  process.env.HISTORIES_CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

test(
  'imports external HTU backup into browser IndexedDB',
  { timeout: 900_000 },
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
      t.skip('No local Chrome or Edge executable found for full browser import test');
      return;
    }

    const tempDir = await mkdtemp(path.join(tmpdir(), 'histories-full-import-'));

    try {
      await bundleEntry(tempDir);
      await writeFile(
        path.join(tempDir, 'index.html'),
        '<!doctype html><meta charset="utf-8"><script type="module" src="./full-import.js"></script>'
      );

      const backupStat = await stat(backupPath);
      const server = await serveBenchmark(tempDir, backupPath, backupStat.size);

      try {
        const browser = await chromium.launch({
          executablePath: chromeExecutable,
          headless: true
        });

        try {
          const page = await browser.newPage();
          page.on('console', (message) => {
            t.diagnostic(message.text());
          });
          page.setDefaultTimeout(900_000);
          await page.goto(server.url, { waitUntil: 'networkidle' });
          const maxRows = parseMaxRows(process.env.HISTORIES_HTU_IMPORT_MAX_ROWS);
          const result = await page.evaluate(
            (options) => window.runHistoriesFullImport(options),
            { maxRows }
          );

          assert.ok(result.rows > 0, 'rows should be imported');
          if (maxRows !== undefined) {
            assert.equal(result.rows, maxRows);
          }
          assert.ok(result.pages > 0, 'pages should be imported');
          assert.equal(result.visits, result.rows);
          assert.equal(result.writtenVisits, result.visits);
          assert.equal(result.writtenPages, result.pages);
          assert.equal(result.summaryPages, result.pages);
          assert.equal(result.summaryVisits, result.visits);
          t.diagnostic(JSON.stringify(summarizeResult(result), null, 2));
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
        `--outfile=${path.join(outDir, 'full-import.js')}`
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

function serveBenchmark(root, backupPath, backupSize) {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (requestUrl.pathname === '/backup.tsv') {
      response.setHeader('content-type', 'text/tab-separated-values; charset=utf-8');
      response.setHeader('content-length', String(backupSize));
      createReadStream(backupPath).pipe(response);
      return;
    }

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

function summarizeResult(result) {
  return {
    rows: result.rows,
    pages: result.pages,
    visits: result.visits,
    fetchMs: Math.round(result.fetchMs),
    importMs: Math.round(result.importMs),
    totalMs: Math.round(result.totalMs),
    progressSamples: result.progressSamples.slice(-8)
  };
}

function parseMaxRows(value) {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return Math.floor(parsed);
}
