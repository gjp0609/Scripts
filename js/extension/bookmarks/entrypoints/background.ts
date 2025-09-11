import { BookmarkManager } from '@/utils/bookmarkManager';
import { SettingsManager } from '@/utils/settings';

export default defineBackground(() => {
  console.log('Bookmark Manager Background Script Started', { id: browser.runtime.id });

  // 处理扩展图标点击 - 打开书签管理器主界面
  browser.action.onClicked.addListener(async (tab) => {
    try {
      // 直接打开我们的options.html页面，而不是Chrome的扩展设置页面
      const optionsUrl = browser.runtime.getURL('options.html');
      console.log('Opening bookmark manager at:', optionsUrl);

      // 检查是否已经有书签管理器页面打开
      const existingTabs = await browser.tabs.query({ url: optionsUrl });

      if (existingTabs.length > 0) {
        // 如果已经打开，则激活现有标签页
        await browser.tabs.update(existingTabs[0].id!, { active: true });
        await browser.windows.update(existingTabs[0].windowId!, { focused: true });
      } else {
        // 否则创建新标签页
        await browser.tabs.create({ url: optionsUrl });
      }
    } catch (error) {
      console.error('Failed to open bookmark manager:', error);
      // 降级处理：如果出错，尝试使用默认的options页面
      try {
        browser.runtime.openOptionsPage();
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      }
    }
  });

  // 创建右键菜单
  browser.runtime.onInstalled.addListener(() => {
    // 快速添加到未分类
    browser.contextMenus.create({
      id: 'quick-bookmark',
      title: '快速收藏到未分类',
      contexts: ['page', 'link']
    });

    // 完整添加
    browser.contextMenus.create({
      id: 'full-bookmark',
      title: '用书签管理器收藏',
      contexts: ['page', 'link']
    });
  });

  // 处理右键菜单点击
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab) return;

    try {
      if (info.menuItemId === 'quick-bookmark') {
        // 快速添加到未分类
        const url = info.linkUrl || tab.url || '';
        const title = info.selectionText || tab.title || '未命名书签';

        await BookmarkManager.quickAddBookmark(url, title);

        // 显示成功通知
        showNotification('书签添加成功', `已将"${title}"添加到未分类文件夹`);

      } else if (info.menuItemId === 'full-bookmark') {
        // 打开完整添加模态框
        const url = info.linkUrl || tab.url || '';
        const title = info.selectionText || tab.title || '未命名书签';

        // 向当前标签页发送消息，显示添加书签模态框
        browser.tabs.sendMessage(tab.id!, {
          type: 'SHOW_BOOKMARK_MODAL',
          data: {
            url,
            title,
            favIconUrl: tab.favIconUrl
          }
        }).catch(() => {
          // 如果内容脚本未注入，则打开popup
          browser.action.openPopup();
        });
      }
    } catch (error) {
      console.error('Context menu action failed:', error);
      showNotification('操作失败', '添加书签时发生错误');
    }
  });

  // 显示通知
  function showNotification(title: string, message: string) {
    browser.notifications.create({
      type: 'basic',
      iconUrl: '/icon/48.png',
      title,
      message
    });
  }

  // 监听来自popup和content script的消息
  browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === 'GET_CURRENT_TAB_INFO') {
      try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const currentTab = tabs[0];

        if (currentTab) {
          sendResponse({
            url: currentTab.url,
            title: currentTab.title,
            favIconUrl: currentTab.favIconUrl
          });
        }
      } catch (error) {
        console.error('Failed to get current tab info:', error);
        sendResponse(null);
      }
      return true; // 保持消息通道开放
    } else if (message.type === 'ADD_BOOKMARK') {
      try {
        await BookmarkManager.addBookmark(message.data);
        showNotification('书签添加成功', `已添加"${message.data.title}"`);
        sendResponse({ success: true });
      } catch (error) {
        console.error('Failed to add bookmark:', error);
        showNotification('添加失败', '添加书签时发生错误');
        sendResponse({ success: false, error: error.message });
      }
      return true; // 保持消息通道开放
    } else if (message.type === 'UPDATE_NEWTAB_OVERRIDE') {
      try {
        // 处理新标签页覆盖设置
        await handleNewTabOverrideUpdate(message.enable);
        sendResponse({ success: true });
      } catch (error) {
        console.error('Failed to update newtab override:', error);
        sendResponse({ success: false, error: error.message });
      }
      return true;
    }
  });

  // 处理新标签页覆盖设置更新
  async function handleNewTabOverrideUpdate(enable: boolean) {
    // 注意：在Manifest V3中，无法动态修改manifest.json
    // 这里我们只是保存设置，实际的新标签页覆盖需要在manifest中预先配置
    // 用户需要重新加载扩展来应用更改

    console.log('New tab override setting updated:', enable);

    // 可以在这里添加其他逻辑，比如通知用户需要重新加载扩展
    if (enable) {
      browser.notifications.create({
        type: 'basic',
        iconUrl: '/icon/48.png',
        title: '设置已更新',
        message: '新标签页覆盖已启用。如果没有生效，请重新加载扩展。'
      });
    }
  }
});
