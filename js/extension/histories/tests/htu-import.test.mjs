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
    'https://example.com/a#one\tU1000\t0\tOld title',
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
    sourceIndex: 0
  });
});

test('creates deterministic HTU visit ids', async () => {
  const { makeHtuVisitId } = await loadImportModule();
  assert.equal(makeHtuVisitId(12, 1700000000123, 'reload', 4), 'htu:12:1700000000123:reload:4');
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
