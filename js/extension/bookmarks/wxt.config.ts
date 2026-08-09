import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  publicDir: 'public',
  vite: () => ({
    plugins: [vue()]
  }),
  manifest: {
    name: 'MarkHub Bookmarks',
    description: '以浏览器原生书签为主数据源的高频书签工作台。',
    permissions: ['bookmarks', 'storage', 'unlimitedStorage', 'activeTab', 'tabs', 'scripting', 'favicon'],
    action: {
      default_title: 'MarkHub'
    },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png'
    }
  }
});
