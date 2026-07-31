export type BrowserBookmarkNode = {
  id: string;
  parentId?: string;
  index?: number;
  title: string;
  url?: string;
  children?: BrowserBookmarkNode[];
};

export type BookmarkExtra = {
  bookmarkId: string;
  tags: string[];
  description?: string;
  searchUrl?: string;
  faviconOverride?: string;
  updatedAt: number;
};

export type BookmarkView = BrowserBookmarkNode & {
  extra: BookmarkExtra;
  domain: string;
  accent: string;
  faviconUrls: string[];
};

export type FolderView = {
  id: string;
  title: string;
  index: number;
  bookmarks: BookmarkView[];
  collapsed?: boolean;
};

export type UiPreferences = {
  collapsedFolderIds: string[];
  searchEngine: string;
};

export type BuiltinSearchEngineId = 'bing' | 'google';
export type SearchEngineId = string;

export type SearchEngineOption = {
  id: string;
  title: string;
  searchUrl: string;
  domain: string;
  faviconUrls: string[];
  builtin: boolean;
  bookmarkId?: string;
};

export type TagSummary = {
  name: string;
  normalizedName: string;
  count: number;
  searchCapability: boolean;
};

export type SearchResultItem =
  | {
      type: 'bookmark';
      id: string;
      title: string;
      url: string;
      domain: string;
      folderTitle: string;
      tags: string[];
      accent: string;
      faviconUrls: string[];
    }
  | {
      type: 'engine';
      id: string;
      title: string;
      url: string;
      domain: string;
      tags: string[];
      accent: string;
      faviconUrls: string[];
    };

export type QuickSearchTarget = {
  bookmarkId: string;
  title: string;
  domain: string;
  kind: 'search_site';
  url: string;
  tags: string[];
  accent: string;
  faviconUrls: string[];
};

export type TagSearchState = {
  query: string;
  matches: TagSummary[];
  exactTag?: TagSummary;
};

export type FullExportData = {
  version: 1;
  exportedAt: string;
  folders: Array<{
    title: string;
    index?: number;
    bookmarks: Array<{
      title: string;
      url: string;
      index?: number;
      extra?: BookmarkExtra;
    }>;
  }>;
  extras?: Record<string, BookmarkExtra>;
  preferences?: Partial<UiPreferences>;
};
