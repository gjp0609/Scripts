type DragKind = 'bookmark' | 'folder';

function eventClientPosition(event: Event | undefined): { x?: number; y?: number } {
    if (event instanceof MouseEvent) return { x: event.clientX, y: event.clientY };
    if (event instanceof TouchEvent) return { x: event.touches[0]?.clientX, y: event.touches[0]?.clientY };
    return {};
}

export function createOrganizeDragScrollController(options: {
    getScrollContainer: () => HTMLElement | null | undefined;
    getKind: () => DragKind;
    isDragging: () => boolean;
    project: (clientX?: number, clientY?: number) => void;
}) {
    let pointerX: number | undefined;
    let pointerY: number | undefined;
    let scrollFrame = 0;
    let projectionFrame = 0;
    let scrollViewport: HTMLElement | undefined;
    let bookmarkEdgeScrollPaused = false;

    function scheduleProjectionRefresh() {
        if (options.getKind() !== 'bookmark') return;
        cancelAnimationFrame(projectionFrame);
        projectionFrame = requestAnimationFrame(() => {
            projectionFrame = 0;
            options.project(pointerX, pointerY);
        });
    }

    function handleViewportScroll() {
        if (options.isDragging() && options.getKind() === 'bookmark') scheduleProjectionRefresh();
    }

    function autoScroll() {
        if (!options.isDragging()) return;
        const viewport = options.getScrollContainer();
        if (viewport && pointerY != null) {
            const rect = viewport.getBoundingClientRect();
            const edge = Math.min(96, rect.height * 0.18);
            let delta = 0;
            if (!(options.getKind() === 'bookmark' && bookmarkEdgeScrollPaused)) {
                if (pointerY < rect.top + edge) delta = -Math.ceil((rect.top + edge - pointerY) / 5);
                else if (pointerY > rect.bottom - edge) delta = Math.ceil((pointerY - (rect.bottom - edge)) / 5);
            }
            if (delta) {
                viewport.scrollTop += Math.max(-18, Math.min(18, delta));
                if (options.getKind() === 'bookmark') {
                    options.project(pointerX, pointerY);
                    scheduleProjectionRefresh();
                }
            }
        }
        scrollFrame = requestAnimationFrame(autoScroll);
    }

    function trackPointer(event: MouseEvent | TouchEvent) {
        const position = eventClientPosition(event);
        pointerX = position.x;
        pointerY = position.y;
        if (options.getKind() === 'bookmark') bookmarkEdgeScrollPaused = false;
        options.project(pointerX, pointerY);
    }

    function forwardWheel(event: WheelEvent) {
        const viewport = options.getScrollContainer();
        if (!viewport || !options.isDragging()) return;
        event.preventDefault();
        if (options.getKind() === 'bookmark') bookmarkEdgeScrollPaused = true;
        viewport.scrollTop += event.deltaY;
        if (options.getKind() === 'bookmark') {
            options.project(pointerX, pointerY);
            scheduleProjectionRefresh();
        }
    }

    function start() {
        bookmarkEdgeScrollPaused = false;
        window.addEventListener('mousemove', trackPointer, true);
        window.addEventListener('touchmove', trackPointer, { capture: true, passive: true });
        window.addEventListener('wheel', forwardWheel, { capture: true, passive: false });
        if (options.getKind() === 'bookmark') {
            scrollViewport = options.getScrollContainer() ?? undefined;
            scrollViewport?.addEventListener('scroll', handleViewportScroll, { passive: true });
        }
        scrollFrame = requestAnimationFrame(autoScroll);
    }

    function stop() {
        cancelAnimationFrame(scrollFrame);
        cancelAnimationFrame(projectionFrame);
        scrollFrame = 0;
        projectionFrame = 0;
        pointerX = undefined;
        pointerY = undefined;
        bookmarkEdgeScrollPaused = false;
        scrollViewport?.removeEventListener('scroll', handleViewportScroll);
        scrollViewport = undefined;
        window.removeEventListener('mousemove', trackPointer, true);
        window.removeEventListener('touchmove', trackPointer, true);
        window.removeEventListener('wheel', forwardWheel, true);
    }

    function updateFromEvent(event: Event | undefined) {
        const position = eventClientPosition(event);
        pointerX = position.x;
        pointerY = position.y;
        options.project(pointerX, pointerY);
    }

    return {
        start,
        stop,
        updateFromEvent,
        projectCurrent: () => options.project(pointerX, pointerY),
    };
}
