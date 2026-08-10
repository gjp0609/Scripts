import { ref } from 'vue';
import type { FullExportData } from '../types/bookmark';
import { getPreferences } from '../services/extraStore';
import { exportFullData, importFullData } from '../services/importExportService';
import { repairExtensionData, type MetadataRepairReport } from '../services/metadataMaintenance';
import type { useBookmarkWorkspace } from './useBookmarkWorkspace';

type Workspace = ReturnType<typeof useBookmarkWorkspace>;

function downloadJson(filename: string, data: FullExportData) {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

export function useImportExport(workspace: Workspace) {
    const open = ref(false);
    const busy = ref(false);
    const error = ref('');
    const maintenanceResult = ref('');

    function show() {
        error.value = '';
        maintenanceResult.value = '';
        open.value = true;
    }

    function close() {
        if (busy.value) return;
        open.value = false;
        error.value = '';
    }

    async function exportAll() {
        busy.value = true;
        error.value = '';
        try {
            if (!workspace.rootId.value) throw new Error('当前未读取到可导出的书签根目录');
            const data = await exportFullData(workspace.rootId.value, await getPreferences());
            downloadJson(`markhub-bookmarks-${Date.now()}.json`, data);
        } catch (caught) {
            error.value = caught instanceof Error ? caught.message : '导出失败';
        } finally {
            busy.value = false;
        }
    }

    async function importAll(file: File) {
        busy.value = true;
        error.value = '';
        try {
            if (!workspace.rootId.value) throw new Error('当前未读取到可导入的书签根目录');
            await importFullData(workspace.rootId.value, JSON.parse(await file.text()));
            await workspace.reload();
            open.value = false;
        } catch (caught) {
            error.value = caught instanceof Error ? caught.message : '导入失败';
        } finally {
            busy.value = false;
        }
    }

    async function repairData() {
        if (busy.value) return;
        busy.value = true;
        error.value = '';
        maintenanceResult.value = '';
        try {
            const report: MetadataRepairReport = await repairExtensionData();
            await workspace.reload({ silent: true });
            maintenanceResult.value = `已校验 ${report.extrasScanned} 条扩展数据，清理 ${report.extrasRemoved} 条孤立数据，修复 ${report.extrasRepaired} 条；清理 ${report.mappingsRemoved}/${report.mappingsScanned} 条恢复映射${report.preferencesRepaired ? '，并修正了偏好引用' : ''}。`;
        } catch (caught) {
            error.value = caught instanceof Error ? caught.message : '维护数据失败';
        } finally {
            busy.value = false;
        }
    }

    return { open, busy, error, maintenanceResult, show, close, exportAll, importAll, repairData };
}
