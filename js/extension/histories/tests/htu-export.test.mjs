import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parseHtuTsv } from '../src/htu/tsv.js';

const ROOT = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const ENTRY = path.join(ROOT, 'js/extension/histories/src/export/htu-export.ts');
const ESBUILD = path.join(ROOT, 'node_modules/esbuild/bin/esbuild');

test('serializes archived rows from chunk storage in source order', async () => {
  const { serializeHtuArchivedRows } = await loadExportModule();
  const source = [
    'https://example.com/a\tU1000\t0\tOld title',
    'https://example.com/a\tU3000\t1\tNew title',
    'https://sub.example.org/path\tU2000\t8\tOther title',
    ''
  ].join('\r\n');
  const parsed = parseHtuTsv(source);
  assert.equal(parsed.errors.length, 0);

  const pageChunks = [
    {
      id: 'page-chunk:0',
      firstPageId: 1,
      count: 2,
      urls: ['https://example.com/a', 'https://sub.example.org/path'],
      normalizedUrls: ['https://example.com/a', 'https://sub.example.org/path'],
      titles: ['New title', 'Other title'],
      visitCounts: new Uint32Array([2, 1]),
      lastVisitTimes: new Float64Array([3000, 2000])
    }
  ];
  const visitChunks = [
    {
      id: 'visit-chunk:0',
      minVisitTime: 1000,
      maxVisitTime: 3000,
      count: 3,
      pageIds: new Uint32Array([1, 2, 1]),
      visitTimes: new Float64Array([1000, 2000, 3000]),
      transitionCodes: new Uint8Array([0, 8, 1]),
      sourceIndexes: new Uint32Array([0, 2, 1]),
      titles: ['Old title', 'Other title', 'New title']
    }
  ];

  assert.equal(serializeHtuArchivedRows(pageChunks, visitChunks), source);
});

test('builds HTU backup filenames', async () => {
  const { makeHtuBackupFilename } = await loadExportModule();
  assert.equal(
    makeHtuBackupFilename(new Date(2026, 6, 7, 15, 44, 5)),
    'htu_backup_20260707_154405.tsv'
  );
});

let loadedModule;
let tempDir;

async function loadExportModule() {
  if (loadedModule) return loadedModule;

  tempDir = await mkdtemp(path.join(tmpdir(), 'histories-htu-export-test-'));
  const outfile = path.join(tempDir, 'htu-export.mjs');
  await bundleExportModule(outfile);
  loadedModule = await import(pathToFileURL(outfile));
  return loadedModule;
}

function bundleExportModule(outfile) {
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
