// 书签管理核心逻辑
import type { Bookmark, Folder, BookmarkData, SearchResult, SearchEngine } from '@/types/bookmark';
import { StorageManager } from './storage';
import { FaviconManager } from './favicon';

export class BookmarkManager {
  /**
   * 添加新书签
   */
  static async addBookmark(bookmarkData: {
    title: string;
    url: string;
    folderId?: string;
    tags?: string[];
    description?: string;
    searchUrl?: string;
    skipFavicon?: boolean;
  }): Promise<Bookmark> {
    // 确保有文件夹ID，如果没有则使用"未分类"
    let folderId = bookmarkData.folderId;
    if (!folderId) {
      const uncategorizedFolder = await StorageManager.ensureUncategorizedFolder();
      folderId = uncategorizedFolder.id;
    }

    // 默认使用默认图标，不自动获取favicon
    let favicon = FaviconManager.getDefaultFavicon();

    // 只有明确要求获取favicon时才获取
    if (bookmarkData.skipFavicon === false) {
      try {
        favicon = await FaviconManager.getFavicon(bookmarkData.url);
      } catch (error) {
        console.warn('Failed to get favicon during bookmark creation:', error);
        // 使用默认图标，不阻塞书签创建
        favicon = FaviconManager.getDefaultFavicon();
      }
    }

    const bookmark = await StorageManager.addBookmark({
      title: bookmarkData.title,
      url: bookmarkData.url,
      folderId,
      tags: bookmarkData.tags || [],
      description: bookmarkData.description || '',
      searchUrl: bookmarkData.searchUrl || '',
      favicon
    });

    return bookmark;
  }

  /**
   * 快速添加书签到未分类文件夹
   */
  static async quickAddBookmark(url: string, title: string): Promise<Bookmark> {
    const uncategorizedFolder = await StorageManager.ensureUncategorizedFolder();

    return this.addBookmark({
      title,
      url,
      folderId: uncategorizedFolder.id,
      tags: [],
      description: ''
    });
  }

  /**
   * 编辑书签
   */
  static async editBookmark(bookmarkId: string, updates: Partial<Bookmark>): Promise<void> {
    // 不自动获取favicon，保持现有的favicon
    await StorageManager.updateBookmark(bookmarkId, updates);
  }

  /**
   * 删除书签
   */
  static async deleteBookmark(bookmarkId: string): Promise<void> {
    await StorageManager.deleteBookmark(bookmarkId);
  }

  /**
   * 移动书签到其他文件夹
   */
  static async moveBookmark(bookmarkId: string, targetFolderId: string): Promise<void> {
    await StorageManager.moveBookmark(bookmarkId, targetFolderId);
  }

  /**
   * 创建新文件夹
   */
  static async createFolder(title: string): Promise<Folder> {
    return await StorageManager.addFolder({
      title,
      bookmarks: []
    });
  }

  /**
   * 编辑文件夹
   */
  static async editFolder(folderId: string, title: string): Promise<void> {
    await StorageManager.updateFolder(folderId, { title });
  }

  /**
   * 删除文件夹（将书签移动到未分类）
   */
  static async deleteFolder(folderId: string): Promise<void> {
    const data = await StorageManager.getBookmarkData();
    const folder = data.folders.find(f => f.id === folderId);

    if (folder && folder.bookmarks.length > 0) {
      // 确保未分类文件夹存在
      const uncategorizedFolder = await StorageManager.ensureUncategorizedFolder();

      // 移动所有书签到未分类
      for (const bookmark of folder.bookmarks) {
        await this.moveBookmark(bookmark.id, uncategorizedFolder.id);
      }
    }

    await StorageManager.deleteFolder(folderId);
  }

  /**
   * 搜索书签
   */
  static async searchBookmarks(query: string, tagFilter?: string): Promise<SearchResult> {
    const data = await StorageManager.getBookmarkData();
    const results: SearchResult = {
      bookmarks: [],
      folders: []
    };

    const queryLower = query.toLowerCase();

    for (const folder of data.folders) {
      let folderMatches = false;
      const matchingBookmarksInFolder: Bookmark[] = [];

      for (const bookmark of folder.bookmarks) {
        let matches = false;

        // 文本搜索
        if (query) {
          matches = bookmark.title.toLowerCase().includes(queryLower) ||
                   bookmark.url.toLowerCase().includes(queryLower) ||
                   bookmark.description.toLowerCase().includes(queryLower) ||
                   bookmark.tags.some(tag => tag.toLowerCase().includes(queryLower));
        } else {
          matches = true;
        }

        // 标签过滤
        if (matches && tagFilter) {
          matches = bookmark.tags.includes(tagFilter);
        }

        if (matches) {
          matchingBookmarksInFolder.push(bookmark);
          results.bookmarks.push(bookmark);
        }
      }

      // 如果文件夹有匹配的书签，或者文件夹名称匹配搜索词
      if (matchingBookmarksInFolder.length > 0 ||
          (query && folder.title.toLowerCase().includes(queryLower))) {
        results.folders.push({
          ...folder,
          bookmarks: matchingBookmarksInFolder
        });
      }
    }

    return results;
  }

  /**
   * 获取所有标签
   */
  static async getAllTags(): Promise<string[]> {
    const data = await StorageManager.getBookmarkData();
    return data.tags;
  }

  /**
   * 获取搜索引擎列表
   */
  static async getSearchEngines(): Promise<SearchEngine[]> {
    const data = await StorageManager.getBookmarkData();
    const searchEngines: SearchEngine[] = [];

    for (const folder of data.folders) {
      for (const bookmark of folder.bookmarks) {
        if (bookmark.tags.includes('search') || bookmark.tags.includes('search_site')) {
          searchEngines.push({
            id: bookmark.id,
            title: bookmark.title,
            url: bookmark.url,
            searchUrl: bookmark.searchUrl,
            tags: bookmark.tags
          });
        }
      }
    }

    return searchEngines;
  }

  /**
   * 执行Power Search
   */
  static async executePowerSearch(query: string, selectedEngine?: SearchEngine): Promise<void> {
    if (!selectedEngine) {
      // 使用默认搜索引擎
      const engines = await this.getSearchEngines();
      const defaultEngine = engines.find(e => e.tags.includes('search'));
      if (defaultEngine) {
        selectedEngine = defaultEngine;
      }
    }

    if (selectedEngine) {
      let searchUrl: string;

      if (selectedEngine.tags.includes('search')) {
        // 直接搜索，使用searchUrl
        if (selectedEngine.searchUrl) {
          searchUrl = selectedEngine.searchUrl.replace('${keyword}', encodeURIComponent(query));
        } else {
          // 兼容旧数据，使用url
          searchUrl = selectedEngine.url.replace('${keyword}', encodeURIComponent(query));
        }
      } else if (selectedEngine.tags.includes('search_site')) {
        // 站内搜索
        const domain = this.extractDomain(selectedEngine.url);
        const defaultEngine = (await this.getSearchEngines()).find(e => e.tags.includes('search'));
        if (defaultEngine) {
          const siteQuery = `site:${domain} ${query}`;
          if (defaultEngine.searchUrl) {
            searchUrl = defaultEngine.searchUrl.replace('${keyword}', encodeURIComponent(siteQuery));
          } else {
            // 兼容旧数据
            searchUrl = defaultEngine.url.replace('${keyword}', encodeURIComponent(siteQuery));
          }
        } else {
          // 如果没有默认搜索引擎，直接打开网站
          searchUrl = selectedEngine.url;
        }
      } else {
        searchUrl = selectedEngine.url;
      }

      // 在新标签页打开
      await browser.tabs.create({ url: searchUrl });
    }
  }

  /**
   * 获取所有书签数据
   */
  static async getAllData(): Promise<BookmarkData> {
    const data = await StorageManager.getBookmarkData();

    // 为所有书签加载缓存的favicon
    for (const folder of data.folders) {
      for (const bookmark of folder.bookmarks) {
        if (!bookmark.favicon) {
          bookmark.favicon = await FaviconManager.getFaviconFromCache(bookmark.url);
        }
      }
    }

    return data;
  }

  /**
   * 导入书签数据
   */
  static async importData(data: BookmarkData, merge: boolean = true): Promise<void> {
    if (!merge) {
      // 清空现有数据
      await StorageManager.clearAllData();
    }

    const currentData = await StorageManager.getBookmarkData();

    // 合并文件夹
    for (const importFolder of data.folders) {
      const existingFolder = currentData.folders.find(f => f.title === importFolder.title);

      if (existingFolder && merge) {
        // 合并到现有文件夹
        for (const bookmark of importFolder.bookmarks) {
          // 检查是否已存在相同URL的书签
          const existingBookmark = existingFolder.bookmarks.find(b => b.url === bookmark.url);
          if (!existingBookmark) {
            await this.addBookmark({
              title: bookmark.title,
              url: bookmark.url,
              folderId: existingFolder.id,
              tags: Array.isArray(bookmark.tags) ? bookmark.tags : [],
              description: bookmark.description,
              skipFavicon: true // 导入时跳过favicon获取
            });
          }
        }
      } else {
        // 创建新文件夹
        const newFolder = await this.createFolder(importFolder.title);
        for (const bookmark of importFolder.bookmarks) {
          await this.addBookmark({
            title: bookmark.title,
            url: bookmark.url,
            folderId: newFolder.id,
            tags: Array.isArray(bookmark.tags) ? bookmark.tags : [],
            description: bookmark.description,
            skipFavicon: true // 导入时跳过favicon获取
          });
        }
      }
    }
  }

  /**
   * 从URL提取域名
   */
  private static extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      return url.replace(/^https?:\/\//, '').split('/')[0];
    }
  }

  /**
   * 更新单个书签的图标
   */
  static async updateBookmarkFavicon(bookmarkId: string): Promise<void> {
    const data = await StorageManager.getBookmarkData();

    for (const folder of data.folders) {
      const bookmark = folder.bookmarks.find(b => b.id === bookmarkId);
      if (bookmark) {
        try {
          // 强制更新favicon，忽略缓存
          const favicon = await FaviconManager.getFavicon(bookmark.url, true);
          await StorageManager.updateBookmark(bookmarkId, { favicon });
        } catch (error) {
          console.error('Failed to update bookmark favicon:', error);
          throw new Error('更新图标失败');
        }
        break;
      }
    }
  }

  /**
   * 批量更新所有书签的图标
   */
  static async updateAllFavicons(onProgress?: (current: number, total: number) => void): Promise<void> {
    const data = await StorageManager.getBookmarkData();
    const allBookmarks = [];

    for (const folder of data.folders) {
      allBookmarks.push(...folder.bookmarks);
    }

    const total = allBookmarks.length;
    let current = 0;

    for (const bookmark of allBookmarks) {
      try {
        // 强制更新favicon，忽略缓存
        const favicon = await FaviconManager.getFavicon(bookmark.url, true);
        await StorageManager.updateBookmark(bookmark.id, { favicon });
      } catch (error) {
        console.warn(`Failed to update favicon for ${bookmark.title}:`, error);
        // 继续处理下一个，不中断整个流程
      }

      current++;
      if (onProgress) {
        onProgress(current, total);
      }

      // 添加小延迟避免过于频繁的请求
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }


}
