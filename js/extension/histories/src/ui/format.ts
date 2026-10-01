/**
 * 界面通用格式化与转义。
 *
 * 时间按「时间显示」设置输出，默认 24 小时制（需求 3 节）。
 */

const dayHeadingFormatter = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
});

const clock24Formatter = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
});

const clock12Formatter = new Intl.DateTimeFormat('zh-CN', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
});

export type TimeDisplay = '24' | '12';

export function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/** 结果行的时间列。 */
export function formatClock(timestamp: number, display: TimeDisplay = '24'): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '--:--:--';
    return (display === '12' ? clock12Formatter : clock24Formatter).format(timestamp);
}

export function formatDayHeading(timestamp: number): string {
    return dayHeadingFormatter.format(timestamp);
}

export function formatDateTime(timestamp: number, display: TimeDisplay = '24'): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '未知';
    return `${formatDayHeading(timestamp)} ${formatClock(timestamp, display)}`;
}

/** 用于按天分组的稳定键。 */
export function dayKey(timestamp: number): string {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

/** 取一天的起止时间戳，供点击日期分隔行时按该日筛选。 */
export function dayRange(timestamp: number): { start: number; end: number } {
    const start = new Date(timestamp);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start: start.getTime(), end: end.getTime() - 1 };
}

export function hostFromUrl(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return '';
    }
}

export function parseDatetimeLocal(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
}

/** 把时间戳写回 datetime-local 输入框所需的本地时间字符串。 */
export function toDatetimeLocalValue(timestamp: number): string {
    const date = new Date(timestamp);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
        date.getMinutes(),
    )}`;
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '不可用';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

export function formatCount(value: number): string {
    return Number.isFinite(value) ? value.toLocaleString('zh-CN') : '0';
}
