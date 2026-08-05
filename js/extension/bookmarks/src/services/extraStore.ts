import { browser } from 'wxt/browser';
import type { BookmarkExtra, UiPreferences } from '../types/bookmark';

const EXTRA_KEY_PREFIX = 'markhubExtra:';
const SEARCH_ENGINE_KEY = 'markhubPreference:searchEngine';
const COLLAPSED_FOLDERS_KEY = 'markhubPreference:collapsedFolderIds';
const BACKUP_ORIGIN_KEY = 'markhubBackupOriginId';
const STORAGE_VERSION_KEY = 'markhubStorageVersion';
const STORAGE_VERSION = 2;
const LEGACY_EXTRAS_KEY = 'markhubExtras';
const LEGACY_PREFERENCES_KEY = 'markhubPreferences';

const defaultPreferences: UiPreferences = {
  collapsedFolderIds: [],
  searchEngine: 'auto'
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

export async function replaceExtras(extras: Record<string, BookmarkExtra>): Promise<void> {
  await ensureStorageMigrated();
  const current = await browser.storage.local.get(null) as Record<string, unknown>;
  const currentKeys = Object.keys(current).filter((key) => key.startsWith(EXTRA_KEY_PREFIX));
  if (currentKeys.length) await browser.storage.local.remove(currentKeys);
  const next = Object.fromEntries(
    Object.entries(extras).map(([bookmarkId, extra]) => [`${EXTRA_KEY_PREFIX}${bookmarkId}`, extra])
  );
  if (Object.keys(next).length) await browser.storage.local.set(next);
}

export async function cleanupExtras(validBookmarkIds: Set<string>): Promise<void> {
  const extras = await getExtras();
  await removeExtras(Object.keys(extras).filter((id) => !validBookmarkIds.has(id)));
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
