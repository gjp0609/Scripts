<template>
  <div class="import-export">
    <el-card class="operation-card">
      <template #header>
        <div class="card-header">
          <el-icon><Download /></el-icon>
          <span>导出书签</span>
        </div>
      </template>

      <div class="export-section">
        <p class="section-description">
          将您的书签导出为文件，方便备份或迁移到其他浏览器。
        </p>

        <div class="export-buttons">
          <el-button
            type="primary"
            @click="exportHTML"
            :loading="exportingHTML"
          >
            <el-icon><Document /></el-icon>
            导出为HTML
          </el-button>
          <el-button
            type="success"
            @click="exportJSON"
            :loading="exportingJSON"
          >
            <el-icon><Files /></el-icon>
            导出完整备份
          </el-button>
        </div>

        <div class="export-info">
          <el-alert
            title="导出说明"
            type="info"
            :closable="false"
            show-icon
          >
            <ul>
              <li><strong>HTML格式：</strong>通用书签格式，可导入到其他浏览器，但不包含标签和描述信息</li>
              <li><strong>完整备份：</strong>JSON格式，包含所有信息，用于本插件的完整恢复</li>
            </ul>
          </el-alert>
        </div>
      </div>
    </el-card>

    <el-card class="operation-card">
      <template #header>
        <div class="card-header">
          <el-icon><Upload /></el-icon>
          <span>导入书签</span>
        </div>
      </template>

      <div class="import-section">
        <p class="section-description">
          从文件导入书签。支持HTML和JSON格式。
        </p>

        <el-upload
          ref="uploadRef"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="handleFileSelect"
          accept=".html,.htm,.json"
          drag
        >
          <el-icon class="upload-icon"><UploadFilled /></el-icon>
          <div class="upload-text">
            <p>点击或拖拽文件到此处</p>
            <p class="upload-hint">支持 .html 和 .json 格式</p>
          </div>
        </el-upload>

        <div v-if="selectedFile" class="file-preview">
          <div class="file-info">
            <el-icon><Document /></el-icon>
            <span>{{ selectedFile.name }}</span>
            <el-button type="" @click="clearFile">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>

          <div v-if="importPreview" class="preview-info">
            <el-descriptions :column="2" size="small" border>
              <el-descriptions-item label="文件夹数量">
                {{ importPreview.folders }}
              </el-descriptions-item>
              <el-descriptions-item label="书签数量">
                {{ importPreview.bookmarks }}
              </el-descriptions-item>
            </el-descriptions>

            <div class="preview-folders">
              <h4>文件夹预览：</h4>
              <div class="folder-list">
                <div
                  v-for="folder in importPreview.preview.slice(0, 5)"
                  :key="folder.folderName"
                  class="folder-item"
                >
                  <span>{{ folder.folderName }}</span>
                  <el-tag size="small">{{ folder.bookmarkCount }} 个书签</el-tag>
                </div>
                <div v-if="importPreview.preview.length > 5" class="more-folders">
                  还有 {{ importPreview.preview.length - 5 }} 个文件夹...
                </div>
              </div>
            </div>
          </div>

          <div class="import-actions">
            <el-button
              type="primary"
              @click="importFile"
              :loading="importing"
            >
              开始导入
            </el-button>
            <el-button @click="clearFile">取消</el-button>
          </div>
        </div>

        <div class="import-info">
          <el-alert
            title="导入说明"
            type="warning"
            :closable="false"
            show-icon
          >
            <ul>
              <li>导入的书签将与现有书签合并，不会覆盖现有数据</li>
              <li>如果存在同名文件夹，书签将合并到现有文件夹中</li>
              <li>建议在导入前先导出当前数据作为备份</li>
            </ul>
          </el-alert>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  ElCard, ElButton, ElUpload, ElIcon, ElAlert, ElDescriptions,
  ElDescriptionsItem, ElTag, ElMessage, ElMessageBox
} from 'element-plus';
import {
  Download, Upload, Document, Files, UploadFilled, Close
} from '@element-plus/icons-vue';
import type { UploadFile } from 'element-plus';
import { ImportExportManager } from '@/utils/importExport';

// Emits
const emit = defineEmits<{
  'import-success': [];
}>();

// State
const exportingHTML = ref(false);
const exportingJSON = ref(false);
const importing = ref(false);
const selectedFile = ref<File | null>(null);
const importPreview = ref<{
  folders: number;
  bookmarks: number;
  preview: Array<{ folderName: string; bookmarkCount: number; }>;
} | null>(null);

// Refs
const uploadRef = ref();

// Methods
const exportHTML = async () => {
  try {
    exportingHTML.value = true;
    await ImportExportManager.exportHTMLFile();
    ElMessage.success('HTML书签导出成功');
  } catch (error) {
    console.error('Export HTML failed:', error);
    ElMessage.error('导出失败，请重试');
  } finally {
    exportingHTML.value = false;
  }
};

const exportJSON = async () => {
  try {
    exportingJSON.value = true;
    await ImportExportManager.exportJSONFile();
    ElMessage.success('完整备份导出成功');
  } catch (error) {
    console.error('Export JSON failed:', error);
    ElMessage.error('导出失败，请重试');
  } finally {
    exportingJSON.value = false;
  }
};

const handleFileSelect = async (file: UploadFile) => {
  if (!file.raw) return;

  selectedFile.value = file.raw;

  try {
    // 获取导入预览
    importPreview.value = await ImportExportManager.getImportPreview(file.raw);
  } catch (error) {
    console.error('Failed to get import preview:', error);
    ElMessage.error('文件格式不正确或文件损坏');
    clearFile();
  }
};

const clearFile = () => {
  selectedFile.value = null;
  importPreview.value = null;
  uploadRef.value?.clearFiles();
};

const importFile = async () => {
  if (!selectedFile.value) return;

  try {
    await ElMessageBox.confirm(
      '确定要导入这些书签吗？导入的书签将与现有书签合并。',
      '确认导入',
      {
        confirmButtonText: '确定导入',
        cancelButtonText: '取消',
        type: 'info',
      }
    );

    importing.value = true;
    await ImportExportManager.handleFileImport(selectedFile.value);

    ElMessage.success('书签导入成功');
    emit('import-success');
    clearFile();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Import failed:', error);
      ElMessage.error('导入失败：' + (error.message || '未知错误'));
    }
  } finally {
    importing.value = false;
  }
};
</script>

<style scoped>
.import-export {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.operation-card {
  width: 100%;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.section-description {
  margin-bottom: 16px;
  color: #666;
  line-height: 1.5;
}

.export-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.export-info,
.import-info {
  margin-top: 16px;
}

.export-info ul,
.import-info ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

.export-info li,
.import-info li {
  margin-bottom: 4px;
  line-height: 1.4;
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

.file-preview {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid #e1e5e9;
  border-radius: 6px;
  background: #fafbfc;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e1e5e9;
}

.file-info span {
  flex: 1;
  font-weight: 500;
}

.preview-info {
  margin-bottom: 16px;
}

.preview-folders {
  margin-top: 16px;
}

.preview-folders h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #333;
}

.folder-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.folder-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: white;
  border-radius: 4px;
  border: 1px solid #e1e5e9;
}

.more-folders {
  padding: 8px 12px;
  text-align: center;
  color: #666;
  font-style: italic;
}

.import-actions {
  display: flex;
  gap: 12px;
}

:deep(.el-upload-dragger) {
  width: 100%;
  height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
</style>
