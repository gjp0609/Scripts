const { h } = Vue;

export const route = ['history', 'newTab', 'translate', 'test'];

export const aside = (title) => [
    h(
        'ul',
        route.map((page) =>
            h('li', { class: page === title ? 'active' : '' }, [
                h('a', { href: chrome.runtime.getURL(page + '/index.html') }, [chrome.i18n.getMessage(page)])
            ])
        )
    )
];
