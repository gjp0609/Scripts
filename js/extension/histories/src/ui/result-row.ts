import type { SearchResult } from '../search/search-engine';
import { escapeHtml, formatClock, formatDayHeading, hostFromUrl, dayKey, dayRange } from './format';
import type { TimeDisplay } from './format';

export interface ResultRowContext {
    /** 时间显示制式，来自设置页。 */
    timeDisplay: TimeDisplay;
    /** 是否在新标签页打开，来自设置页。 */
    openLinksInNewTab: boolean;
    /** 页面地址对应的图标地址；未声明 favicon 权限时为 undefined。 */
    faviconUrl?: string;
}

/**
 * 渲染结果表的一行，列顺序与 HTU 一致：时间、图标、标题/域名。
 * HTU 的复选框列对应删除功能，第一阶段明确不做，因此不保留占位。
 */
export function renderResultRowHtml(
    result: SearchResult,
    visitTime: number,
    index: number,
    context: ResultRowContext,
): string {
    const title = result.title.trim() || result.url;
    const host = hostFromUrl(result.url);
    const target = context.openLinksInNewTab ? '_blank' : '_self';

    const faviconCell = context.faviconUrl
        ? `<td class="faviconColumn"><img src="${escapeHtml(context.faviconUrl)}" width="16" height="16" alt="" /></td>`
        : `<td class="faviconColumn"></td>`;

    // 标题与域名相同时不重复显示域名，与 HTU 的 title_url_different 判断一致。
    const hostSpan = host && title !== host ? `<span class="histdomain">${escapeHtml(host)}</span>` : '';

    return [
        '<tr>',
        `<td class="timeColumn"><label>${escapeHtml(formatClock(visitTime, context.timeDisplay))}</label></td>`,
        faviconCell,
        `<td class="urlColumn"><a id="histlink${index}" href="${escapeHtml(result.url)}" target="${target}" rel="noreferrer">${escapeHtml(title)}</a>${hostSpan}</td>`,
        '</tr>',
    ].join('');
}

/** 日期分隔行；点击后按该日筛选，对应 HTU 的 dateSearchAction。 */
export function renderDayDividerHtml(visitTime: number): string {
    const range = dayRange(visitTime);
    return [
        '<tr>',
        `<td colspan="3" class="new_day"><a href="#" data-day-start="${range.start}" data-day-end="${range.end}">`,
        escapeHtml(formatDayHeading(visitTime)),
        '</a></td>',
        '</tr>',
    ].join('');
}

/** 按天分组渲染整张结果表，日期变化处插入分隔行。 */
export function renderResultsHtml(results: SearchResult[], context: ResultRowContext): string {
    const parts: string[] = [];
    let lastDay = '';

    results.forEach((result, index) => {
        const visitTime = result.matchedVisitTime ?? result.lastVisitTime;
        const key = dayKey(visitTime);
        if (key !== lastDay) {
            lastDay = key;
            parts.push(renderDayDividerHtml(visitTime));
        }
        parts.push(renderResultRowHtml(result, visitTime, index, context));
    });

    return parts.join('');
}
