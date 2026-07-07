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

test('merges browser sync plan into existing chunk-backed history without duplicating imported visits', async () => {
  const { mergeHistorySyncPlanIntoChunks } = await loadSyncModule();
  const merged = await mergeHistorySyncPlanIntoChunks({
    plan: {
      items: 2,
      startTime: 0,
      maxVisitTime: 4000,
      pages: [
        {
          url: 'https://example.com/a',
          normalizedUrl: 'https://example.com/a',
          title: 'A latest',
          visitCount: 3,
          lastVisitTime: 4000
        },
        {
          url: 'https://example.net/new',
          normalizedUrl: 'https://example.net/new',
          title: 'New page',
          visitCount: 1,
          lastVisitTime: 3500
        }
      ],
      visits: [
        {
          id: 'sync:https://example.com/a:3000:na:na:typed:0',
          normalizedUrl: 'https://example.com/a',
          visitTime: 3000,
          transition: 'typed',
          title: 'A imported'
        },
        {
          id: 'sync:https://example.com/a:4000:na:na:reload:1',
          normalizedUrl: 'https://example.com/a',
          visitTime: 4000,
          transition: 'reload',
          title: 'A latest'
        },
        {
          id: 'sync:https://example.net/new:3500:na:na:link:0',
          normalizedUrl: 'https://example.net/new',
          visitTime: 3500,
          transition: 'link',
          title: 'New page'
        }
      ]
    },
    existingPages: [
      {
        id: 1,
        url: 'https://example.com/a',
        normalizedUrl: 'https://example.com/a',
        title: 'A imported',
        visitCount: 2,
        lastVisitTime: 3000,
        chunkId: 'page-chunk:0',
        chunkIndex: 0
      },
      {
        id: 2,
        url: 'https://example.org/b',
        normalizedUrl: 'https://example.org/b',
        title: 'B imported',
        visitCount: 1,
        lastVisitTime: 2000,
        chunkId: 'page-chunk:0',
        chunkIndex: 1
      }
    ],
    existingVisits: [
      {
        id: 'chunk:1:1000:0:0',
        pageId: 1,
        normalizedUrl: 'https://example.com/a',
        visitTime: 1000,
        transition: 'link',
        title: 'A imported',
        sourceIndex: 0,
        chunkId: 'visit-chunk:0',
        chunkIndex: 0
      },
      {
        id: 'chunk:2:2000:8:1',
        pageId: 2,
        normalizedUrl: 'https://example.org/b',
        visitTime: 2000,
        transition: 'reload',
        title: 'B imported',
        sourceIndex: 1,
        chunkId: 'visit-chunk:0',
        chunkIndex: 1
      },
      {
        id: 'chunk:1:3000:1:2',
        pageId: 1,
        normalizedUrl: 'https://example.com/a',
        visitTime: 3000,
        transition: 'typed',
        title: 'A imported',
        sourceIndex: 2,
        chunkId: 'visit-chunk:0',
        chunkIndex: 2
      }
    ],
    pageChunkSize: 10,
    visitChunkSize: 10
  });

  assert.equal(merged.pages, 3);
  assert.equal(merged.visits, 5);
  assert.equal(merged.nextStartTime, 4001);
  assert.equal(merged.pageChunks.length, 1);
  assert.equal(merged.visitChunks.length, 1);
  assert.deepEqual(merged.pageChunks[0].urls, [
    'https://example.com/a',
    'https://example.org/b',
    'https://example.net/new'
  ]);
  assert.deepEqual([...merged.pageChunks[0].visitCounts], [3, 1, 1]);
  assert.deepEqual([...merged.visitChunks[0].pageIds], [1, 2, 1, 3, 1]);
  assert.deepEqual([...merged.visitChunks[0].visitTimes], [1000, 2000, 3000, 3500, 4000]);
  assert.deepEqual([...merged.visitChunks[0].sourceIndexes], [0, 1, 2, 3, 4]);
  assert.deepEqual(merged.visitChunks[0].titles, [
    'A imported',
    'B imported',
    'A imported',
    'New page',
    'A latest'
  ]);
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
