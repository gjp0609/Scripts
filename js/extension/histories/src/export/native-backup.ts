import type { PageChunkRecord, VisitChunkRecord } from '../storage/schema';
import { NATIVE_BACKUP_FORMAT_VERSION } from '../storage/schema';

export type NativeHistoryBackup = {
    format: 'histories-native-backup';
    version: number;
    createdAt: number;
    pages: PageChunkRecord[];
    visits: VisitChunkRecord[];
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
