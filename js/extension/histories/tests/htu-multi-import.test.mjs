import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const ENTRY = path.join(ROOT, 'js/extension/histories/src/import/htu-multi-import.ts');
const ESBUILD = path.join(ROOT, 'node_modules/esbuild/bin/esbuild');

test('preflights and merges overlapping HTU files independent of input order', async () => {
    const { preflightHtuFiles, mergeHtuFilesIntoChunks } = await loadModule();
    const inputs = fixtureInputs();
    const forwardFiles = await preflightHtuFiles(inputs);
    const reverseFiles = await preflightHtuFiles([...inputs].reverse());
    const forward = mergeHtuFilesIntoChunks({
        files: forwardFiles,
        pageChunkSize: 2,
        visitChunkSize: 2,
    });
    const reverse = mergeHtuFilesIntoChunks({
        files: reverseFiles,
        pageChunkSize: 2,
        visitChunkSize: 2,
    });

    assert.equal(forward.addedVisits, 3);
    assert.equal(forward.duplicateVisits, 2);
    assert.equal(forward.ignoredVisits, 1);
    assert.deepEqual(canonicalChunks(forward), canonicalChunks(reverse));
    assert.deepEqual(
        forward.reports.map((report) => report.format).sort(),
        [['3col_unix', '8col'], ['4col_unix']].sort(),
    );

    const commonChunk = forward.visitChunks.find((chunk) => [...chunk.visitTimes].includes(1000));
    const commonIndex = [...commonChunk.visitTimes].indexOf(1000);
    assert.equal(decodeSourceIds(commonChunk, commonIndex).length, 2);

    const repeated = mergeHtuFilesIntoChunks({
        files: forwardFiles,
        existingPageChunks: forward.pageChunks,
        existingVisitChunks: forward.visitChunks,
        pageChunkSize: 2,
        visitChunkSize: 2,
    });
    assert.equal(repeated.addedVisits, 0);
    assert.equal(repeated.duplicateVisits, 5);
    assert.deepEqual(canonicalHistory(repeated), canonicalHistory(forward));
});

test('rejects the full file set when any HTU file fails preflight', async () => {
    const { preflightHtuFiles, HtuPreflightError } = await loadModule();
    const inputs = [fixtureInputs()[0], { name: 'broken.tsv', bytes: new TextEncoder().encode('not-a-valid-htu-row') }];

    await assert.rejects(
        () => preflightHtuFiles(inputs),
        (error) => {
            assert.ok(error instanceof HtuPreflightError);
            assert.equal(error.reports.length, 2);
            assert.equal(error.reports.find((report) => report.name === 'broken.tsv').errorCount, 1);
            return true;
        },
    );
});

function fixtureInputs() {
    const encoder = new TextEncoder();
    return [
        {
            name: 'browser-a.tsv',
            bytes: encoder.encode(
                [
                    'https://example.com/common\tU1000\t0\tCommon A',
                    'https://example.com/a\tU2000\t1\tA',
                    'data:image/png;base64,ignored\tU2500\t0\tIgnored',
                    '',
                ].join('\r\n'),
            ),
        },
        {
            name: 'browser-b.tsv',
            bytes: encoder.encode(
                [
                    'https://example.com/common\tU1000\t0',
                    'https://example.com/b\t0\t0\t3000\t0\t0\treload\tB',
                    'https://example.com/b\t0\t0\t3000\t0\t0\treload\tB',
                    '',
                ].join('\r\n'),
            ),
        },
    ];
}

function canonicalChunks(result) {
    return {
        history: canonicalHistory(result),
        reports: result.reports.map((report) => ({
            sha256: report.sha256,
            inputRows: report.inputRows,
            addedVisits: report.addedVisits,
            duplicateVisits: report.duplicateVisits,
            ignoredVisits: report.ignoredVisits,
            errorCount: report.errorCount,
        })),
    };
}

function canonicalHistory(result) {
    return {
        pages: result.pageChunks.flatMap((chunk) =>
            chunk.urls.map((url, index) => ({
                id: chunk.firstPageId + index,
                url,
                title: chunk.titles[index],
                visitCount: chunk.visitCounts[index],
                lastVisitTime: chunk.lastVisitTimes[index],
            })),
        ),
        visits: result.visitChunks.flatMap((chunk) =>
            [...chunk.visitTimes].map((visitTime, index) => ({
                pageId: chunk.pageIds[index],
                visitTime,
                transitionCode: chunk.transitionCodes[index],
                title: chunk.titles[index],
                sourceIds: decodeSourceIds(chunk, index),
            })),
        ),
    };
}

function decodeSourceIds(chunk, index) {
    const start = chunk.sourceRefOffsets[index];
    const end = chunk.sourceRefOffsets[index + 1];
    return [...chunk.sourceRefs.slice(start, end)].map((sourceIndex) => chunk.sourceIds[sourceIndex]);
}

let loadedModule;
let tempDir;

async function loadModule() {
    if (loadedModule) return loadedModule;
    tempDir = await mkdtemp(path.join(tmpdir(), 'histories-htu-multi-test-'));
    const outfile = path.join(tempDir, 'htu-multi-import.mjs');
    await bundle(outfile);
    loadedModule = await import(pathToFileURL(outfile));
    return loadedModule;
}

function bundle(outfile) {
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [ESBUILD, ENTRY, '--bundle', '--format=esm', '--platform=node', '--target=es2022', `--outfile=${outfile}`],
            { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
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
