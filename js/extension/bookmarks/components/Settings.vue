<template>
  <div class="settings">
    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <el-icon><Setting /></el-icon>
          <span>应用设置</span>
        </div>
      </template>

      <div class="settings-content">
        <!-- 新标签页设置 -->
        <div class="setting-section">
          <h3>新标签页</h3>
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">将书签管理器设为新标签页</div>
              <div class="setting-description">
                启用后，打开新标签页时将显示书签管理器界面
              </div>
            </div>
            <el-switch
              v-model="settings.enableNewTabOverride"
              @change="handleNewTabOverrideChange"
              :loading="newTabLoading"
            />
          </div>

          <el-alert
            v-if="settings.enableNewTabOverride"
            title="注意"
            type="info"
            :closable="false"
            show-icon
          >
            启用此功能后，可能需要重新加载扩展才能生效。如需恢复默认新标签页，请关闭此选项。
          </el-alert>
        </div>

        <!-- 外观设置 -->
        <div class="setting-section">
          <h3>外观</h3>
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">主题</div>
              <div class="setting-description">选择应用主题</div>
            </div>
            <el-select v-model="settings.theme" @change="saveSettings">
              <el-option label="跟随系统" value="auto" />
              <el-option label="浅色主题" value="light" />
              <el-option label="深色主题" value="dark" />
            </el-select>
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">默认视图</div>
              <div class="setting-description">选择书签的默认显示方式</div>
            </div>
            <el-select v-model="settings.defaultView" @change="saveSettings">
              <el-option label="网格视图" value="grid" />
              <el-option label="列表视图" value="list" />
            </el-select>
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">显示网站图标</div>
              <div class="setting-description">是否显示书签的网站图标</div>
            </div>
            <el-switch
              v-model="settings.showFavicons"
              @change="saveSettings"
            />
          </div>
        </div>

        <!-- 备份设置 -->
        <div class="setting-section">
          <h3>数据备份</h3>
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">自动备份</div>
              <div class="setting-description">定期自动备份书签数据</div>
            </div>
            <el-switch
              v-model="settings.autoBackup"
              @change="saveSettings"
            />
          </div>

          <div v-if="settings.autoBackup" class="setting-item">
            <div class="setting-info">
              <div class="setting-title">备份间隔</div>
              <div class="setting-description">自动备份的时间间隔</div>
            </div>
            <el-select v-model="settings.backupInterval" @change="saveSettings">
              <el-option label="每天" :value="1" />
              <el-option label="每3天" :value="3" />
              <el-option label="每周" :value="7" />
              <el-option label="每月" :value="30" />
            </el-select>
          </div>
        </div>

        <!-- 使用统计 -->
        <div class="setting-section">
          <h3>使用统计</h3>
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-number">{{ usageStats.totalBookmarks }}</div>
              <div class="stat-label">书签总数</div>
            </div>
            <div class="stat-item">
              <div class="stat-number">{{ usageStats.totalFolders }}</div>
              <div class="stat-label">文件夹数</div>
            </div>
            <div class="stat-item">
              <div class="stat-number">{{ usageStats.totalTags }}</div>
              <div class="stat-label">标签数</div>
            </div>
            <div class="stat-item">
              <div class="stat-number">{{ formatDate(usageStats.lastUsed) }}</div>
              <div class="stat-label">最后使用</div>
            </div>
          </div>
        </div>

        <!-- 图标管理 -->
        <div class="setting-section">
          <h3>图标管理</h3>
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-title">批量更新所有图标</div>
              <div class="setting-description">重新获取所有书签的网站图标</div>
            </div>
            <el-button
              @click="updateAllFavicons"
              :loading="updatingFavicons"
              :disabled="usageStats.totalBookmarks === 0"
            >
              <el-icon><Refresh /></el-icon>
              更新图标
            </el-button>
          </div>

          <div v-if="faviconUpdateProgress.show" class="favicon-progress">
            <el-progress
              :percentage="faviconUpdateProgress.percentage"
              :status="faviconUpdateProgress.status"
            />
            <p class="progress-text">
              正在更新图标... ({{ faviconUpdateProgress.current }}/{{ faviconUpdateProgress.total }})
            </p>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="setting-section">
          <h3>数据管理</h3>
          <div class="action-buttons">
            <el-button @click="exportSettings">
              <el-icon><Download /></el-icon>
              导出设置
            </el-button>
            <el-button @click="showImportDialog = true">
              <el-icon><Upload /></el-icon>
              导入设置
            </el-button>
            <el-button type="danger" @click="resetSettings">
              <el-icon><RefreshLeft /></el-icon>
              重置设置
            </el-button>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 导入设置对话框 -->
    <el-dialog
      v-model="showImportDialog"
      title="导入设置"
      width="400px"
    >
      <el-upload
        ref="uploadRef"
        :auto-upload="false"
        :show-file-list="false"
        :on-change="handleSettingsFileSelect"
        accept=".json"
        drag
      >
        <el-icon class="upload-icon"><UploadFilled /></el-icon>
        <div class="upload-text">
          <p>点击或拖拽设置文件到此处</p>
          <p class="upload-hint">支持 .json 格式</p>
        </div>
      </el-upload>

      <template #footer>
        <el-button @click="showImportDialog = false">取消</el-button>
        <el-button
          type="primary"
          @click="importSettings"
          :loading="importLoading"
          :disabled="!selectedSettingsFile"
        >
          导入
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  ElCard, ElSwitch, ElSelect, ElOption, ElButton, ElIcon, ElAlert,
  ElDialog, ElUpload, ElMessage, ElMessageBox, ElProgress
} from 'element-plus';
import {
  Setting, Download, Upload, RefreshLeft, UploadFilled, Refresh
} from '@element-plus/icons-vue';
import type { UploadFile } from 'element-plus';
import { SettingsManager, type AppSettings } from '@/utils/settings';
import { BookmarkManager } from '@/utils/bookmarkManager';

// Emits
const emit = defineEmits<{
  'settings-changed': [settings: Partial<AppSettings>];
}>();

// State
const settings = ref<AppSettings>({
  enableNewTabOverride: false,
  theme: 'auto',
  defaultView: 'grid',
  showFavicons: true,
  autoBackup: false,
  backupInterval: 7
});

const usageStats = ref({
  totalBookmarks: 0,
  totalFolders: 0,
  totalTags: 0,
  lastUsed: Date.now()
});

const newTabLoading = ref(false);
const showImportDialog = ref(false);
const importLoading = ref(false);
const selectedSettingsFile = ref<File | null>(null);
const updatingFavicons = ref(false);
const faviconUpdateProgress = ref({
  show: false,
  current: 0,
  total: 0,
  percentage: 0,
  status: 'active' as 'active' | 'success' | 'exception'
});

// Refs
const uploadRef = ref();

// Methods
const loadSettings = async () => {
  try {
    settings.value = await SettingsManager.getSettings();
    usageStats.value = await SettingsManager.getUsageStats();
  } catch (error) {
    console.error('Failed to load settings:', error);
    ElMessage.error('加载设置失败');
  }
};

const saveSettings = async () => {
  try {
    const oldSettings = await SettingsManager.getSettings();
    await SettingsManager.saveSettings(settings.value);
    emit('settings-changed', settings.value);
    
    // 如果主题发生变化，立即应用新主题
    if (oldSettings.theme !== settings.value.theme) {
      // 通过全局方法应用主题
      const app = document.querySelector('#app')?.__vue_app__;
      if (app && app.config.globalProperties.$applyTheme) {
        await app.config.globalProperties.$applyTheme(settings.value.theme);
      }
    }
    
    ElMessage.success('设置已保存');
  } catch (error) {
    console.error('Failed to save settings:', error);
    ElMessage.error('保存设置失败');
  }
};

const handleNewTabOverrideChange = async (value: boolean) => {
  try {
    newTabLoading.value = true;
    await SettingsManager.setSetting('enableNewTabOverride', value);
    emit('settings-changed', { enableNewTabOverride: value });

    if (value) {
      ElMessage.success('新标签页覆盖已启用，可能需要重新加载扩展');
    } else {
      ElMessage.success('新标签页覆盖已禁用');
    }
  } catch (error) {
    console.error('Failed to update newtab override:', error);
    ElMessage.error('设置失败，请重试');
    // 回滚设置
    settings.value.enableNewTabOverride = !value;
  } finally {
    newTabLoading.value = false;
  }
};

const exportSettings = async () => {
  try {
    const settingsJson = await SettingsManager.exportSettings();
    const blob = new Blob([settingsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `bookmark-manager-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
    ElMessage.success('设置导出成功');
  } catch (error) {
    console.error('Failed to export settings:', error);
    ElMessage.error('导出设置失败');
  }
};

const handleSettingsFileSelect = (file: UploadFile) => {
  if (file.raw) {
    selectedSettingsFile.value = file.raw;
  }
};

const importSettings = async () => {
  if (!selectedSettingsFile.value) return;

  try {
    importLoading.value = true;
    const content = await readFile(selectedSettingsFile.value);
    await SettingsManager.importSettings(content);

    // 重新加载设置
    await loadSettings();
    emit('settings-changed', settings.value);

    ElMessage.success('设置导入成功');
    showImportDialog.value = false;
    selectedSettingsFile.value = null;
    uploadRef.value?.clearFiles();
  } catch (error) {
    console.error('Failed to import settings:', error);
    ElMessage.error('导入设置失败：' + error.message);
  } finally {
    importLoading.value = false;
  }
};

const resetSettings = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要重置所有设置吗？此操作不可撤销。',
      '确认重置',
      {
        confirmButtonText: '重置',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );

    await SettingsManager.resetSettings();
    await loadSettings();
    emit('settings-changed', settings.value);

    ElMessage.success('设置已重置');
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to reset settings:', error);
      ElMessage.error('重置设置失败');
    }
  }
};

const readFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
};

const updateAllFavicons = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要更新所有书签的图标吗？这可能需要一些时间。',
      '确认更新',
      {
        confirmButtonText: '开始更新',
        cancelButtonText: '取消',
        type: 'info',
      }
    );

    updatingFavicons.value = true;
    faviconUpdateProgress.value.show = true;
    faviconUpdateProgress.value.status = 'active';

    await BookmarkManager.updateAllFavicons((current, total) => {
      faviconUpdateProgress.value.current = current;
      faviconUpdateProgress.value.total = total;
      faviconUpdateProgress.value.percentage = Math.round((current / total) * 100);
    });

    faviconUpdateProgress.value.status = 'success';
    ElMessage.success('所有图标更新完成');

    // 重新加载统计数据
    await loadSettings();
    emit('settings-changed', {});

    // 3秒后隐藏进度条
    setTimeout(() => {
      faviconUpdateProgress.value.show = false;
    }, 3000);

  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to update favicons:', error);
      ElMessage.error('更新图标失败');
      faviconUpdateProgress.value.status = 'exception';
    } else {
      faviconUpdateProgress.value.show = false;
    }
  } finally {
    updatingFavicons.value = false;
  }
};

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return '今天';
  } else if (diffDays === 1) {
    return '昨天';
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  } else {
    return date.toLocaleDateString();
  }
};

onMounted(() => {
  loadSettings();
});
</script>

<style scoped>
.settings {
  max-width: 800px;
  margin: 0 auto;
}

.settings-card {
  width: 100%;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.setting-section h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
  border-bottom: 1px solid #e1e5e9;
  padding-bottom: 8px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid #f0f0f0;
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-info {
  flex: 1;
}

.setting-title {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
}

.setting-description {
  font-size: 12px;
  color: #666;
  line-height: 1.4;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.stat-item {
  text-align: center;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.stat-number {
  font-size: 24px;
  font-weight: 600;
  color: #1890ff;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: #666;
}

.action-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.upload-icon {
  font-size: 48px;
  color: #c0c4cc;
  margin-bottom: 16px;
}

.upload-text p {
  margin: 4px 0;
}

.upload-hint {
  font-size: 12px;
  color: #999;
}

:deep(.el-upload-dragger) {
  width: 100%;
  height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.favicon-progress {
  margin-top: 16px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 6px;
}

.progress-text {
  margin: 8px 0 0 0;
  font-size: 13px;
  color: #666;
  text-align: center;
}
</style>
