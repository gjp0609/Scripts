// Favicon 获取工具
import { StorageManager } from './storage';

export class FaviconManager {
  private static readonly FALLBACK_APIS = [
    // Yandex API - 通常最稳定
    {
      name: 'Yandex',
      url: 'https://favicon.yandex.net/favicon/',
      format: (domain: string) => `https://favicon.yandex.net/favicon/${domain}`
    },
    // Google API - 广泛支持
    {
      name: 'Google',
      url: 'https://www.google.com/s2/favicons',
      format: (domain: string) => `https://www.google.com/s2/favicons?sz=32&domain_url=${domain}`
    },
    // DuckDuckGo API - 替代选项
    {
      name: 'DuckDuckGo',
      url: 'https://icons.duckduckgo.com',
      format: (domain: string) => `https://icons.duckduckgo.com/ip3/${domain}.ico`
    },
    // 直接访问网站favicon.ico
    {
      name: 'Direct',
      url: 'direct',
      format: (domain: string) => `https://${domain}/favicon.ico`
    }
  ];

  private static readonly DEFAULT_FAVICON = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTggMUMxMS44NjYgMSAxNSA0LjEzNCAxNSA4QzE1IDExLjg2NiAxMS44NjYgMTUgOCAxNUM0LjEzNCAxNSAxIDExLjg2NiAxIDhDMSA0LjEzNCA0LjEzNCAxIDggMVoiIHN0cm9rZT0iIzk5OTk5OSIgc3Ryb2tlLXdpZHRoPSIxLjUiLz4KPHBhdGggZD0iTTUuNSA2LjVIMTAuNSIgc3Ryb2tlPSIjOTk5OTk5IiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CjxwYXRoIGQ9Ik01LjUgOS41SDEwLjUiIHN0cm9rZT0iIzk5OTk5OSIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K';

  private static readonly FETCH_TIMEOUT = 5000; // 5秒超时
  private static readonly MAX_RETRIES = 2;

  /**
   * 获取默认图标
   */
  static getDefaultFavicon(): string {
    return this.DEFAULT_FAVICON;
  }

  /**
   * 只从缓存获取Favicon，不进行网络请求
   * @param url 网站URL
   * @returns Promise<string> 缓存的图标数据或默认图标
   */
  static async getFaviconFromCache(url: string): Promise<string> {
    try {
      const domain = this.extractDomain(url);
      const cache = await StorageManager.getFaviconCache();
      return cache[domain] || this.DEFAULT_FAVICON;
    } catch (error) {
      console.error('Failed to get favicon from cache:', error);
      return this.DEFAULT_FAVICON;
    }
  }

  /**
   * 获取网站的Favicon
   * @param url 网站URL
   * @param forceUpdate 是否强制更新（忽略缓存）
   * @returns Promise<string> Base64编码的图标数据
   */
  static async getFavicon(url: string, forceUpdate: boolean = false): Promise<string> {
    try {
      const domain = this.extractDomain(url);

      // 检查缓存（除非强制更新）
      if (!forceUpdate) {
        const cache = await StorageManager.getFaviconCacheWithTimestamp();
        const cachedItem = cache[domain];
        
        if (cachedItem) {
          // 兼容旧版本缓存
          if (typeof cachedItem === 'string') {
            return cachedItem;
          }
          
          // 新版本缓存，检查是否过期
          const maxAge = 24 * 60 * 60 * 1000; // 24小时
          if (cachedItem.data && (Date.now() - cachedItem.timestamp) < maxAge) {
            return cachedItem.data;
          }
        }
      }

      // 尝试Chrome API
      const chromeIcon = await this.getChromeApiFavicon(url);
      if (chromeIcon) {
        await StorageManager.saveFaviconToCache(domain, chromeIcon);
        return chromeIcon;
      }

      // 尝试备用API
      const fallbackIcon = await this.getFallbackFavicon(domain);
      if (fallbackIcon) {
        await StorageManager.saveFaviconToCache(domain, fallbackIcon);
        return fallbackIcon;
      }

      // 返回默认图标
      return this.DEFAULT_FAVICON;
    } catch (error) {
      console.error('Failed to get favicon for', url, error);
      return this.DEFAULT_FAVICON;
    }
  }

  /**
   * 使用Chrome API获取Favicon
   */
  private static async getChromeApiFavicon(url: string): Promise<string | null> {
    try {
      // 优先使用tab的favIconUrl，这是最可靠的方法
      if (typeof browser !== 'undefined' && browser.tabs) {
        try {
          // 尝试查找已打开的标签页
          const tabs = await browser.tabs.query({ url: url });
          if (tabs.length > 0 && tabs[0].favIconUrl && !tabs[0].favIconUrl.includes('data:image/svg+xml')) {
            return await this.fetchImageAsBase64(tabs[0].favIconUrl);
          }
        } catch (tabError) {
          // 忽略tab查询错误
        }
      }

      // 检查是否支持Chrome Favicon API，但要注意URL格式问题
      if (typeof browser !== 'undefined' && browser.runtime) {
        try {
          // 使用Chrome专有的favicon API，但需要特殊处理
          const faviconUrl = `chrome-extension://${browser.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
          
          // 直接获取图标数据，而不是通过fetch
          const response = await fetch(faviconUrl);
          if (response.ok) {
            const blob = await response.blob();
            if (blob.type.startsWith('image/') && blob.size > 100) { // 确保不是默认图标
              const base64Data = await this.blobToBase64(blob);
              if (base64Data && !base64Data.includes('PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYi')) { // 排除默认SVG
                return base64Data;
              }
            }
          }
        } catch (chromeApiError) {
          // 忽略Chrome API错误
        }
      }
      
      return null;
    } catch (error) {
      console.warn('Chrome API favicon failed:', error);
      return null;
    }
  }

  /**
   * 使用备用API获取Favicon
   */
  private static async getFallbackFavicon(domain: string): Promise<string | null> {
    // 重新排序API，优先使用最可靠的
    const orderedApis = [
      this.FALLBACK_APIS[1], // Google
      this.FALLBACK_APIS[0], // Yandex
      this.FALLBACK_APIS[2], // DuckDuckGo
      this.FALLBACK_APIS[3]  // Direct
    ];

    for (const api of orderedApis) {
      try {
        const faviconUrl = api.format(domain);
        const base64Data = await this.fetchImageAsBase64(faviconUrl);
        if (base64Data && !base64Data.includes('PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYi')) {
          return base64Data;
        }
      } catch (error) {
        continue;
      }
    }
    return null;
  }

  /**
   * 将Blob转换为Base64
   */
  private static async blobToBase64(blob: Blob): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // 验证base64结果
        if (result && result.startsWith('data:image/')) {
          resolve(result);
        } else {
          reject(new Error('Invalid base64 result'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read blob as base64'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * 获取图片并转换为Base64（带超时和重试）
   */
  private static async fetchImageAsBase64(url: string, retryCount = 0): Promise<string | null> {
    try {
      // 创建带超时的fetch请求
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT);

      const response = await fetch(url, {
        signal: controller.signal,
        mode: 'cors',
        cache: 'default',
        credentials: 'omit', // 不发送凭据
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'max-age=3600'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();

      // 检查是否是有效的图片
      if (!blob.type.startsWith('image/') && blob.type !== 'application/octet-stream') {
        throw new Error(`Invalid content type: ${blob.type}`);
      }

      // 检查文件大小（限制为500KB）
      if (blob.size > 512 * 1024) {
        throw new Error(`Image too large: ${blob.size} bytes`);
      }

      // 检查文件是否太小（可能是错误页面）
      if (blob.size < 50) {
        throw new Error(`Image too small: ${blob.size} bytes`);
      }

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // 验证base64结果
          if (result && result.startsWith('data:image/')) {
            resolve(result);
          } else {
            reject(new Error('Invalid base64 result'));
          }
        };
        reader.onerror = () => reject(new Error('Failed to read blob as base64'));
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.warn(`Failed to fetch image as base64 (attempt ${retryCount + 1}):`, error);

      // 重试逻辑
      if (retryCount < this.MAX_RETRIES && !(error as any)?.name?.includes('Abort')) {
        // 指数退返等待后重试
        const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.fetchImageAsBase64(url, retryCount + 1);
      }

      return null;
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
      // 如果URL无效，返回原始字符串的简化版本
      return url.replace(/^https?:\/\//, '').split('/')[0];
    }
  }



  /**
   * 清理过期的Favicon缓存
   */
  static async cleanupCache(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      await StorageManager.cleanupFaviconCache(maxAge);
    } catch (error) {
      console.error('Failed to cleanup favicon cache:', error);
    }
  }

  /**
   * 获取缓存统计信息
   */
  static async getCacheStats(): Promise<{
    totalItems: number;
    totalSize: number;
    oldestItem: number;
    newestItem: number;
  }> {
    try {
      const cache = await StorageManager.getFaviconCacheWithTimestamp();
      const items = Object.values(cache);
      
      if (items.length === 0) {
        return { totalItems: 0, totalSize: 0, oldestItem: 0, newestItem: 0 };
      }
      
      let totalSize = 0;
      let oldestTimestamp = Date.now();
      let newestTimestamp = 0;
      
      for (const item of items) {
        if (typeof item === 'string') {
          totalSize += (item as string).length;
          // 旧版本数据，使用当前时间
          newestTimestamp = Math.max(newestTimestamp, Date.now());
        } else if (item && typeof item === 'object' && 'data' in item && 'timestamp' in item) {
          const cacheItem = item as any;
          totalSize += cacheItem.size || cacheItem.data.length;
          oldestTimestamp = Math.min(oldestTimestamp, cacheItem.timestamp);
          newestTimestamp = Math.max(newestTimestamp, cacheItem.timestamp);
        }
      }
      
      return {
        totalItems: items.length,
        totalSize,
        oldestItem: oldestTimestamp,
        newestItem: newestTimestamp
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return { totalItems: 0, totalSize: 0, oldestItem: 0, newestItem: 0 };
    }
  }

  /**
   * 清空所有Favicon缓存
   */
  static async clearAllCache(): Promise<void> {
    try {
      await browser.storage.local.remove(['favicon_cache']);
      console.log('All favicon cache cleared');
    } catch (error) {
      console.error('Failed to clear favicon cache:', error);
    }
  }


}
