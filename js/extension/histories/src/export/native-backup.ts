import type { PageChunkRecord, VisitChunkRecord } from '../storage/schema';
import type { HistorySourceRecord, ImportBatchRecord } from '../storage/schema';
import { NATIVE_BACKUP_FORMAT_VERSION } from '../storage/schema';
import {
    getActiveHistoryGeneration,
    getPageChunks,
    getVisitChunks,
    listHistorySources,
    listImportBatches,
    publishHistoryGeneration,
    putHistorySource,
    putImportBatch,
} from '../storage/database';

const NATIVE_BACKUP_MAGIC = 'HISTORIES-NATIVE-BACKUP/1';

export type NativeHistoryBackup = {
    format: 'histories-native-backup';
    version: number;
    createdAt: number;
    pages: PageChunkRecord[];
    visits: VisitChunkRecord[];
};

export type NativeBackupManifest = {
    format: 'histories-native-backup';
    version: number;
    createdAt: number;
    pageCount: number;
    visitCount: number;
    generationRevision: number;
    sources: HistorySourceRecord[];
    importBatches: ImportBatchRecord[];
    entries: Array<{
        kind: 'page' | 'visit';
        index: number;
        bytes: number;
        sha256: string;
        count: number;
    }>;
};

export type NativeBackupExportResult = {
    blob: Blob;
    manifest: NativeBackupManifest;
    filename: string;
};

export type NativeBackupRestoreResult = {
    generationId: string;
    pages: number;
    visits: number;
    sources: number;
    importBatches: number;
};

export function serializeNativeHistoryBackup(
    pages: PageChunkRecord[],
    visits: VisitChunkRecord[],
    createdAt = Date.now(),
): Uint8Array {
    const payload: NativeHistoryBackup = {
        format: 'histories-native-backup',
        version: NATIVE_BACKUP_FORMAT_VERSION,
        createdAt,
        pages,
        visits,
    };
    return new TextEncoder().encode(JSON.stringify(payload, replacer));
}

export function parseNativeHistoryBackup(bytes: Uint8Array): NativeHistoryBackup {
    let parsed: unknown;
    try {
        parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes), reviver);
    } catch {
        throw new Error('Invalid native history backup JSON.');
    }
    if (!isBackup(parsed)) throw new Error('Unsupported or malformed native history backup.');
    return parsed;
}

export async function exportNativeHistoryBackup(now = new Date()): Promise<NativeBackupExportResult> {
    const [pages, visits, sources, importBatches, generation] = await Promise.all([
        getPageChunks(),
        getVisitChunks(),
        listHistorySources(),
        listImportBatches(),
        getActiveHistoryGeneration(),
    ]);
    const entryParts: BlobPart[] = [];
    const entries: NativeBackupManifest['entries'] = [];
    for (const [kind, chunks] of [
        ['page', pages],
        ['visit', visits],
    ] as const) {
        for (let index = 0; index < chunks.length; index += 1) {
            const line = JSON.stringify({ kind, index, chunk: chunks[index] }, replacer);
            const bytes = new TextEncoder().encode(line);
            entries.push({
                kind,
                index,
                bytes: bytes.byteLength,
                sha256: await sha256Hex(bytes),
                count: chunks[index].count,
            });
            entryParts.push(bytes, '\n');
        }
    }
    const manifest: NativeBackupManifest = {
        format: 'histories-native-backup',
        version: NATIVE_BACKUP_FORMAT_VERSION,
        createdAt: now.getTime(),
        pageCount: pages.reduce((total, chunk) => total + chunk.count, 0),
        visitCount: visits.reduce((total, chunk) => total + chunk.count, 0),
        generationRevision: generation?.revision ?? 0,
        sources,
        importBatches,
        entries,
    };
    return {
        blob: new Blob([`${NATIVE_BACKUP_MAGIC}\n`, `${JSON.stringify(manifest)}\n`, ...entryParts], {
            type: 'application/x-histories-backup',
        }),
        manifest,
        filename: makeNativeBackupFilename(now),
    };
}

export async function restoreNativeHistoryBackup(blob: Blob): Promise<NativeBackupRestoreResult> {
    const active = await getActiveHistoryGeneration();
    if (active && active.visitCount > 0) {
        throw new Error('Native restore requires an empty Histories database; existing visits were not changed.');
    }
    const lines = readBlobLines(blob);
    const magic = await lines.next();
    if (magic.done || magic.value !== NATIVE_BACKUP_MAGIC) throw new Error('Unsupported native backup header.');
    const manifestLine = await lines.next();
    if (manifestLine.done) throw new Error('Native backup manifest is missing.');
    const manifest = parseManifest(manifestLine.value);
    const pages: PageChunkRecord[] = [];
    const visits: VisitChunkRecord[] = [];
    for (const descriptor of manifest.entries) {
        const lineResult = await lines.next();
        if (lineResult.done) throw new Error('Native backup ended before all chunks were read.');
        const bytes = new TextEncoder().encode(lineResult.value);
        if (bytes.byteLength !== descriptor.bytes || (await sha256Hex(bytes)) !== descriptor.sha256) {
            throw new Error(`Native backup chunk checksum mismatch: ${descriptor.kind}:${descriptor.index}.`);
        }
        const entry = JSON.parse(lineResult.value, reviver) as {
            kind?: 'page' | 'visit';
            index?: number;
            chunk?: PageChunkRecord | VisitChunkRecord;
        };
        if (
            entry.kind !== descriptor.kind ||
            entry.index !== descriptor.index ||
            entry.chunk?.count !== descriptor.count
        ) {
            throw new Error(`Native backup chunk metadata mismatch: ${descriptor.kind}:${descriptor.index}.`);
        }
        if (entry.kind === 'page') pages.push(entry.chunk as PageChunkRecord);
        else visits.push(entry.chunk as VisitChunkRecord);
    }
    const trailing = await lines.next();
    if (!trailing.done && trailing.value.trim()) throw new Error('Native backup contains unexpected trailing data.');
    if (pages.reduce((total, chunk) => total + chunk.count, 0) !== manifest.pageCount) {
        throw new Error('Native backup page count does not match its manifest.');
    }
    if (visits.reduce((total, chunk) => total + chunk.count, 0) !== manifest.visitCount) {
        throw new Error('Native backup visit count does not match its manifest.');
    }
    const generation = await publishHistoryGeneration({
        pageChunks: pages,
        visitChunks: visits,
        reason: 'native-restore',
        parentGenerationId: active?.id,
        sourceIds: manifest.sources.map((source) => source.id),
    });
    for (const source of manifest.sources) await putHistorySource(source);
    for (const batch of manifest.importBatches) {
        await putImportBatch({ ...batch, generationId: generation.id });
    }
    return {
        generationId: generation.id,
        pages: generation.pageCount,
        visits: generation.visitCount,
        sources: manifest.sources.length,
        importBatches: manifest.importBatches.length,
    };
}

export function makeNativeBackupFilename(now = new Date()): string {
    const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        '_',
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
    ].join('');
    return `histories_backup_${stamp}.hbk`;
}

function replacer(_key: string, value: unknown): unknown {
    if (value instanceof Uint8Array || value instanceof Uint32Array || value instanceof Float64Array) {
        return { __typedArray: value.constructor.name, values: [...value] };
    }
    return value;
}

function reviver(_key: string, value: unknown): unknown {
    if (!value || typeof value !== 'object' || !('__typedArray' in value)) return value;
    const typed = value as { __typedArray?: string; values?: unknown[] };
    const values = Array.isArray(typed.values) ? typed.values.map(Number) : [];
    if (typed.__typedArray === 'Uint8Array') return new Uint8Array(values);
    if (typed.__typedArray === 'Uint32Array') return new Uint32Array(values);
    if (typed.__typedArray === 'Float64Array') return new Float64Array(values);
    return value;
}

function isBackup(value: unknown): value is NativeHistoryBackup {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as NativeHistoryBackup;
    return (
        candidate.format === 'histories-native-backup' &&
        candidate.version === NATIVE_BACKUP_FORMAT_VERSION &&
        Number.isFinite(candidate.createdAt) &&
        Array.isArray(candidate.pages) &&
        Array.isArray(candidate.visits)
    );
}

function parseManifest(line: string): NativeBackupManifest {
    let value: unknown;
    try {
        value = JSON.parse(line);
    } catch {
        throw new Error('Invalid native backup manifest JSON.');
    }
    if (!value || typeof value !== 'object') throw new Error('Native backup manifest is malformed.');
    const manifest = value as NativeBackupManifest;
    if (
        manifest.format !== 'histories-native-backup' ||
        manifest.version !== NATIVE_BACKUP_FORMAT_VERSION ||
        !Number.isFinite(manifest.pageCount) ||
        !Number.isFinite(manifest.visitCount) ||
        !Array.isArray(manifest.entries) ||
        !Array.isArray(manifest.sources) ||
        !Array.isArray(manifest.importBatches)
    ) {
        throw new Error('Unsupported or malformed native backup manifest.');
    }
    return manifest;
}

async function* readBlobLines(blob: Blob): AsyncGenerator<string> {
    const reader = blob.stream().getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let buffer = '';
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let newline = buffer.indexOf('\n');
            while (newline >= 0) {
                yield buffer.slice(0, newline).replace(/\r$/, '');
                buffer = buffer.slice(newline + 1);
                newline = buffer.indexOf('\n');
            }
        }
        buffer += decoder.decode();
        if (buffer) yield buffer.replace(/\r$/, '');
    } finally {
        reader.releaseLock();
    }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
