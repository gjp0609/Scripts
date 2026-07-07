import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parseHtuTsv } from '../src/htu/tsv.js';

const ROOT = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const ENTRY = path.join(ROOT, 'js/extension/histories/src/import/htu-import.ts');
const ESBUILD = path.join(ROOT, 'node_modules/esbuild/bin/esbuild');

test('plans HTU rows into aggregated pages and visit drafts', async () => {
  const { planHtuImport } = await loadImportModule();
  const source = [
    'https://example.com/a\tU1000\t0\tOld title',
    'https://example.com/a\tU3000\t1\tNew title',
    'https://sub.example.org/path\tU2000\t8\tOther title',
    ''
  ].join('\r\n');
  const parsed = parseHtuTsv(source);
  assert.equal(parsed.errors.length, 0);

  const plan = planHtuImport(parsed.rows);

  assert.equal(plan.pages.length, 2);
  assert.equal(plan.visits.length, 3);
  assert.deepEqual(plan.pages[0], {
    url: 'https://example.com/a',
    normalizedUrl: 'https://example.com/a',
    title: 'New title',
    visitCount: 2,
    lastVisitTime: 3000
  });
  assert.deepEqual(plan.visits[0], {
    normalizedUrl: 'https://example.com/a',
    visitTime: 1000,
    transition: 'link',
    title: 'Old title',
    sourceIndex: 0
  });
});

test('creates deterministic HTU visit ids', async () => {
  const { makeHtuVisitId } = await loadImportModule();
  assert.equal(makeHtuVisitId(12, 1700000000123, 'reload', 4), 'htu:12:1700000000123:reload:4');
});

test('builds time-sorted typed-array visit chunks', async () => {
  const { buildVisitChunks } = await loadImportModule();
  const pageIds = new Map([
    ['https://a.example/', 1],
    ['https://b.example/', 2]
  ]);
  const chunks = buildVisitChunks(
    [
      {
        normalizedUrl: 'https://b.example/',
        visitTime: 3000,
        transition: 'reload',
        title: 'B',
        sourceIndex: 2
      },
      {
        normalizedUrl: 'https://a.example/',
        visitTime: 1000,
        transition: 'link',
        title: 'A1',
        sourceIndex: 0
      },
      {
        normalizedUrl: 'https://a.example/',
        visitTime: 2000,
        transition: 'typed',
        title: 'A2',
        sourceIndex: 1
      }
    ],
    pageIds,
    2
  );

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].minVisitTime, 1000);
  assert.equal(chunks[0].maxVisitTime, 2000);
  assert.deepEqual([...chunks[0].pageIds], [1, 1]);
  assert.deepEqual([...chunks[0].visitTimes], [1000, 2000]);
  assert.deepEqual([...chunks[0].transitionCodes], [0, 1]);
  assert.deepEqual([...chunks[0].sourceIndexes], [0, 1]);
  assert.deepEqual(chunks[0].titles, ['A1', 'A2']);
  assert.equal(chunks[1].minVisitTime, 3000);
});

test('builds page chunks with stable page ids', async () => {
  const { buildPageChunks } = await loadImportModule();
  const chunks = buildPageChunks(
    [
      {
        url: 'https://a.example/',
        normalizedUrl: 'https://a.example/',
        title: 'A',
        visitCount: 2,
        lastVisitTime: 2000
      },
      {
        url: 'https://b.example/',
        normalizedUrl: 'https://b.example/',
        title: 'B',
        visitCount: 1,
        lastVisitTime: 1000
      }
    ],
    1
  );

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].firstPageId, 1);
  assert.equal(chunks[0].count, 1);
  assert.deepEqual(chunks[0].urls, ['https://a.example/']);
  assert.deepEqual([...chunks[0].visitCounts], [2]);
  assert.equal(chunks[1].firstPageId, 2);
});

test('cancels HTU import when the abort signal is triggered', async () => {
  const { importHtuText } = await loadImportModule();
  const controller = new AbortController();

  await assert.rejects(
    () =>
      importHtuText(
        ['https://example.com/a\tU1000\t0\tA', 'https://example.com/b\tU2000\t1\tB', ''].join(
          '\r\n'
        ),
        {
          signal: controller.signal,
          onProgress(progress) {
            if (progress.stage === 'parsed') controller.abort();
          }
        }
      ),
    (error) => error instanceof DOMException && error.name === 'AbortError'
  );
});

let loadedModule;
let tempDir;

async function loadImportModule() {
  if (loadedModule) return loadedModule;

  tempDir = await mkdtemp(path.join(tmpdir(), 'histories-htu-import-test-'));
  const outfile = path.join(tempDir, 'htu-import.mjs');
  await bundleImportModule(outfile);
  loadedModule = await import(pathToFileURL(outfile));
  return loadedModule;
}

function bundleImportModule(outfile) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        ESBUILD,
        ENTRY,
        '--bundle',
        '--format=esm',
        '--platform=node',
        '--target=es2022',
        `--outfile=${outfile}`
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

test.after(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});
