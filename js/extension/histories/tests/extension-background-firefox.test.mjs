import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';

const ROOT = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const PROJECT = path.join(ROOT, 'js/extension/histories');
const OUTPUT = path.join(PROJECT, '.output/firefox-mv3');
const ENTRY = path.join(PROJECT, 'tests/extension-background-firefox-entry.ts');
const ESBUILD = path.join(ROOT, 'node_modules/esbuild/bin/esbuild');
const FIREFOX = process.env.HISTORIES_FIREFOX ?? 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';

test('production Firefox extension collects a visit and keeps it across restart', { timeout: 120_000 }, async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'histories-firefox-production-'));
  const profileDir = path.join(tempDir, 'profile');
  const extensionDir = path.join(tempDir, 'extension');
  const server = await serveFixture();
  try {
    await mkdir(profileDir, { recursive: true });
    await cp(OUTPUT, extensionDir, { recursive: true });
    const verifierPath = path.join(extensionDir, 'collection-test.js');
    await runCommand(process.execPath, [
      ESBUILD,
      ENTRY,
      '--bundle',
      '--format=iife',
      '--platform=browser',
      '--target=es2022',
      `--outfile=${verifierPath}`
    ], ROOT);

    const firstResult = server.nextResult('first', 90_000);
    const firstStarted = server.nextResult('first-started', 20_000);
    await configureExtension(extensionDir, await readFile(verifierPath, 'utf8'), {
      mode: 'collect',
      visitUrl: `${server.origin}/visit?case=firefox`,
      resultUrl: `${server.origin}/result/first`,
      minimum: 1
    });
    const firstRunner = await runFirefox(extensionDir, profileDir);
    let first;
    try {
      await firstStarted;
      first = unwrap(await firstResult);
    } finally {
      await firstRunner.exit();
    }
    assert.ok(first.count >= 1);

    const secondResult = server.nextResult('second', 90_000);
    const secondStarted = server.nextResult('second-started', 20_000);
    await configureExtension(extensionDir, await readFile(verifierPath, 'utf8'), {
      mode: 'verify',
      visitUrl: `${server.origin}/unused`,
      resultUrl: `${server.origin}/result/second`,
      minimum: first.count
    });
    const secondRunner = await runFirefox(extensionDir, profileDir);
    try {
      await secondStarted;
      const second = unwrap(await secondResult);
      assert.ok(second.count >= first.count);
    } finally {
      await secondRunner.exit();
    }
  } finally {
    await server.close();
    await rm(tempDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
});

async function configureExtension(extensionDir, verifier, config) {
  const manifestPath = path.join(extensionDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.permissions = [...new Set([...(manifest.permissions ?? []), 'tabs'])];
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), `${new URL(config.visitUrl).origin}/*`])];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const backgroundPath = path.join(extensionDir, 'background.js');
  const marker = '\n/* histories-collection-test */\n';
  const current = await readFile(backgroundPath, 'utf8');
  const formal = current.split(marker)[0];
  await writeFile(
    backgroundPath,
    `${formal}${marker}globalThis.__HISTORIES_COLLECTION_TEST__=${JSON.stringify(config)};\n${verifier}\n`
  );
}

async function runFirefox(extensionDir, profileDir) {
  const webExt = (await import('web-ext-run')).default;
  return await webExt.cmd.run(
    {
      target: 'firefox-desktop',
      sourceDir: extensionDir,
      firefox: FIREFOX,
      firefoxProfile: profileDir,
      keepProfileChanges: true,
      args: ['-headless'],
      noInput: true,
      noReload: true,
      noReloadManagerExtension: true
    },
    { shouldExitProgram: false }
  );
}

function unwrap(result) {
  if (!result?.ok) throw new Error(result?.error ?? 'Firefox production collection failed');
  return result;
}

function serveFixture() {
  const waiters = new Map();
  const timers = new Map();
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    response.setHeader('access-control-allow-origin', '*');
    if (request.method === 'POST' && url.pathname.startsWith('/result/')) {
      const key = url.pathname.slice('/result/'.length);
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        console.log(`[firefox-collection] result ${key}`);
        waiters.get(key)?.(JSON.parse(body));
        waiters.delete(key);
        clearTimeout(timers.get(key));
        timers.delete(key);
        response.statusCode = 204;
        response.end();
      });
      return;
    }
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end('<!doctype html><title>Firefox Histories collection</title>');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const origin = `http://127.0.0.1:${address.port}`;
      resolve({
        origin,
        nextResult(key, timeoutMs) {
          return new Promise((resultResolve, resultReject) => {
            const timer = setTimeout(() => resultReject(new Error(`Timed out waiting for ${key}`)), timeoutMs);
            timers.set(key, timer);
            waiters.set(key, (value) => {
              clearTimeout(timer);
              resultResolve(value);
            });
          });
        },
        close: () => {
          for (const timer of timers.values()) clearTimeout(timer);
          timers.clear();
          waiters.clear();
          return new Promise((done, fail) => server.close((error) => (error ? fail(error) : done())));
        }
      });
    });
  });
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += String(chunk)));
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(stderr || `${command} exited with ${code}`))));
  });
}
