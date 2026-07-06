import { browser } from 'wxt/browser';
import type { BookmarkExtra, UiPreferences } from '../types/bookmark';

const EXTRAS_KEY = 'markhubExtras';
const PREFERENCES_KEY = 'markhubPreferences';

const defaultPreferences: UiPreferences = {
  collapsedFolderIds: [],
  searchEngine: 'google'
};

async function getLocal<T>(key: string): Promise<T | undefined> {
  const data = await browser.storage.local.get(key) as Record<string, T>;
  return data[key];
}

async function setLocal<T>(key: string, value: T): Promise<void> {
  await browser.storage.local.set({ [key]: value });
}

export async function getExtras(): Promise<Record<string, BookmarkExtra>> {
  return (await getLocal<Record<string, BookmarkExtra>>(EXTRAS_KEY)) ?? {};
}

export async function saveExtra(extra: BookmarkExtra): Promise<void> {
  const extras = await getExtras();
  await setLocal(EXTRAS_KEY, {
    ...extras,
    [extra.bookmarkId]: {
      ...extra,
      updatedAt: Date.now()
    }
  });
}

export async function removeExtra(bookmarkId: string): Promise<void> {
  const extras = await getExtras();
  if (!(bookmarkId in extras)) return;
  const next = { ...extras };
  delete next[bookmarkId];
  await setLocal(EXTRAS_KEY, next);
}

export async function replaceExtras(extras: Record<string, BookmarkExtra>): Promise<void> {
  await setLocal(EXTRAS_KEY, extras);
}

export async function cleanupExtras(validBookmarkIds: Set<string>): Promise<void> {
  const extras = await getExtras();
  const next = Object.fromEntries(Object.entries(extras).filter(([id]) => validBookmarkIds.has(id)));
  if (Object.keys(next).length !== Object.keys(extras).length) {
    await setLocal(EXTRAS_KEY, next);
  }
}

export async function getPreferences(): Promise<UiPreferences> {
  return {
    ...defaultPreferences,
    ...((await getLocal<UiPreferences>(PREFERENCES_KEY)) ?? {})
  };
}

export async function savePreferences(preferences: UiPreferences): Promise<void> {
  await setLocal(PREFERENCES_KEY, preferences);
}
