import { browser } from 'wxt/browser';
import type { BookmarkExtra, UiPreferences } from '../types/bookmark';

const EXTRA_KEY_PREFIX = 'markhubExtra:';
const SEARCH_ENGINE_KEY = 'markhubPreference:searchEngine';
const COLLAPSED_FOLDERS_KEY = 'markhubPreference:collapsedFolderIds';
const BACKUP_ORIGIN_KEY = 'markhubBackupOriginId';
const BACKUP_NODE_MAP_PREFIX = 'markhubBackupNode:';
const STORAGE_VERSION_KEY = 'markhubStorageVersion';
const STORAGE_VERSION = 2;
const LEGACY_EXTRAS_KEY = 'markhubExtras';
const LEGACY_PREFERENCES_KEY = 'markhubPreferences';

const defaultPreferences: UiPreferences = {
  collapsedFolderIds: [],
  searchEngine: 'auto'
};

export type BackupNodeMappingEntry = {
  originId: string;
  sourceId: string;
  targetId: string;
};

async function getLocal<T>(key: string): Promise<T | undefined> {
  const data = await browser.storage.local.get(key) as Record<string, T>;
  return data[key];
}

async function setLocal<T>(key: string, value: T): Promise<void> {
  await browser.storage.local.set({ [key]: value });
}

let migrationPromise: Promise<void> | undefined;

async function ensureStorageMigrated(): Promise<void> {
  migrationPromise ??= (async () => {
    const data = await browser.storage.local.get(null) as Record<string, unknown>;
    if (data[STORAGE_VERSION_KEY] === STORAGE_VERSION) return;

    const next: Record<string, unknown> = { [STORAGE_VERSION_KEY]: STORAGE_VERSION };
    const legacyExtras = data[LEGACY_EXTRAS_KEY];
    if (legacyExtras && typeof legacyExtras === 'object') {
      Object.entries(legacyExtras as Record<string, BookmarkExtra>).forEach(([bookmarkId, extra]) => {
        const key = `${EXTRA_KEY_PREFIX}${bookmarkId}`;
        if (!(key in data)) next[key] = extra;
      });
    }

    const legacyPreferences = data[LEGACY_PREFERENCES_KEY];
    if (legacyPreferences && typeof legacyPreferences === 'object') {
      const preferences = legacyPreferences as Partial<UiPreferences>;
      if (!(SEARCH_ENGINE_KEY in data) && typeof preferences.searchEngine === 'string') {
        next[SEARCH_ENGINE_KEY] = preferences.searchEngine;
      }
      if (!(COLLAPSED_FOLDERS_KEY in data) && Array.isArray(preferences.collapsedFolderIds)) {
        next[COLLAPSED_FOLDERS_KEY] = preferences.collapsedFolderIds;
      }
    }

    await browser.storage.local.set(next);
    await browser.storage.local.remove([LEGACY_EXTRAS_KEY, LEGACY_PREFERENCES_KEY]);
  })();
  await migrationPromise;
}

export async function getExtras(): Promise<Record<string, BookmarkExtra>> {
  await ensureStorageMigrated();
  const data = await browser.storage.local.get(null) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(data)
      .filter(([key, value]) => key.startsWith(EXTRA_KEY_PREFIX) && value && typeof value === 'object')
      .map(([key, value]) => [key.slice(EXTRA_KEY_PREFIX.length), value as BookmarkExtra])
  );
}

export async function getExtra(bookmarkId: string): Promise<BookmarkExtra | undefined> {
  await ensureStorageMigrated();
  return getLocal<BookmarkExtra>(`${EXTRA_KEY_PREFIX}${bookmarkId}`);
}

export async function saveExtra(extra: BookmarkExtra): Promise<void> {
  await ensureStorageMigrated();
  await setLocal(`${EXTRA_KEY_PREFIX}${extra.bookmarkId}`, {
    ...extra,
    updatedAt: Date.now()
  });
}

export async function restoreExtra(extra: BookmarkExtra): Promise<void> {
  await ensureStorageMigrated();
  await setLocal(`${EXTRA_KEY_PREFIX}${extra.bookmarkId}`, extra);
}

export async function removeExtra(bookmarkId: string): Promise<void> {
  await ensureStorageMigrated();
  await browser.storage.local.remove(`${EXTRA_KEY_PREFIX}${bookmarkId}`);
}

export async function removeExtras(bookmarkIds: string[]): Promise<void> {
  if (!bookmarkIds.length) return;
  await ensureStorageMigrated();
  await browser.storage.local.remove(bookmarkIds.map((bookmarkId) => `${EXTRA_KEY_PREFIX}${bookmarkId}`));
}

export async function removeExtrasWithRetry(bookmarkIds: string[], attempts = 3): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await removeExtras(bookmarkIds);
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('清理书签附加数据失败');
}

export async function applyExtraPatch(changes: ReadonlyMap<string, BookmarkExtra | undefined>): Promise<void> {
  await ensureStorageMigrated();
  const values = Object.fromEntries(
    [...changes.entries()]
      .filter((entry): entry is [string, BookmarkExtra] => Boolean(entry[1]))
      .map(([bookmarkId, extra]) => [`${EXTRA_KEY_PREFIX}${bookmarkId}`, extra])
  );
  const removedKeys = [...changes.entries()]
    .filter(([, extra]) => !extra)
    .map(([bookmarkId]) => `${EXTRA_KEY_PREFIX}${bookmarkId}`);
  if (Object.keys(values).length) await browser.storage.local.set(values);
  if (removedKeys.length) await browser.storage.local.remove(removedKeys);
}

export async function getPreferences(): Promise<UiPreferences> {
  await ensureStorageMigrated();
  const data = await browser.storage.local.get([SEARCH_ENGINE_KEY, COLLAPSED_FOLDERS_KEY]) as Record<string, unknown>;
  return {
    searchEngine: typeof data[SEARCH_ENGINE_KEY] === 'string' ? data[SEARCH_ENGINE_KEY] : defaultPreferences.searchEngine,
    collapsedFolderIds: Array.isArray(data[COLLAPSED_FOLDERS_KEY])
      ? data[COLLAPSED_FOLDERS_KEY].filter((id): id is string => typeof id === 'string')
      : defaultPreferences.collapsedFolderIds
  };
}

export async function savePreferences(preferences: UiPreferences): Promise<void> {
  await ensureStorageMigrated();
  await browser.storage.local.set({
    [SEARCH_ENGINE_KEY]: preferences.searchEngine,
    [COLLAPSED_FOLDERS_KEY]: preferences.collapsedFolderIds
  });
}

export async function saveSearchEngine(searchEngine: string): Promise<void> {
  await ensureStorageMigrated();
  await setLocal(SEARCH_ENGINE_KEY, searchEngine);
}

export async function saveCollapsedFolderIds(collapsedFolderIds: string[]): Promise<void> {
  await ensureStorageMigrated();
  await setLocal(COLLAPSED_FOLDERS_KEY, collapsedFolderIds);
}

export async function getBackupOriginId(): Promise<string> {
  const current = await getLocal<string>(BACKUP_ORIGIN_KEY);
  if (current) return current;
  const originId = crypto.randomUUID();
  await setLocal(BACKUP_ORIGIN_KEY, originId);
  return originId;
}

function backupNodeMapPrefix(originId: string): string {
  return `${BACKUP_NODE_MAP_PREFIX}${encodeURIComponent(originId)}:`;
}

export async function getBackupNodeMappings(originId: string): Promise<Map<string, string>> {
  const prefix = backupNodeMapPrefix(originId);
  const data = await browser.storage.local.get(null) as Record<string, unknown>;
  return new Map(
    Object.entries(data)
      .filter((entry): entry is [string, string] => entry[0].startsWith(prefix) && typeof entry[1] === 'string')
      .map(([key, targetId]) => [decodeURIComponent(key.slice(prefix.length)), targetId])
  );
}

export async function getAllBackupNodeMappings(): Promise<BackupNodeMappingEntry[]> {
  const data = await browser.storage.local.get(null) as Record<string, unknown>;
  const entries: BackupNodeMappingEntry[] = [];
  const prefix = BACKUP_NODE_MAP_PREFIX;
  for (const [key, targetId] of Object.entries(data)) {
    if (!key.startsWith(prefix) || typeof targetId !== 'string' || !targetId) continue;
    const separator = key.indexOf(':', prefix.length);
    if (separator < 0) continue;
    const originEncoded = key.slice(prefix.length, separator);
    const sourceEncoded = key.slice(separator + 1);
    try {
      const originId = decodeURIComponent(originEncoded);
      const sourceId = decodeURIComponent(sourceEncoded);
      if (originId && sourceId) entries.push({ originId, sourceId, targetId });
    } catch {
      // Invalid maintenance keys are intentionally ignored by the reader.
    }
  }
  return entries;
}

export async function removeBackupNodeMappings(entries: readonly BackupNodeMappingEntry[]): Promise<void> {
  if (!entries.length) return;
  await ensureStorageMigrated();
  const keys = entries.map(({ originId, sourceId }) => `${backupNodeMapPrefix(originId)}${encodeURIComponent(sourceId)}`);
  await browser.storage.local.remove(keys);
}

export async function applyBackupNodeMappingPatch(
  originId: string,
  changes: ReadonlyMap<string, string | undefined>
): Promise<void> {
  const prefix = backupNodeMapPrefix(originId);
  const values = Object.fromEntries(
    [...changes.entries()]
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([sourceId, targetId]) => [`${prefix}${encodeURIComponent(sourceId)}`, targetId])
  );
  const removedKeys = [...changes.entries()]
    .filter(([, targetId]) => !targetId)
    .map(([sourceId]) => `${prefix}${encodeURIComponent(sourceId)}`);
  if (Object.keys(values).length) await browser.storage.local.set(values);
  if (removedKeys.length) await browser.storage.local.remove(removedKeys);
}
