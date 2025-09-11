// Chrome Storage API 封装
import type { BookmarkData, Folder, Bookmark } from '@/types/bookmark';

// Favicon缓存项的类型定义
interface FaviconCacheItem {
  data: string; // Base64数据
  timestamp: number; // 缓存时间
  size: number; // 数据大小（字节）
}

type FaviconCache = Record<string, FaviconCacheItem>;

const STORAGE_KEYS = {
  BOOKMARKS: 'bookmarks_data',
  FAVICON_CACHE: 'favicon_cache',
  SETTINGS: 'settings'
} as const;

export class StorageManager {
  // 获取所有书签数据
  static async getBookmarkData(): Promise<BookmarkData> {
    try {
      const result = await browser.storage.local.get(STORAGE_KEYS.BOOKMARKS);
      const data = result[STORAGE_KEYS.BOOKMARKS] || { folders: [], tags: [] };

      // 数据迁移：确保所有书签的tags字段都是数组
      data.folders.forEach((folder: any) => {
        folder.bookmarks.forEach((bookmark: any) => {
          if (!Array.isArray(bookmark.tags)) {
            bookmark.tags = [];
          }
        });
      });

      return data;
    } catch (error) {
      console.error('Failed to get bookmark data:', error);
      return { folders: [], tags: [] };
    }
  }

  // 保存书签数据
  static async saveBookmarkData(data: BookmarkData): Promise<void> {
    try {
      await browser.storage.local.set({
        [STORAGE_KEYS.BOOKMARKS]: data
      });
    } catch (error) {
      console.error('Failed to save bookmark data:', error);
      throw error;
    }
  }

  // 获取文件夹
  static async getFolders(): Promise<Folder[]> {
    const data = await this.getBookmarkData();
    return data.folders;
  }

  // 添加文件夹
  static async addFolder(folder: Omit<Folder, 'id' | 'createdAt' | 'updatedAt'>): Promise<Folder> {
    const data = await this.getBookmarkData();
    const newFolder: Folder = {
      ...folder,
      id: this.generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    data.folders.push(newFolder);
    await this.saveBookmarkData(data);
    return newFolder;
  }

  // 更新文件夹
  static async updateFolder(folderId: string, updates: Partial<Folder>): Promise<void> {
    const data = await this.getBookmarkData();
    const folderIndex = data.folders.findIndex(f => f.id === folderId);

    if (folderIndex !== -1) {
      data.folders[folderIndex] = {
        ...data.folders[folderIndex],
        ...updates,
        updatedAt: Date.now()
      };
      await this.saveBookmarkData(data);
    }
  }

  // 删除文件夹
  static async deleteFolder(folderId: string): Promise<void> {
    const data = await this.getBookmarkData();
    data.folders = data.folders.filter(f => f.id !== folderId);
    await this.saveBookmarkData(data);
  }

  // 添加书签
  static async addBookmark(bookmark: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>): Promise<Bookmark> {
    const data = await this.getBookmarkData();
    const newBookmark: Bookmark = {
      ...bookmark,
      id: this.generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // 找到目标文件夹
    const folderIndex = data.folders.findIndex(f => f.id === bookmark.folderId);
    if (folderIndex !== -1) {
      data.folders[folderIndex].bookmarks.push(newBookmark);
      data.folders[folderIndex].updatedAt = Date.now();

      // 更新标签列表
      const tags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
      tags.forEach(tag => {
        if (!data.tags.includes(tag)) {
          data.tags.push(tag);
        }
      });

      await this.saveBookmarkData(data);
    }

    return newBookmark;
  }

  // 更新书签
  static async updateBookmark(bookmarkId: string, updates: Partial<Bookmark>): Promise<void> {
    const data = await this.getBookmarkData();

    for (const folder of data.folders) {
      const bookmarkIndex = folder.bookmarks.findIndex(b => b.id === bookmarkId);
      if (bookmarkIndex !== -1) {
        const oldBookmark = folder.bookmarks[bookmarkIndex];
        
        folder.bookmarks[bookmarkIndex] = {
          ...folder.bookmarks[bookmarkIndex],
          ...updates,
          updatedAt: Date.now()
        };
        folder.updatedAt = Date.now();

        // 更新标签列表
        if (updates.tags && Array.isArray(updates.tags)) {
          const newTags = updates.tags;
          const oldTags = Array.isArray(oldBookmark.tags) ? oldBookmark.tags : [];
          
          // 添加新标签
          newTags.forEach(tag => {
            if (!data.tags.includes(tag)) {
              data.tags.push(tag);
            }
          });
          
          // 清理不再使用的标签
          if (oldTags.length > 0) {
            const allBookmarks = data.folders.flatMap(f => f.bookmarks);
            const usedTags = new Set<string>();
            
            // 收集所有仍在使用的标签
            allBookmarks.forEach(bookmark => {
              if (Array.isArray(bookmark.tags)) {
                bookmark.tags.forEach(tag => usedTags.add(tag));
              }
            });
            
            // 只保留仍在使用的标签
            data.tags = data.tags.filter(tag => usedTags.has(tag));
          }
        }

        await this.saveBookmarkData(data);
        break;
      }
    }
  }

  // 删除书签
  static async deleteBookmark(bookmarkId: string): Promise<void> {
    const data = await this.getBookmarkData();

    for (const folder of data.folders) {
      const bookmarkIndex = folder.bookmarks.findIndex(b => b.id === bookmarkId);
      if (bookmarkIndex !== -1) {
        const deletedBookmark = folder.bookmarks[bookmarkIndex];
        folder.bookmarks.splice(bookmarkIndex, 1);
        folder.updatedAt = Date.now();

        // 清理不再使用的标签
        if (deletedBookmark.tags && Array.isArray(deletedBookmark.tags) && deletedBookmark.tags.length > 0) {
          const allBookmarks = data.folders.flatMap(f => f.bookmarks);
          const usedTags = new Set<string>();
          
          // 收集所有仍在使用的标签
          allBookmarks.forEach(bookmark => {
            if (Array.isArray(bookmark.tags)) {
              bookmark.tags.forEach(tag => usedTags.add(tag));
            }
          });
          
          // 只保留仍在使用的标签
          data.tags = data.tags.filter(tag => usedTags.has(tag));
        }

        await this.saveBookmarkData(data);
        break;
      }
    }
  }

  // 移动书签到其他文件夹
  static async moveBookmark(bookmarkId: string, targetFolderId: string): Promise<void> {
    const data = await this.getBookmarkData();
    let bookmark: Bookmark | null = null;

    // 从原文件夹移除
    for (const folder of data.folders) {
      const bookmarkIndex = folder.bookmarks.findIndex(b => b.id === bookmarkId);
      if (bookmarkIndex !== -1) {
        bookmark = folder.bookmarks.splice(bookmarkIndex, 1)[0];
        folder.updatedAt = Date.now();
        break;
      }
    }

    // 添加到目标文件夹
    if (bookmark) {
      const targetFolder = data.folders.find(f => f.id === targetFolderId);
      if (targetFolder) {
        bookmark.folderId = targetFolderId;
        bookmark.updatedAt = Date.now();
        targetFolder.bookmarks.push(bookmark);
        targetFolder.updatedAt = Date.now();
        await this.saveBookmarkData(data);
      }
    }
  }

  // 获取Favicon缓存
  static async getFaviconCache(): Promise<Record<string, string>> {
    try {
      const result = await browser.storage.local.get(STORAGE_KEYS.FAVICON_CACHE);
      const cache: FaviconCache = result[STORAGE_KEYS.FAVICON_CACHE] || {};
      
      // 转换为简单的字符串映射，兼容旧版本
      const simpleCache: Record<string, string> = {};
      for (const [domain, item] of Object.entries(cache)) {
        if (typeof item === 'string') {
          // 旧版本的缓存格式
          simpleCache[domain] = item;
        } else if (item && typeof item === 'object' && item.data) {
          // 新版本的缓存格式
          simpleCache[domain] = item.data;
        }
      }
      
      return simpleCache;
    } catch (error) {
      console.error('Failed to get favicon cache:', error);
      return {};
    }
  }

  // 获取带时间戳的Favicon缓存
  static async getFaviconCacheWithTimestamp(): Promise<FaviconCache> {
    try {
      const result = await browser.storage.local.get(STORAGE_KEYS.FAVICON_CACHE);
      return result[STORAGE_KEYS.FAVICON_CACHE] || {};
    } catch (error) {
      console.error('Failed to get favicon cache with timestamp:', error);
      return {};
    }
  }

  // 保存Favicon到缓存
  static async saveFaviconToCache(domain: string, faviconData: string): Promise<void> {
    try {
      const cache = await this.getFaviconCacheWithTimestamp();
      const cacheItem: FaviconCacheItem = {
        data: faviconData,
        timestamp: Date.now(),
        size: faviconData.length
      };
      
      cache[domain] = cacheItem;
      
      await browser.storage.local.set({
        [STORAGE_KEYS.FAVICON_CACHE]: cache
      });
      
      // 定期清理缓存（异步执行）
      this.cleanupFaviconCacheAsync();
    } catch (error) {
      console.error('Failed to save favicon to cache:', error);
    }
  }

  // 异步清理缓存
  private static cleanupFaviconCacheAsync(): void {
    // 使用setTimeout异步执行，不阻塞当前操作
    setTimeout(() => {
      this.cleanupFaviconCache().catch(error => {
        console.error('Failed to cleanup favicon cache:', error);
      });
    }, 100);
  }

  // 清理过期的Favicon缓存
  static async cleanupFaviconCache(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const cache = await this.getFaviconCacheWithTimestamp();
      const now = Date.now();
      const cleanedCache: FaviconCache = {};
      let totalSize = 0;
      const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB限制
      
      // 按时间排序，保留最新的
      const sortedEntries = Object.entries(cache)
        .filter(([_, item]) => {
          // 兼容旧版本数据
          if (typeof item === 'string') {
            return true; // 保留旧数据
          }
          return item && typeof item === 'object' && (now - item.timestamp) < maxAge;
        })
        .sort(([, a], [, b]) => {
          const timeA = typeof a === 'string' ? now : a.timestamp;
          const timeB = typeof b === 'string' ? now : b.timestamp;
          return timeB - timeA; // 新的在前
        });
      
      // 按大小限制保留
      for (const [domain, item] of sortedEntries) {
        const itemSize = typeof item === 'string' ? (item as string).length : ((item as any)?.size || 0);
        if (totalSize + itemSize <= MAX_CACHE_SIZE) {
          cleanedCache[domain] = item;
          totalSize += itemSize;
        } else {
          break; // 超出大小限制
        }
      }
      
      await browser.storage.local.set({
        [STORAGE_KEYS.FAVICON_CACHE]: cleanedCache
      });
      
      console.log(`Favicon cache cleaned: ${Object.keys(cache).length} -> ${Object.keys(cleanedCache).length} items, ${Math.round(totalSize / 1024)}KB`);
    } catch (error) {
      console.error('Failed to cleanup favicon cache:', error);
    }
  }

  // 生成唯一ID
  private static generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // 确保"未分类"文件夹存在
  static async ensureUncategorizedFolder(): Promise<Folder> {
    const data = await this.getBookmarkData();
    let uncategorizedFolder = data.folders.find(f => f.title === '未分类');

    if (!uncategorizedFolder) {
      uncategorizedFolder = await this.addFolder({
        title: '未分类',
        bookmarks: []
      });
    }

    return uncategorizedFolder;
  }

  // 清空所有数据
  static async clearAllData(): Promise<void> {
    try {
      await browser.storage.local.clear();
    } catch (error) {
      console.error('Failed to clear all data:', error);
      throw error;
    }
  }
}
