import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';
import './style.css';
import { SettingsManager } from '@/utils/settings';

// 主题切换功能
const applyTheme = async (theme: string) => {
  const html = document.documentElement;
  
  switch (theme) {
    case 'light':
      html.classList.remove('dark');
      html.style.setProperty('--el-bg-color', '#ffffff');
      html.style.setProperty('--el-bg-color-overlay', '#f5f7fa');
      break;
    case 'dark':
      html.classList.add('dark');
      html.style.setProperty('--el-bg-color', '#141414');
      html.style.setProperty('--el-bg-color-overlay', '#1d1e1f');
      break;
    case 'auto':
    default:
      // 跟随系统主题
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        html.classList.add('dark');
        html.style.setProperty('--el-bg-color', '#141414');
        html.style.setProperty('--el-bg-color-overlay', '#1d1e1f');
      } else {
        html.classList.remove('dark');
        html.style.setProperty('--el-bg-color', '#ffffff');
        html.style.setProperty('--el-bg-color-overlay', '#f5f7fa');
      }
      break;
  }
};

// 初始化主题
const initTheme = async () => {
  try {
    const settings = await SettingsManager.getSettings();
    applyTheme(settings.theme);
  } catch (error) {
    console.error('Failed to load theme settings:', error);
    // 默认使用auto主题
    applyTheme('auto');
  }
};

// 监听系统主题变化（仅在auto模式下）
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
  try {
    const settings = await SettingsManager.getSettings();
    if (settings.theme === 'auto') {
      applyTheme('auto');
    }
  } catch (error) {
    console.error('Failed to handle system theme change:', error);
  }
});

const app = createApp(App);

// 提供主题切换方法到全局
app.config.globalProperties.$applyTheme = applyTheme;

app.use(ElementPlus);

// 初始化主题后再挂载应用
initTheme().then(() => {
  app.mount('#app');
});
