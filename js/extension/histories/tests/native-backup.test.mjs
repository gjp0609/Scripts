import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const entry = path.join(root, 'js/extension/histories/src/export/native-backup.ts');
let dir;

test('native backup round-trips chunk data and rejects corrupt input', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'histories-native-backup-'));
    const outfile = path.join(dir, 'native-backup.mjs');
    await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile });
    const mod = await import(pathToFileURL(outfile));
    const pages = [
        {
            id: 'p',
            firstPageId: 1,
            count: 1,
            urls: ['https://example.com'],
            normalizedUrls: ['https://example.com'],
            titles: ['Example'],
            visitCounts: new Uint32Array([2]),
            lastVisitTimes: new Float64Array([123]),
        },
    ];
    const visits = [
        {
            id: 'v',
            minVisitTime: 123,
            maxVisitTime: 123,
            count: 1,
            pageIds: new Uint32Array([1]),
            visitTimes: new Float64Array([123]),
            transitionCodes: new Uint8Array([0]),
            sourceIndexes: new Uint32Array([0]),
        },
    ];
    const bytes = mod.serializeNativeHistoryBackup(pages, visits, 456);
    const parsed = mod.parseNativeHistoryBackup(bytes);
    assert.equal(parsed.createdAt, 456);
    assert.deepEqual([...parsed.pages[0].visitCounts], [2]);
    assert.deepEqual([...parsed.visits[0].visitTimes], [123]);
    assert.throws(() => mod.parseNativeHistoryBackup(new TextEncoder().encode('{}')), /malformed|Unsupported/);
});

test.after(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
});
