import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHtuLine } from '../src/htu/tsv.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const sourcePath = process.argv[2];
const holdoutDays = normalizeDays(process.argv[3], 7);
const overlapDays = normalizeDays(process.argv[4], 7);

if (!sourcePath) {
    throw new Error('Usage: node create-incremental-fixture.mjs <backup.tsv> [holdoutDays] [overlapDays]');
}

const projectDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputDir = path.join(projectDir, 'dev-browser-data', 'test-files');
const baselinePath = path.join(outputDir, `htu-baseline-before-${holdoutDays}d.tsv`);
const incrementalPath = path.join(outputDir, `htu-incremental-last-${holdoutDays + overlapDays}d.tsv`);
const manifestPath = path.join(outputDir, 'htu-incremental-fixture.json');

const scan = await scanMaximumVisitTime(sourcePath);
const cutoff = scan.maxVisitTime - holdoutDays * DAY_MS;
const overlapStart = cutoff - overlapDays * DAY_MS;
await mkdir(outputDir, { recursive: true });
const counts = await splitFixture(sourcePath, baselinePath, incrementalPath, cutoff, overlapStart);
const manifest = {
    sourceFile: path.basename(sourcePath),
    generatedAt: new Date().toISOString(),
    holdoutDays,
    overlapDays,
    maxVisitTime: scan.maxVisitTime,
    cutoff,
    overlapStart,
    sourceRows: scan.validRows,
    dataImageRows: scan.dataImageRows,
    invalidRows: scan.invalidRows,
    baselineRows: counts.baselineRows,
    incrementalRows: counts.incrementalRows,
    expectedFinalRows: scan.validRows - scan.dataImageRows,
    baselineFile: path.basename(baselinePath),
    incrementalFile: path.basename(incrementalPath),
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({ outputDir, ...manifest }, null, 2));

async function scanMaximumVisitTime(inputPath) {
    let maxVisitTime = 0;
    let validRows = 0;
    let invalidRows = 0;
    let dataImageRows = 0;
    for await (const line of readLines(inputPath)) {
        if (!line) continue;
        const parsed = parseHtuLine(`${line}\n`);
        if (parsed.error) {
            invalidRows += 1;
            continue;
        }
        validRows += 1;
        if (parsed.url.trimStart().toLowerCase().startsWith('data:image/')) dataImageRows += 1;
        maxVisitTime = Math.max(maxVisitTime, parsed.visitTime);
    }
    if (validRows === 0) throw new Error('HTU backup contains no valid rows.');
    return { maxVisitTime, validRows, invalidRows, dataImageRows };
}

async function splitFixture(inputPath, basePath, recentPath, cutoff, overlapStart) {
    const baseline = createWriteStream(basePath, { encoding: 'utf8' });
    const incremental = createWriteStream(recentPath, { encoding: 'utf8' });
    let baselineRows = 0;
    let incrementalRows = 0;
    try {
        for await (const line of readLines(inputPath)) {
            if (!line) continue;
            const parsed = parseHtuLine(`${line}\n`);
            if (parsed.error) continue;
            if (parsed.visitTime < cutoff) {
                if (!baseline.write(`${line}\r\n`)) await once(baseline, 'drain');
                baselineRows += 1;
            }
            if (parsed.visitTime >= overlapStart) {
                if (!incremental.write(`${line}\r\n`)) await once(incremental, 'drain');
                incrementalRows += 1;
            }
        }
    } finally {
        baseline.end();
        incremental.end();
        await Promise.all([once(baseline, 'finish'), once(incremental, 'finish')]);
    }
    return { baselineRows, incrementalRows };
}

async function* readLines(inputPath) {
    const stream = createReadStream(inputPath, { encoding: 'utf8' });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of lines) yield line;
}

function normalizeDays(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
