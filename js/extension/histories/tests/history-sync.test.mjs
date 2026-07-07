import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const ENTRY = path.join(ROOT, 'js/extension/histories/src/sync/history-sync.ts');
const ESBUILD = path.join(ROOT, 'node_modules/esbuild/bin/esbuild');

test('syncs browser history items into pages and visits', async () => {
  const { syncBrowserHistory } = await loadSyncModule();
  const searchCalls = [];
  const visitCalls = [];
  const pageBatches = [];
  const visitBatches = [];

  const result = await syncBrowserHistory({
    history: {
      async search(query) {
        searchCalls.push(query);
        return [
          {
            url: 'https://example.com/a#hash',
            title: 'Example A',
            lastVisitTime: 3000,
            visitCount: 2
          },
          {
            url: 'https://example.org/b',
            title: 'Example B',
            lastVisitTime: 2000,
            visitCount: 1
          }
        ];
      },
      async getVisits({ url }) {
        visitCalls.push(url);
        if (url.includes('/a')) {
          return [
            { visitId: 11, visitTime: 1000, transition: 'link' },
            { visitId: 12, visitTime: 3000, transition: 'typed' }
          ];
        }
        return [{ visitId: 21, visitTime: 2000, transition: 'reload' }];
      }
    },
    storage: {
      async upsertPages(inputs) {
        pageBatches.push(inputs);
        return inputs.map((input, index) => ({
          id: index + 1,
          normalizedUrl: input.normalizedUrl
        }));
      },
      async putVisits(inputs) {
        visitBatches.push(inputs);
        return inputs.length;
      }
    }
  });

  assert.deepEqual(searchCalls, [{ text: '', startTime: 0, maxResults: 1_000_000_000 }]);
  assert.deepEqual(visitCalls, ['https://example.com/a#hash', 'https://example.org/b']);
  assert.equal(pageBatches.length, 1);
  assert.deepEqual(pageBatches[0], [
    {
      url: 'https://example.com/a#hash',
      normalizedUrl: 'https://example.com/a',
      title: 'Example A',
      visitCount: 2,
      lastVisitTime: 3000
    },
    {
      url: 'https://example.org/b',
      normalizedUrl: 'https://example.org/b',
      title: 'Example B',
      visitCount: 1,
      lastVisitTime: 2000
    }
  ]);
  assert.equal(visitBatches.length, 1);
  assert.deepEqual(
    visitBatches[0].map((visit) => ({
      id: visit.id,
      pageId: visit.pageId,
      visitTime: visit.visitTime,
      transition: visit.transition
    })),
    [
      {
        id: 'sync:https://example.com/a:1000:11:na:link:0',
        pageId: 1,
        visitTime: 1000,
        transition: 'link'
      },
      {
        id: 'sync:https://example.com/a:3000:12:na:typed:1',
        pageId: 1,
        visitTime: 3000,
        transition: 'typed'
      },
      {
        id: 'sync:https://example.org/b:2000:21:na:reload:0',
        pageId: 2,
        visitTime: 2000,
        transition: 'reload'
      }
    ]
  );
  assert.equal(result.items, 2);
  assert.equal(result.pages, 2);
  assert.equal(result.visits, 3);
  assert.equal(result.nextStartTime, 3001);
});

test('filters getVisits results by startTime and ignores future-skewed visits', async () => {
  const { syncBrowserHistory } = await loadSyncModule();
  const pageBatches = [];
  const visitBatches = [];
  const now = Date.now();

  const result = await syncBrowserHistory({
    startTime: 2000,
    history: {
      async search() {
        return [
          {
            url: 'https://example.com/path',
            title: 'Path',
            lastVisitTime: 2600,
            visitCount: 10
          }
        ];
      },
      async getVisits() {
        return [
          { visitId: 1, visitTime: 1000, transition: 'link' },
          { visitId: 2, visitTime: 2500, transition: 'typed' },
          { visitId: 3, visitTime: now + 10 * 60 * 1000, transition: 'reload' }
        ];
      }
    },
    storage: {
      async upsertPages(inputs) {
        pageBatches.push(inputs);
        return [{ id: 7, normalizedUrl: inputs[0].normalizedUrl }];
      },
      async putVisits(inputs) {
        visitBatches.push(inputs);
        return inputs.length;
      }
    }
  });

  assert.deepEqual(pageBatches[0], [
    {
      url: 'https://example.com/path',
      normalizedUrl: 'https://example.com/path',
      title: 'Path',
      visitCount: 10,
      lastVisitTime: 2600
    }
  ]);
  assert.deepEqual(
    visitBatches[0].map((visit) => ({ pageId: visit.pageId, visitTime: visit.visitTime, transition: visit.transition })),
    [{ pageId: 7, visitTime: 2500, transition: 'typed' }]
  );
  assert.equal(result.visits, 1);
  assert.equal(result.nextStartTime, 2501);
});

let loadedModule;
let tempDir;

async function loadSyncModule() {
  if (loadedModule) return loadedModule;

  tempDir = await mkdtemp(path.join(tmpdir(), 'histories-sync-test-'));
  const outfile = path.join(tempDir, 'history-sync.mjs');
  await bundleSyncModule(outfile);
  loadedModule = await import(pathToFileURL(outfile));
  return loadedModule;
}

function bundleSyncModule(outfile) {
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
