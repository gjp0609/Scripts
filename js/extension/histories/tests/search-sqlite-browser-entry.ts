import { importHtuText } from '../src/import/htu-import';
import { SearchEngine } from '../src/search/search-engine';
import { createIndexedDbSearchStorage } from '../src/search/storage-adapter';
import { loadSqliteWasmSearchRuntime } from '../src/search/sqlite-wasm-runtime';
import { getLatestSearchSnapshot } from '../src/storage/database';
import { DATABASE_NAME } from '../src/storage/schema';

type BrowserSearchResult = {
  sqliteVersion: string;
  rebuiltPages: number;
  snapshotSize: number;
  searchPageIds: number[];
  timeFilteredPageIds: number[];
};

declare global {
  interface Window {
    runHistoriesSearchSqliteBrowserSmoke: () => Promise<BrowserSearchResult>;
  }
}

window.runHistoriesSearchSqliteBrowserSmoke = async () => {
  await deleteDatabase(DATABASE_NAME);

  const source = [
    'https://www.ruanyifeng.com/blog/2025/07/example.html\tU1720000000000\t0\tRuanyifeng Example',
    'https://www.ruanyifeng.com/blog/2026/07/another.html\tU1780000000000\t1\tAnother Title',
    'https://example.com/other\tU1710000000000\t8\tOther Title',
    ''
  ].join('\r\n');

  await importHtuText(source, {
    pageChunkSize: 2,
    visitChunkSize: 2
  });

  const runtime = await loadSqliteWasmSearchRuntime({
    scriptUrl: new URL('/sqlite/sqlite3.js', location.href).toString()
  });
  const storage = createIndexedDbSearchStorage();
  const builder = new SearchEngine({ runtime, storage });
  const rebuilt = await builder.rebuildSnapshot();
  builder.close();

  const snapshot = await getLatestSearchSnapshot();
  ensure(snapshot?.sqliteVersion === rebuilt.sqliteVersion, 'snapshot sqlite version should match runtime');
  ensure(snapshot?.pageCount === 3, 'snapshot should store imported page count');

  const reader = new SearchEngine({ runtime, storage });
  await reader.loadSnapshot();
  const searchRows = await reader.search({ keyword: 'ifen', limit: 10 });
  const timeFilteredRows = await reader.search({
    keyword: 'ifen',
    startTime: 1750000000000,
    endTime: 1790000000000,
    limit: 10
  });
  reader.close();

  ensure(searchRows.length === 2, 'substring search should match both ruanyifeng pages');
  ensure(timeFilteredRows.length === 1, 'time-filtered search should narrow to one page');

  return {
    sqliteVersion: rebuilt.sqliteVersion,
    rebuiltPages: rebuilt.pageCount,
    snapshotSize: rebuilt.snapshotSize,
    searchPageIds: searchRows.map((row) => row.pageId),
    timeFilteredPageIds: timeFilteredRows.map((row) => row.pageId)
  };
};

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`deleteDatabase blocked: ${name}`));
  });
}
