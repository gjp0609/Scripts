<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { SettingsManager } from '@/utils/settings';
// 直接导入options页面的组件
import OptionsApp from '../options/App.vue';

// 状态管理
const showBookmarkManager = ref(false);

// 生命周期
onMounted(async () => {
  // 检查是否启用了新标签页覆盖
  try {
    const settings = await SettingsManager.getSettings();
    showBookmarkManager.value = settings.enableNewTabOverride;

    if (!showBookmarkManager.value) {
      // 如果未启用，重定向到默认新标签页
      window.location.href = 'chrome://newtab/';
    }
  } catch (error) {
    console.error('Failed to check newtab settings:', error);
    // 出错时默认显示书签管理器
    showBookmarkManager.value = true;
  }
});

const openSettings = () => {
  browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
};
</script>

<template>
  <!-- 如果启用了新标签页覆盖，直接使用options页面组件 -->
  <div v-if="showBookmarkManager" class="newtab-wrapper">
    <OptionsApp />
  </div>

  <!-- 如果未启用新标签页覆盖，显示提示信息 -->
  <div v-else class="newtab-disabled">
    <div class="disabled-content">
      <h2>书签管理器</h2>
      <p>新标签页功能未启用</p>
      <el-button type="primary" @click="openSettings">
        前往设置启用
      </el-button>
    </div>
  </div>
</template>

<style scoped>
/* 新标签页包装器 */
.newtab-wrapper {
  width: 100vw;
  height: 100vh;
}

/* 禁用状态样式 */
.newtab-disabled {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.disabled-content {
  text-align: center;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.disabled-content h2 {
  margin: 0 0 16px 0;
  font-size: 24px;
  font-weight: 600;
  color: #333;
}

.disabled-content p {
  margin: 0 0 24px 0;
  font-size: 16px;
  color: #666;
}
</style>
