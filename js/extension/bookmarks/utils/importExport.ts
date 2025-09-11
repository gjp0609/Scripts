// 导入导出功能
import type { BookmarkData, ImportExportData } from '@/types/bookmark';
import { BookmarkManager } from './bookmarkManager';

export class ImportExportManager {
  /**
   * 导出为HTML格式（通用书签格式）
   */
  static async exportToHTML(): Promise<string> {
    const data = await BookmarkManager.getAllData();

    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;

    for (const folder of data.folders) {
      if (folder.bookmarks.length > 0) {
        html += `    <DT><H3>${this.escapeHtml(folder.title)}</H3>\n`;
        html += `    <DL><p>\n`;

        for (const bookmark of folder.bookmarks) {
          const addDate = Math.floor(bookmark.createdAt / 1000);
          html += `        <DT><A HREF="${this.escapeHtml(bookmark.url)}" ADD_DATE="${addDate}">${this.escapeHtml(bookmark.title)}</A>\n`;
        }

        html += `    </DL><p>\n`;
      }
    }

    html += `</DL><p>`;
    return html;
  }

  /**
   * 导出为JSON格式（完整备份）
   */
  static async exportToJSON(): Promise<string> {
    const data = await BookmarkManager.getAllData();

    const exportData: ImportExportData = {
      version: '1.0',
      exportDate: Date.now(),
      data
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 从HTML导入书签
   */
  static async importFromHTML(htmlContent: string): Promise<void> {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');

      const bookmarkData: BookmarkData = {
        folders: [],
        tags: []
      };

      // 简单递归解析函数
      const parseBookmarks = (dlElement: Element): { folders: any[], bookmarks: any[] } => {
        const folders: any[] = [];
        const bookmarks: any[] = [];

        const dtElements = dlElement.querySelectorAll(':scope > DT');

        for (const dt of dtElements) {
          const h3 = dt.querySelector(':scope > H3');

          if (h3) {
            // 文件夹
            const title = h3.textContent?.trim() || '未命名文件夹';
            const subDL = dt.querySelector(':scope > DL');

            if (subDL) {
              const result = parseBookmarks(subDL);

              // 创建文件夹
              const folder = {
                id: '',
                title,
                bookmarks: result.bookmarks,
                createdAt: Date.now(),
                updatedAt: Date.now()
              };

              // 添加子文件夹
              folders.push(...result.folders);

              // 添加当前文件夹
              if (folder.bookmarks.length > 0 || result.folders.length > 0) {
                folders.push(folder);
              }
            }
          } else {
            // 书签
            const link = dt.querySelector(':scope > A[HREF]');
            if (link) {
              const url = link.getAttribute('HREF');
              const title = link.textContent?.trim();

              if (url && title) {
                bookmarks.push({
                  id: '',
                  title,
                  url,
                  folderId: '',
                  tags: [],
                  description: '',
                  createdAt: Date.now(),
                  updatedAt: Date.now()
                });
              }
            }
          }
        }

        return { folders, bookmarks };
      };

      // 找到书签栏并直接解析其内容
      const toolbarH3 = doc.querySelector('H3[PERSONAL_TOOLBAR_FOLDER="true"]');
      if (toolbarH3) {
        const toolbarDT = toolbarH3.closest('DT');
        const contentDL = toolbarDT?.querySelector(':scope > DL');

        if (contentDL) {
          const result = parseBookmarks(contentDL);
          bookmarkData.folders.push(...result.folders);

          if (result.bookmarks.length > 0) {
            const uncategorizedFolder = {
              id: '',
              title: '未分类',
              bookmarks: result.bookmarks,
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            bookmarkData.folders.unshift(uncategorizedFolder);
          }
        }
      } else {
        // 没有书签栏，直接解析根DL
        const rootDL = doc.querySelector('DL');
        if (rootDL) {
          const result = parseBookmarks(rootDL);
          bookmarkData.folders.push(...result.folders);

          if (result.bookmarks.length > 0) {
            const uncategorizedFolder = {
              id: '',
              title: '未分类',
              bookmarks: result.bookmarks,
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            bookmarkData.folders.unshift(uncategorizedFolder);
          }
        }
      }

      // 如果没有找到文件夹结构，尝试直接解析所有链接
      if (bookmarkData.folders.length === 0) {
        const allLinks = doc.querySelectorAll('A[HREF]');
        if (allLinks.length > 0) {
          const defaultFolder = {
            id: '',
            title: '导入的书签',
            bookmarks: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
          };

          for (const link of allLinks) {
            const url = link.getAttribute('HREF');
            const title = link.textContent?.trim();

            if (url && title) {
              defaultFolder.bookmarks.push({
                id: '',
                title,
                url,
                folderId: '',
                tags: [],
                description: '',
                createdAt: Date.now(),
                updatedAt: Date.now()
              });
            }
          }

          bookmarkData.folders.push(defaultFolder);
        }
      }

      // 导入数据
      await BookmarkManager.importData(bookmarkData, true);
    } catch (error) {
      console.error('Failed to import HTML bookmarks:', error);
      throw new Error('导入HTML书签失败：' + error.message);
    }
  }

  /**
   * 从JSON恢复书签
   */
  static async importFromJSON(jsonContent: string, clearExisting: boolean = false): Promise<void> {
    try {
      const importData: ImportExportData = JSON.parse(jsonContent);

      // 验证数据格式
      if (!importData.data || !importData.data.folders) {
        throw new Error('无效的JSON格式');
      }

      await BookmarkManager.importData(importData.data, !clearExisting);
    } catch (error) {
      console.error('Failed to import JSON bookmarks:', error);
      throw new Error('导入JSON书签失败：' + error.message);
    }
  }

  /**
   * 下载文件
   */
  static downloadFile(content: string, filename: string, mimeType: string = 'text/plain'): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  }

  /**
   * 导出HTML文件
   */
  static async exportHTMLFile(): Promise<void> {
    const html = await this.exportToHTML();
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    this.downloadFile(html, `bookmarks_${timestamp}.html`, 'text/html');
  }

  /**
   * 导出JSON文件
   */
  static async exportJSONFile(): Promise<void> {
    const json = await this.exportToJSON();
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    this.downloadFile(json, `bookmarks_backup_${timestamp}.json`, 'application/json');
  }

  /**
   * 读取文件内容
   */
  static readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        resolve(content);
      };
      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };
      reader.readAsText(file);
    });
  }

  /**
   * 处理文件导入
   */
  static async handleFileImport(file: File): Promise<void> {
    const content = await this.readFile(file);
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
      await this.importFromHTML(content);
    } else if (fileName.endsWith('.json')) {
      await this.importFromJSON(content);
    } else {
      throw new Error('不支持的文件格式。请选择HTML或JSON文件。');
    }
  }

  /**
   * HTML转义
   */
  private static escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 验证导入数据
   */
  static validateImportData(data: any): boolean {
    try {
      // 基本结构验证
      if (!data || typeof data !== 'object') {
        return false;
      }

      // 如果是完整的导出数据
      if (data.version && data.data) {
        return this.validateBookmarkData(data.data);
      }

      // 如果是直接的书签数据
      return this.validateBookmarkData(data);
    } catch (error) {
      return false;
    }
  }

  /**
   * 验证书签数据结构
   */
  private static validateBookmarkData(data: any): boolean {
    if (!data.folders || !Array.isArray(data.folders)) {
      return false;
    }

    for (const folder of data.folders) {
      if (!folder.title || !Array.isArray(folder.bookmarks)) {
        return false;
      }

      for (const bookmark of folder.bookmarks) {
        if (!bookmark.title || !bookmark.url) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 获取导入预览
   */
  static async getImportPreview(file: File): Promise<{
    folders: number;
    bookmarks: number;
    preview: Array<{ folderName: string; bookmarkCount: number; }>;
  }> {
    const content = await this.readFile(file);
    const fileName = file.name.toLowerCase();

    let data: BookmarkData;

    if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
      // 临时解析HTML以获取预览
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');

      const preview = [];
      let totalBookmarks = 0;

      // 找到书签栏并跳过它
      const toolbarH3 = doc.querySelector('H3[PERSONAL_TOOLBAR_FOLDER="true"]');
      let targetDL = doc.querySelector('DL');

      if (toolbarH3) {
        const toolbarDT = toolbarH3.closest('DT');
        const contentDL = toolbarDT?.querySelector(':scope > DL');
        if (contentDL) {
          targetDL = contentDL;
        }
      }

      if (targetDL) {
        // 只获取实际的文件夹（跳过根容器）
        const folderElements = targetDL.querySelectorAll('H3');

        for (const folderElement of folderElements) {
          // 跳过根容器
          if (folderElement.hasAttribute('PERSONAL_TOOLBAR_FOLDER')) {
            continue;
          }

          const folderTitle = folderElement.textContent?.trim() || '未命名文件夹';
          const folderDT = folderElement.closest('DT');
          const folderDL = folderDT?.querySelector(':scope > DL');

          let bookmarkCount = 0;
          if (folderDL) {
            bookmarkCount = folderDL.querySelectorAll('A[HREF]').length;
          }

          preview.push({
            folderName: folderTitle,
            bookmarkCount
          });
          totalBookmarks += bookmarkCount;
        }

        // 计算根级别的书签
        const rootBookmarks = targetDL.querySelectorAll(':scope > DT > A[HREF]').length;
        if (rootBookmarks > 0) {
          preview.unshift({
            folderName: '未分类',
            bookmarkCount: rootBookmarks
          });
          totalBookmarks += rootBookmarks;
        }
      }

      return {
        folders: preview.length,
        bookmarks: totalBookmarks,
        preview
      };
    } else if (fileName.endsWith('.json')) {
      const importData: ImportExportData = JSON.parse(content);
      data = importData.data || importData;

      const preview = data.folders.map(folder => ({
        folderName: folder.title,
        bookmarkCount: folder.bookmarks.length
      }));

      const totalBookmarks = data.folders.reduce((sum, folder) => sum + folder.bookmarks.length, 0);

      return {
        folders: data.folders.length,
        bookmarks: totalBookmarks,
        preview
      };
    }

    throw new Error('不支持的文件格式');
  }
}
