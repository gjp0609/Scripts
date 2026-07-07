import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const ENTRY = path.join(ROOT, 'js/extension/histories/src/search/search-engine.ts');
const ESBUILD = path.join(ROOT, 'node_modules/esbuild/bin/esbuild');

test('normalizes search text and quotes FTS match queries', async () => {
  const { normalizeKeyword, normalizeSearchText, makeFtsMatchQuery } = await loadSearchModule();

  assert.equal(normalizeKeyword('  IFen  '), 'ifen');
  assert.equal(
    normalizeSearchText('https://example.com/ruanyi%20feng', 'Title'),
    'https://example.com/ruanyi%20feng https://example.com/ruanyi feng title'
  );
  assert.equal(makeFtsMatchQuery('a"b'), '"a""b"');
});

test('rebuilds a SQLite FTS snapshot from page chunks', async () => {
  const { SearchEngine } = await loadSearchModule();
  const database = new FakeDatabase();
  const runtime = new FakeRuntime(database);
  const snapshots = [];
  const progress = [];
  const storage = {
    async getPageChunks() {
      return [
        {
          id: 'page-chunk:0',
          firstPageId: 1,
          count: 2,
          urls: ['https://example.com/ruanyi%20feng', 'https://example.org/other'],
          normalizedUrls: ['https://example.com/ruanyi%20feng', 'https://example.org/other'],
          titles: ['Ruan Yi Feng', 'Other'],
          visitCounts: new Uint32Array([3, 1]),
          lastVisitTimes: new Float64Array([3000, 1000])
        }
      ];
    },
    async getPageVisitStatsFromTimeRange() {
      return [];
    },
    async putSearchSnapshot(snapshot) {
      snapshots.push(snapshot);
    },
    async getLatestSearchSnapshot() {
      return snapshots.at(-1);
    }
  };
  const engine = new SearchEngine({
    runtime,
    storage,
    now: () => 7000,
    onProgress(item) {
      progress.push(item.stage);
    }
  });

  const info = await engine.rebuildSnapshot();

  assert.equal(info.pageCount, 2);
  assert.equal(info.snapshotSize, 4);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].createdAt, 7000);
  assert.equal(snapshots[0].pageCount, 2);
  assert.equal(snapshots[0].sourceRevision, 'page-chunks:1:pages:2:last:3000');
  assert.deepEqual(progress, ['reset', 'pages', 'snapshot', 'done']);
  assert.deepEqual(database.insertedRows[0], [
    1,
    'https://example.com/ruanyi%20feng https://example.com/ruanyi feng ruan yi feng',
    'https://example.com/ruanyi%20feng',
    'Ruan Yi Feng',
    3,
    3000
  ]);
  assert.equal(database.closed, false);

  engine.close();
  assert.equal(database.closed, true);
});

test('loads a snapshot and searches with keyword, time range, and limit', async () => {
  const { SearchEngine } = await loadSearchModule();
  const snapshotDatabase = new FakeDatabase({
    selectRows: [[9, 'https://example.com/ruanyifeng', 'Title', 8, 6000]]
  });
  const runtime = new FakeRuntime(new FakeDatabase(), snapshotDatabase);
  const storage = {
    async getPageChunks() {
      return [];
    },
    async getPageVisitStatsFromTimeRange(query, pageIds) {
      assert.equal(query.startTime, 5000);
      assert.equal(query.endTime, 7000);
      assert.deepEqual([...pageIds], [9]);
      return [{ pageId: 9, matchedVisitCount: 2, matchedVisitTime: 6000 }];
    },
    async putSearchSnapshot() {},
    async getLatestSearchSnapshot() {
      return {
        key: 'latest',
        schemaVersion: 1,
        sqliteVersion: '3.46.1',
        createdAt: 1,
        sourceRevision: 'test',
        bytes: new Uint8Array([1, 2, 3]),
        pageCount: 1,
        snapshotSize: 3
      };
    }
  };
  const engine = new SearchEngine({ runtime, storage });

  await engine.loadSnapshot();
  const rows = await engine.search({
    keyword: ' IFen ',
    startTime: 5000,
    endTime: 7000,
    limit: 10
  });

  assert.deepEqual(rows, [
    {
      pageId: 9,
      url: 'https://example.com/ruanyifeng',
      title: 'Title',
      visitCount: 8,
      lastVisitTime: 6000,
      matchedVisitCount: 2,
      matchedVisitTime: 6000
    }
  ]);
  assert.deepEqual(snapshotDatabase.selectBinds, ['"ifen"']);
  assert.equal(snapshotDatabase.execCalls, 0);

  engine.close();
});

test('intersects keyword matches with time-range visit stats', async () => {
  const { SearchEngine } = await loadSearchModule();
  const snapshotDatabase = new FakeDatabase({
    selectRows: [
      [1, 'https://example.com/a', 'A', 10, 9000],
      [2, 'https://example.com/b', 'B', 5, 8000],
      [3, 'https://example.com/c', 'C', 4, 7000]
    ]
  });
  const runtime = new FakeRuntime(new FakeDatabase(), snapshotDatabase);
  const storage = {
    async getPageChunks() {
      return [];
    },
    async getPageVisitStatsFromTimeRange(query, pageIds) {
      assert.equal(query.startTime, 1000);
      assert.equal(query.endTime, 5000);
      assert.deepEqual([...pageIds], [1, 2, 3]);
      return [
        { pageId: 2, matchedVisitCount: 1, matchedVisitTime: 3000 },
        { pageId: 3, matchedVisitCount: 3, matchedVisitTime: 4000 }
      ];
    },
    async putSearchSnapshot() {},
    async getLatestSearchSnapshot() {
      return {
        key: 'latest',
        schemaVersion: 1,
        sqliteVersion: '3.46.1',
        createdAt: 1,
        sourceRevision: 'test',
        bytes: new Uint8Array([1, 2, 3]),
        pageCount: 3,
        snapshotSize: 3
      };
    }
  };
  const engine = new SearchEngine({ runtime, storage });

  await engine.loadSnapshot();
  const rows = await engine.search({
    keyword: 'ifen',
    startTime: 1000,
    endTime: 5000,
    limit: 10
  });

  assert.deepEqual(rows, [
    {
      pageId: 3,
      url: 'https://example.com/c',
      title: 'C',
      visitCount: 4,
      lastVisitTime: 7000,
      matchedVisitCount: 3,
      matchedVisitTime: 4000
    },
    {
      pageId: 2,
      url: 'https://example.com/b',
      title: 'B',
      visitCount: 5,
      lastVisitTime: 8000,
      matchedVisitCount: 1,
      matchedVisitTime: 3000
    }
  ]);

  engine.close();
});

test('cancels snapshot rebuild when the abort signal is triggered', async () => {
  const { SearchEngine } = await loadSearchModule();
  const controller = new AbortController();
  const runtime = new FakeRuntime(new FakeDatabase());
  const storage = {
    async getPageChunks() {
      return [
        {
          id: 'page-chunk:0',
          firstPageId: 1,
          count: 1,
          urls: ['https://example.com/a'],
          normalizedUrls: ['https://example.com/a'],
          titles: ['A'],
          visitCounts: new Uint32Array([1]),
          lastVisitTimes: new Float64Array([1000])
        }
      ];
    },
    async getPageVisitStatsFromTimeRange() {
      return [];
    },
    async putSearchSnapshot() {
      assert.fail('snapshot should not be written after abort');
    },
    async getLatestSearchSnapshot() {
      return undefined;
    }
  };
  const engine = new SearchEngine({
    runtime,
    storage,
    signal: controller.signal,
    onProgress(progress) {
      if (progress.stage === 'reset') controller.abort();
    }
  });

  await assert.rejects(
    () => engine.rebuildSnapshot(),
    (error) => error instanceof DOMException && error.name === 'AbortError'
  );

  engine.close();
});

class FakeRuntime {
  sqliteVersion = '3.46.1';

  constructor(memoryDatabase, snapshotDatabase = memoryDatabase) {
    this.memoryDatabase = memoryDatabase;
    this.snapshotDatabase = snapshotDatabase;
  }

  openMemoryDatabase() {
    return this.memoryDatabase;
  }

  openSnapshotDatabase() {
    return this.snapshotDatabase;
  }

  exportDatabase() {
    return new Uint8Array([1, 2, 3, 4]);
  }
}

class FakeDatabase {
  constructor(options = {}) {
    this.closed = false;
    this.execCalls = 0;
    this.insertedRows = [];
    this.selectRows = options.selectRows ?? [];
    this.selectBinds = [];
  }

  exec() {
    this.execCalls += 1;
  }

  prepare(sql) {
    if (sql.includes('INSERT INTO pages_fts')) {
      return new FakeInsertStatement(this);
    }

    return new FakeSelectStatement(this);
  }

  close() {
    this.closed = true;
  }
}

class FakeInsertStatement {
  constructor(database) {
    this.database = database;
    this.values = [];
  }

  bind(values) {
    this.values = values;
    return this;
  }

  step() {
    this.database.insertedRows.push(this.values);
    return false;
  }

  stepReset() {
    this.step();
  }

  get() {
    return [];
  }

  finalize() {}
}

class FakeSelectStatement {
  constructor(database) {
    this.database = database;
    this.index = -1;
  }

  bind(values) {
    this.database.selectBinds = values;
    return this;
  }

  step() {
    this.index += 1;
    return this.index < this.database.selectRows.length;
  }

  get() {
    return this.database.selectRows[this.index];
  }

  finalize() {}
}

let loadedModule;
let tempDir;

async function loadSearchModule() {
  if (loadedModule) return loadedModule;

  tempDir = await mkdtemp(path.join(tmpdir(), 'histories-search-engine-test-'));
  const outfile = path.join(tempDir, 'search-engine.mjs');
  await bundleSearchModule(outfile);
  loadedModule = await import(pathToFileURL(outfile));
  return loadedModule;
}

function bundleSearchModule(outfile) {
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
