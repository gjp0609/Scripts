import { exportNativeHistoryBackup, restoreNativeHistoryBackup } from '../src/export/native-backup';
import { importHtuFiles } from '../src/import/htu-multi-import';
import { getDatabaseSummary, listHistorySources, listImportBatches } from '../src/storage/database';
import { DATABASE_NAME } from '../src/storage/schema';

declare global {
    interface Window {
        runNativeBackupBrowserSmoke: () => Promise<unknown>;
    }
}

window.runNativeBackupBrowserSmoke = async () => {
    await deleteDatabase(DATABASE_NAME);
    const text = [
        'https://example.com/a\tU1700000000000\t0\tA',
        'https://example.com/b\tU1700000001000\t1\tB',
        '',
    ].join('\r\n');
    await importHtuFiles([{ name: 'source.tsv', bytes: new TextEncoder().encode(text) }]);
    const before = await getDatabaseSummary();
    const beforeSources = await listHistorySources();
    const beforeBatches = await listImportBatches();
    const exported = await exportNativeHistoryBackup(new Date('2026-08-21T00:00:00Z'));
    const bytes = new Uint8Array(await exported.blob.arrayBuffer());

    await deleteDatabase(DATABASE_NAME);
    const restored = await restoreNativeHistoryBackup(new Blob([bytes]));
    const after = await getDatabaseSummary();
    const afterSources = await listHistorySources();
    const afterBatches = await listImportBatches();

    await deleteDatabase(DATABASE_NAME);
    const tampered = bytes.slice();
    tampered[tampered.length - 4] ^= 1;
    let tamperRejected = false;
    try {
        await restoreNativeHistoryBackup(new Blob([tampered]));
    } catch {
        tamperRejected = true;
    }
    const afterTamper = await getDatabaseSummary();
    return {
        before,
        after,
        restored,
        sourceCount: [beforeSources.length, afterSources.length],
        batchCount: [beforeBatches.length, afterBatches.length],
        manifest: exported.manifest,
        filename: exported.filename,
        tamperRejected,
        tamperVisits: afterTamper.visits,
    };
};

function deleteDatabase(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error(`deleteDatabase blocked: ${name}`));
    });
}
