export function normalizeSearchIndex(current: number, total: number): number {
    if (!total) return 0;
    return ((current % total) + total) % total;
}

export function nextSelectedEngineIndex(selectedIndex: number, offset: number, total: number): number {
    return normalizeSearchIndex((selectedIndex < 0 ? 0 : selectedIndex) + offset, total);
}
