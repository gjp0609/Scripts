const { h } = Vue;

export const route = ['options', 'history', 'proxy', 'test'];
export const aside = (title) => [
    h(
        'ul',
        route.map((page) =>
            h('li', { class: page === title ? 'active' : '' }, [h('a', { href: chrome.extension.getURL(page + '/index.html') }, [page])])
        )
    )
];
