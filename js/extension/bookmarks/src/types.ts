export type BookmarkItem = {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  tags: string[];
  description?: string;
  /** 添加时间戳（ms）；mock 数据导入项为 0，原型内新增项有真实时间 */
  dateAdded: number;
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
