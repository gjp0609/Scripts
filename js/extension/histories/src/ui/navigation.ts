/**
 * 侧边栏导航，对应 HTU 的 navigation.js。
 *
 * 第一阶段只有历史页与设置页两个页面，因此导航项也固定为两项。
 */

export type NavPage = 'browse.html' | 'options.html';

export type NavItem = {
    label: string;
    page: NavPage;
};

export const NAV_ITEMS: NavItem[] = [
    { label: '历史', page: 'browse.html' },
    { label: '设置', page: 'options.html' },
];

/**
 * 渲染侧边栏。当前页对应的条目使用 selected 类且不可点击，其余条目点击后跳转。
 */
export function renderSidebar(container: Element | null, currentPage: NavPage, openPage: (page: string) => void): void {
    if (!container) return;

    const list = document.createElement('ul');
    list.id = 'navigation';

    for (const item of NAV_ITEMS) {
        const entry = document.createElement('li');
        entry.id = `nav_${item.page.replace(/\.html$/, '')}`;

        if (item.page === currentPage) {
            entry.className = 'selected';
            entry.textContent = item.label;
        } else {
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = item.label;
            link.addEventListener('click', (event) => {
                event.preventDefault();
                openPage(item.page);
            });
            entry.append(link);
        }

        list.append(entry);
    }

    container.replaceChildren(list);
}
