import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    permissions: [
      'storage',
      'contextMenus',
      'notifications',
      'tabs',
      'activeTab',
      'favicon'
    ],
    host_permissions: [
      '<all_urls>'
    ],
    // 扩展图标配置（点击时通过background.ts处理）
    action: {
      default_title: '打开书签管理器',
      default_icon: {
        16: '/icon/16.png',
        32: '/icon/32.png',
        48: '/icon/48.png',
        96: '/icon/96.png',
        128: '/icon/128.png'
      }
    },
    // 添加options页面（用于右键菜单"选项"和扩展管理页面）
    options_ui: {
      page: 'options.html',
      open_in_tab: true
    },
    // 新标签页覆盖（默认启用，用户可以通过设置控制）
    chrome_url_overrides: {
      newtab: 'newtab.html'
    }
  }
});
