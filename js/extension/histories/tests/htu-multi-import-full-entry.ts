import { importHtuFiles } from '../src/import/htu-multi-import';
import { getDatabaseSummary } from '../src/storage/database';
import { DATABASE_NAME } from '../src/storage/schema';

declare global {
  interface Window {
    runHistoriesMultiImportFull: () => Promise<Record<string, unknown>>;
  }
}

window.runHistoriesMultiImportFull = async () => {
  await deleteDatabase(DATABASE_NAME);
  const [manifest, baselineBytes, incrementalBytes] = await Promise.all([
    fetch('/fixture/manifest').then((response) => response.json()),
    fetch('/fixture/baseline').then((response) => response.arrayBuffer()),
    fetch('/fixture/incremental').then((response) => response.arrayBuffer())
  ]);

  const baselineStartedAt = performance.now();
  const baseline = await importHtuFiles([
    { name: manifest.baselineFile, bytes: new Uint8Array(baselineBytes) }
  ]);
  const baselineMs = performance.now() - baselineStartedAt;

  const incrementalStartedAt = performance.now();
  const incremental = await importHtuFiles([
    { name: manifest.incrementalFile, bytes: new Uint8Array(incrementalBytes) }
  ]);
  const incrementalMs = performance.now() - incrementalStartedAt;

  const repeatedStartedAt = performance.now();
  const repeated = await importHtuFiles([
    { name: manifest.incrementalFile, bytes: new Uint8Array(incrementalBytes) }
  ]);
  const repeatedMs = performance.now() - repeatedStartedAt;
  const summary = await getDatabaseSummary();

  return {
    manifest,
    baselineAdded: baseline.addedVisits,
    baselineIgnored: baseline.ignoredVisits,
    incrementalAdded: incremental.addedVisits,
    incrementalDuplicates: incremental.duplicateVisits,
    repeatedAdded: repeated.addedVisits,
    repeatedDuplicates: repeated.duplicateVisits,
    pages: summary.pages,
    visits: summary.visits,
    baselineMs,
    incrementalMs,
    repeatedMs
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
