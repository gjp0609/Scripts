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
  version: 3;
  exportedAt: string;
  originId: string;
  root: {
    children: ExportBookmarkNode[];
  };
  preferences: UiPreferences;
};

export type ExportFolderNode = {
  sourceId: string;
  title: string;
  children: ExportBookmarkNode[];
};

export type ExportUrlNode = {
  sourceId: string;
  title: string;
  url: string;
  extra?: BookmarkExtra;
};

export type ExportBookmarkNode = ExportFolderNode | ExportUrlNode;
