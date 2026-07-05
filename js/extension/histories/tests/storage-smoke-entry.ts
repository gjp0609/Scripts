import {
  getDatabaseSummary,
  getJob,
  getLatestSearchSnapshot,
  getPageById,
  getPageByNormalizedUrl,
  getVisitsByPageAndTimeRange,
  getVisitsByTimeRange,
  getVisitsByTransitionAndTimeRange,
  normalizeHistoryUrl,
  openHistoriesDatabase,
  putJob,
  putSearchSnapshot,
  putVisits,
  upsertPage
} from '../src/storage/database';
import { DATABASE_NAME } from '../src/storage/schema';

type SmokeResult = {
  pageCount: number;
  visitCount: number;
  rangeIds: string[];
  pageRangeIds: string[];
  transitionRangeIds: string[];
  reverseIds: string[];
};

declare global {
  interface Window {
    runHistoriesStorageSmoke: () => Promise<SmokeResult>;
  }
}

window.runHistoriesStorageSmoke = async () => {
  await deleteDatabase(DATABASE_NAME);

  const page = await upsertPage({
    url: 'https://example.com/docs/index.html#section',
    title: 'Original title',
    visitCount: 1,
    lastVisitTime: 1000
  });
  ensure(page.id > 0, 'page id should be generated');
  ensure(page.normalizedUrl === 'https://example.com/docs/index.html', 'hash should be removed');
  ensure(page.host === 'example.com', 'host should be derived');
  ensure(page.domain === 'example.com', 'domain should be derived');

  const updatedPage = await upsertPage({
    url: 'https://example.com/docs/index.html',
    title: 'Updated title',
    visitCount: 2,
    lastVisitTime: 3000
  });
  ensure(updatedPage.id === page.id, 'normalized url should upsert existing page');
  ensure(updatedPage.title === 'Updated title', 'page title should update');
  ensure(updatedPage.lastVisitTime === 3000, 'last visit time should advance');

  const otherPage = await upsertPage({
    url: 'https://sub.example.org/path',
    title: 'Other page',
    visitCount: 2,
    lastVisitTime: 4000
  });

  await putVisits([
    { id: 'v-1000-link', pageId: page.id, visitTime: 1000, transition: 'link' },
    { id: 'v-2000-typed', pageId: page.id, visitTime: 2000, transition: 'typed' },
    { id: 'v-3000-link', pageId: otherPage.id, visitTime: 3000, transition: 'link' },
    { id: 'v-4000-reload', pageId: otherPage.id, visitTime: 4000, transition: 'reload' }
  ]);

  const byId = await getPageById(page.id);
  ensure(byId?.title === 'Updated title', 'getPageById should read updated page');

  const byNormalizedUrl = await getPageByNormalizedUrl(normalizeHistoryUrl(page.url));
  ensure(byNormalizedUrl?.id === page.id, 'getPageByNormalizedUrl should use normalizedUrl index');

  const timeRange = await getVisitsByTimeRange({ startTime: 1500, endTime: 3500 });
  ensureIds(
    timeRange.map((visit) => visit.id),
    ['v-2000-typed', 'v-3000-link'],
    'visitTime range should return ordered inclusive matches'
  );

  const pageRange = await getVisitsByPageAndTimeRange(page.id, { startTime: 0, endTime: 2500 });
  ensureIds(
    pageRange.map((visit) => visit.id),
    ['v-1000-link', 'v-2000-typed'],
    'pageTime range should stay inside one page'
  );

  const transitionRange = await getVisitsByTransitionAndTimeRange('link', {
    startTime: 0,
    endTime: 3500
  });
  ensureIds(
    transitionRange.map((visit) => visit.id),
    ['v-1000-link', 'v-3000-link'],
    'transitionTime range should stay inside one transition'
  );

  const reverse = await getVisitsByTimeRange({ limit: 2, reverse: true });
  ensureIds(
    reverse.map((visit) => visit.id),
    ['v-4000-reload', 'v-3000-link'],
    'reverse limited scan should read newest visits first'
  );

  await putJob({
    id: 'job-1',
    type: 'htu-import',
    status: 'running',
    updatedAt: 5000,
    progress: { rows: 10 }
  });
  ensure((await getJob('job-1'))?.status === 'running', 'job should round-trip');

  await putSearchSnapshot({
    key: 'latest',
    schemaVersion: 1,
    sqliteVersion: '3.46.1',
    createdAt: 6000,
    sourceRevision: 'smoke',
    bytes: new Uint8Array([1, 2, 3]),
    pageCount: 2,
    snapshotSize: 3
  });
  ensure((await getLatestSearchSnapshot())?.snapshotSize === 3, 'snapshot should round-trip');

  const summary = await getDatabaseSummary();
  ensure(summary.pages === 2, 'summary should count pages');
  ensure(summary.visits === 4, 'summary should count visits');
  ensure(summary.jobs === 1, 'summary should count jobs');
  ensure(summary.hasSearchSnapshot, 'summary should report snapshot');

  const db = await openHistoriesDatabase();
  db.close();

  await deleteDatabase(DATABASE_NAME);

  return {
    pageCount: summary.pages,
    visitCount: summary.visits,
    rangeIds: timeRange.map((visit) => visit.id),
    pageRangeIds: pageRange.map((visit) => visit.id),
    transitionRangeIds: transitionRange.map((visit) => visit.id),
    reverseIds: reverse.map((visit) => visit.id)
  };
};

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function ensureIds(actual: string[], expected: string[], message: string) {
  ensure(actual.length === expected.length, `${message}: length mismatch`);

  for (let index = 0; index < expected.length; index += 1) {
    ensure(actual[index] === expected[index], `${message}: expected ${expected[index]} at ${index}`);
  }
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`deleteDatabase blocked: ${name}`));
  });
}

