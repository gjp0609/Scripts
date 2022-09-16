import { db, add, list } from './compatible.js';

const { createApp, h } = Vue;
createApp({
    el: '#app',
    data() {
        return {
            list: [],
            keyword: '',
            pageCount: 20,
            page: 1,
            type: 2
        };
    },
    mounted() {
        chrome.storage.local.get('pageCount', (val) => {
            if (val || val.pageCount) {
                this.pageCount = val.pageCount;
                this.search();
            }
        });
    },
    methods: {
        search(page) {
            if (!page || page <= 0) {
                page = 1;
            }
            this.page = page;
            console.log(page);
            if (page <= 0) {
                return;
            }
            list(db, {
                keyword: this.keyword,
                pageCount: this.pageCount,
                page: this.page,
                type: this.type
            }).then((arr) => {
                if (arr.length === 0) {
                    --this.page;
                    return;
                }
                this.list = arr;
            });
        },
        getDomainFromUrl(url) {
            let a = document.createElement('a');
            a.href = url;
            return a.hostname;
        }
    },
    props: ['modelValue'],
    emits: ['update:modelValue'],
    render() {
        return [
            h('aside', [h('ul', [h('li', 'Search'), h('li', 'Options')])]),
            h('article', [
                h('div', { class: 'title' }, ['History Trends Unlimited: Search']),
                h('label', { class: 'search' }, [
                    'Search for: ',
                    h('input', {
                        value: this.keyword,
                        onInput: (e) => {
                            this.keyword = e.target.value;
                            this.$emit('input', e.target.value);
                        },
                        onKeyup: (e) => {
                            if (e.key === 'Enter') {
                                this.search();
                            }
                        }
                    }),
                    ' ',
                    h(
                        'button',
                        {
                            onClick: () => this.search()
                        },
                        ['Go']
                    )
                ]),
                h('div', { class: 'pager' }, [
                    h('div', { class: 'left' }, [
                        h('span', 'Page ' + this.page + ' of all history'),
                        h('span', ' | Type: '),
                        h(
                            'select',
                            {
                                title: 'type',
                                value: this.type,
                                onChange: (e) => {
                                    this.type = e.target.value;
                                }
                            },
                            [h('option', { value: 1 }, 'regex'), h('option', { value: 2 }, 'normal')]
                        ),
                        h('span', ' | Page Count: '),
                        h('input', {
                            title: 'Page Count',
                            class: 'pageCount',
                            value: this.pageCount,
                            onInput: (e) => {
                                this.pageCount = e.target.value;
                                this.$emit('input', e.target.value);
                            },
                            onKeyup: (e) => {
                                if (e.key === 'Enter') {
                                    this.search();
                                    chrome.storage.local.set({ pageCount: this.pageCount });
                                }
                                if (e.key === 'ArrowUp') {
                                    ++this.pageCount;
                                }
                                if (e.key === 'ArrowDown') {
                                    --this.pageCount;
                                }
                            }
                        })
                    ]),
                    h('div', { class: 'right' }, [
                        h(
                            'button',
                            {
                                onClick: () => this.search(--this.page)
                            },
                            'Prev'
                        ),
                        h(
                            'button',
                            {
                                onClick: () => this.search(++this.page)
                            },
                            'Next'
                        )
                    ])
                ]),
                h(
                    'div',
                    { class: 'list' },
                    this.list.map(({ id, lastVisitTime, title, url }) => {
                        let date = new Date(lastVisitTime);
                        return h('div', { key: id, class: 'line' }, [
                            h('span', { class: 'time' }, date.toLocaleDateString().replaceAll(/\//g, '-') + ' ' + date.toLocaleTimeString()),
                            h('div', [
                                h('img', {
                                    src: 'chrome://favicon/' + url
                                })
                            ]),
                            h('a', { class: 'title', href: url, title: url }, title),
                            h('span', { class: 'domain' }, this.getDomainFromUrl(url))
                        ]);
                    })
                )
            ]),
            h('aside')
        ];
    }
}).mount('#app');

export default null;
