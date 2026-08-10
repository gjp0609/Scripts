import type { ExportBookmarkNode, UiPreferences } from '../types/bookmark';
import { normalizeBookmarkExtra } from './bookmarkExtraModel.ts';
import { getSearchCapabilityValidationError } from './searchService.ts';

export type ValidatedImportData = {
    children: ExportBookmarkNode[];
    preferences: UiPreferences;
    originId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeImportNode(value: unknown, path: string, sourceIds: Set<string>): ExportBookmarkNode {
    if (!isRecord(value)) throw new Error(`${path}数据无效`);
    if (typeof value.sourceId !== 'string' || !value.sourceId.trim()) throw new Error(`${path}缺少源节点 ID`);

    const sourceId = value.sourceId.trim();
    if (sourceIds.has(sourceId)) throw new Error(`${path}的源节点 ID 重复`);
    sourceIds.add(sourceId);

    if (typeof value.title !== 'string') throw new Error(`${path}缺少标题`);
    const title = value.title;
    if (typeof value.url === 'string') {
        const url = value.url;
        if (!url) throw new Error(`${path}“${title}”缺少有效 URL`);
        if (value.children !== undefined) throw new Error(`${path}“${title}”不能同时包含 URL 和子节点`);
        const extra = normalizeBookmarkExtra(value.extra, sourceId);
        const capabilityError = getSearchCapabilityValidationError({
            tags: extra?.tags ?? [],
            url,
            searchUrl: extra?.searchUrl,
        });
        if (capabilityError) throw new Error(`${path}“${title}”：${capabilityError}`);
        return { sourceId, title, url, extra };
    }

    if (!Array.isArray(value.children)) throw new Error(`${path}目录“${title}”缺少子节点数组`);
    return {
        sourceId,
        title,
        children: value.children.map((child, index) =>
            normalizeImportNode(child, `${path}第 ${index + 1} 个节点`, sourceIds),
        ),
    };
}

export function validateFullImportData(data: unknown): ValidatedImportData {
    if (
        !isRecord(data) ||
        data.version !== 3 ||
        typeof data.originId !== 'string' ||
        !data.originId ||
        !isRecord(data.root) ||
        !Array.isArray(data.root.children)
    ) {
        throw new Error('全量导入文件格式无效');
    }
    if (!isRecord(data.preferences)) throw new Error('全量导入文件缺少偏好数据');

    const collapsedFolderIds = data.preferences.collapsedFolderIds;
    const searchEngine = data.preferences.searchEngine;
    if (!Array.isArray(collapsedFolderIds) || !collapsedFolderIds.every((id) => typeof id === 'string')) {
        throw new Error('折叠目录偏好格式无效');
    }
    if (typeof searchEngine !== 'string') throw new Error('搜索引擎偏好格式无效');

    const sourceIds = new Set<string>();
    return {
        children: data.root.children.map((child, index) =>
            normalizeImportNode(child, `根目录第 ${index + 1} 个节点`, sourceIds),
        ),
        originId: data.originId,
        preferences: { collapsedFolderIds: [...collapsedFolderIds], searchEngine },
    };
}
