export type BookmarkItem = {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  tags: string[];
  description?: string;
};

export type BookmarkGroup = {
  id: string;
  title: string;
  collapsed: boolean;
  items: BookmarkItem[];
};

export type OrganizeMode = 'bookmark' | 'folder';

export type FilterState =
  | { type: 'all'; tag?: undefined }
  | { type: 'recent'; tag?: undefined }
  | { type: 'tag'; tag: string };
