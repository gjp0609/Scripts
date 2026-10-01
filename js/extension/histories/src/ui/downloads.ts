/** 触发浏览器下载的辅助函数。 */

export function downloadBlobFile(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadTextFile(filename: string, text: string): void {
    downloadBlobFile(filename, new Blob([text], { type: 'text/tab-separated-values;charset=utf-8' }));
}
