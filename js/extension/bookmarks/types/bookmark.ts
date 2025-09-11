// 书签数据结构定义

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  folderId: string;
  tags: string[];
  description: string;
  searchUrl?: string; // 搜索URL，包含${keyword}占位符，仅用于search标签
  favicon?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: string;
  title: string;
  bookmarks: Bookmark[];
  createdAt: number;
  updatedAt: number;
}

export interface BookmarkData {
  folders: Folder[];
  tags: string[];
}

export interface SearchEngine {
  id: string;
  title: string;
  url: string; // 网站URL
  searchUrl?: string; // 搜索URL，包含 ${keyword} 占位符，仅用于search标签
  tags: string[]; // 包含 'search' 或 'search_site'
}

export interface ImportExportData {
  version: string;
  exportDate: number;
  data: BookmarkData;
}

// 右键菜单操作类型
export interface ContextMenuData {
  url: string;
  title: string;
  favIconUrl?: string;
}

// 拖拽数据类型
export interface DragData {
  type: 'bookmark' | 'folder';
  id: string;
  sourceFolder?: string;
}

// 搜索相关类型
export interface SearchResult {
  bookmarks: Bookmark[];
  folders: Folder[];
}

export interface PowerSearchState {
  query: string;
  isSearchMode: boolean;
  selectedEngine?: SearchEngine;
  suggestions: SearchEngine[];
}
