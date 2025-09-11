// 设置管理工具
export interface AppSettings {
  enableNewTabOverride: boolean;
  theme: 'light' | 'dark' | 'auto';
  defaultView: 'grid' | 'list';
  showFavicons: boolean;
  autoBackup: boolean;
  backupInterval: number; // 天数
}

const DEFAULT_SETTINGS: AppSettings = {
  enableNewTabOverride: false,
  theme: 'auto',
  defaultView: 'grid',
  showFavicons: true,
  autoBackup: false,
  backupInterval: 7
};

const SETTINGS_KEY = 'app_settings';

export class SettingsManager {
  /**
   * 获取所有设置
   */
  static async getSettings(): Promise<AppSettings> {
    try {
      const result = await browser.storage.local.get(SETTINGS_KEY);
      return { ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] };
    } catch (error) {
      console.error('Failed to get settings:', error);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * 保存设置
   */
  static async saveSettings(settings: Partial<AppSettings>): Promise<void> {
    try {
      const currentSettings = await this.getSettings();
      const newSettings = { ...currentSettings, ...settings };
      await browser.storage.local.set({ [SETTINGS_KEY]: newSettings });

      // 如果新标签页设置发生变化，需要重新加载扩展
      if (settings.enableNewTabOverride !== undefined) {
        await this.handleNewTabOverrideChange(settings.enableNewTabOverride);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }

  /**
   * 获取单个设置
   */
  static async getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
    const settings = await this.getSettings();
    return settings[key];
  }

  /**
   * 设置单个配置
   */
  static async setSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ): Promise<void> {
    await this.saveSettings({ [key]: value } as Partial<AppSettings>);
  }

  /**
   * 重置所有设置
   */
  static async resetSettings(): Promise<void> {
    try {
      await browser.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
      await this.handleNewTabOverrideChange(false);
    } catch (error) {
      console.error('Failed to reset settings:', error);
      throw error;
    }
  }

  /**
   * 处理新标签页覆盖设置变化
   */
  private static async handleNewTabOverrideChange(enable: boolean): Promise<void> {
    try {
      // 发送消息给background script处理manifest更新
      await browser.runtime.sendMessage({
        type: 'UPDATE_NEWTAB_OVERRIDE',
        enable
      });
    } catch (error) {
      console.warn('Failed to update newtab override:', error);
      // 在某些情况下可能需要用户手动重新加载扩展
    }
  }

  /**
   * 导出设置
   */
  static async exportSettings(): Promise<string> {
    const settings = await this.getSettings();
    const exportData = {
      version: '1.0',
      exportDate: Date.now(),
      settings
    };
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 导入设置
   */
  static async importSettings(jsonContent: string): Promise<void> {
    try {
      const importData = JSON.parse(jsonContent);

      if (!importData.settings) {
        throw new Error('无效的设置文件格式');
      }

      // 验证设置数据
      const validSettings: Partial<AppSettings> = {};
      for (const [key, value] of Object.entries(importData.settings)) {
        if (key in DEFAULT_SETTINGS) {
          validSettings[key as keyof AppSettings] = value as any;
        }
      }

      await this.saveSettings(validSettings);
    } catch (error) {
      console.error('Failed to import settings:', error);
      throw new Error('导入设置失败：' + error.message);
    }
  }

  /**
   * 监听设置变化
   */
  static onSettingsChanged(callback: (changes: Partial<AppSettings>) => void): void {
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes[SETTINGS_KEY]) {
        const oldSettings = changes[SETTINGS_KEY].oldValue || DEFAULT_SETTINGS;
        const newSettings = changes[SETTINGS_KEY].newValue || DEFAULT_SETTINGS;

        // 计算变化的设置
        const changedSettings: Partial<AppSettings> = {};
        for (const key of Object.keys(newSettings) as Array<keyof AppSettings>) {
          if (oldSettings[key] !== newSettings[key]) {
            changedSettings[key] = newSettings[key];
          }
        }

        if (Object.keys(changedSettings).length > 0) {
          callback(changedSettings);
        }
      }
    });
  }

  /**
   * 检查是否需要显示新功能提示
   */
  static async shouldShowNewFeatureNotice(): Promise<boolean> {
    try {
      const result = await browser.storage.local.get('last_version_seen');
      const lastVersionSeen = result.last_version_seen;
      const currentVersion = browser.runtime.getManifest().version;

      if (!lastVersionSeen || lastVersionSeen !== currentVersion) {
        await browser.storage.local.set({ last_version_seen: currentVersion });
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to check version:', error);
      return false;
    }
  }

  /**
   * 获取使用统计
   */
  static async getUsageStats(): Promise<{
    totalBookmarks: number;
    totalFolders: number;
    totalTags: number;
    lastUsed: number;
  }> {
    try {
      const result = await browser.storage.local.get(['bookmarks_data', 'last_used']);
      const bookmarkData = result.bookmarks_data || { folders: [], tags: [] };

      const totalBookmarks = bookmarkData.folders.reduce(
        (sum: number, folder: any) => sum + folder.bookmarks.length,
        0
      );

      return {
        totalBookmarks,
        totalFolders: bookmarkData.folders.length,
        totalTags: bookmarkData.tags.length,
        lastUsed: result.last_used || Date.now()
      };
    } catch (error) {
      console.error('Failed to get usage stats:', error);
      return {
        totalBookmarks: 0,
        totalFolders: 0,
        totalTags: 0,
        lastUsed: Date.now()
      };
    }
  }

  /**
   * 更新最后使用时间
   */
  static async updateLastUsed(): Promise<void> {
    try {
      await browser.storage.local.set({ last_used: Date.now() });
    } catch (error) {
      console.error('Failed to update last used time:', error);
    }
  }
}
