import { aside } from '../../common/js/aside.js';
import { isFirefox } from '../../common/js/compatible.js';
import { cachedFetch } from '../../common/js/libs/utils.js';

const { createApp, h } = Vue;
createApp({
    el: '#app',
    data() {
        return {
            isLoading: false,
            importPercentage: 100,
            list: [],
            icons: [],
            defaultImage: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
            keyword: '',
            pageCount: 20,
            page: 1,
            type: 'keywords',
            importFile: undefined
        };
    },
    mounted() {
        this.$refs.keywordInput.focus();
        chrome.storage.local.get('pageCount', (val) => {
            this.pageCount = val?.pageCount ?? this.pageCount;
            this.search();
        });
    },
    methods: {
        search(page) {
            if (this.isLoading) {
                return;
            }
            console.time('search');
            this.isLoading = true;
            if (!page || page <= 0) {
                page = 1;
            }
            this.page = page;
            if (page <= 0) {
                return;
            }
            chrome.runtime
                .sendMessage(null, {
                    from: 'history',
                    action: 'queryList',
                    params: {
                        keyword: this.keyword,
                        pageCount: this.pageCount,
                        page: this.page,
                        type: this.type
                    }
                })
                .then((histories) => {
                    console.timeEnd('search');
                    this.isLoading = false;
                    if (histories.length === 0) {
                        if (this.page > 1) {
                            --this.page;
                            return;
                        }
                        this.list = [];
                        this.icons = [];
                    }
                    this.list = [];
                    this.icons = [];
                    let lastDay = '';
                    let index = 0;
                    for (let history of histories) {
                        let date = new Date(history.lastVisitTime);
                        let dateFormat = this.localDateFormat(date);
                        let dateStr = dateFormat.dateStr;
                        if (lastDay !== dateStr) {
                            lastDay = dateStr;
                            this.list.push({ dayText: dateFormat.weekType2 + ' ' + lastDay + ' 星期' + dateFormat.weekType1 });
                            index++;
                        }
                        let domain = this.getDomainFromUrl(history.url);
                        if (isFirefox) {
                            this.getIcon(domain, index);
                        }
                        this.list.push(Object.assign({ domain: domain }, history));
                        index++;
                    }
                });
        },
        getDomainFromUrl(url) {
            let a = document.createElement('a');
            a.href = url;
            return a.hostname;
        },
        localDateFormat(date) {
            let dayInWeek = date.getDay();
            let year = date.getFullYear();
            let month = String(date.getMonth() + 1).padStart(2, '0');
            let day = String(date.getDate()).padStart(2, '0');
            let hour = String(date.getHours()).padStart(2, '0');
            let minute = String(date.getMinutes()).padStart(2, '0');
            let second = String(date.getSeconds()).padStart(2, '0');
            let weekType1 = '日一二三四五六'[dayInWeek];
            let weekType2 = '日月火水木金土'[dayInWeek];
            let dateStr = `${year}年${month}月${day}日`;
            let timeStr = `${hour}:${minute}:${second}`;
            return { dateStr, timeStr, weekType1, weekType2 };
        },
        getIcon(domain, index) {
            cachedFetch('https://favicon.yandex.net/favicon/v2/' + domain, 60 * 60 * 24 * 7).then((response) => {
                if (response.status === 200) {
                    if (response.headers.has('Is-Cached-Fetch')) {
                        response.text().then((text) => {
                            if (text.length === 118) {
                            } else {
                                this.icons[index] = text;
                            }
                        });
                    } else {
                        response.blob().then((content) => {
                            let reader = new FileReader();
                            reader.readAsDataURL(content);
                            reader.onloadend = () => {
                                let base64data = reader.result;
                                if (base64data.length === 118) {
                                } else {
                                    this.icons[index] = base64data;
                                }
                            };
                        });
                    }
                }
            });
        }
    },
    render() {
        return [
            h('aside', aside('history')),
            h('article', [
                h('div', { class: 'title' }, [chrome.i18n.getMessage('history_title')]),
                h('label', { class: 'search' }, [
                    h('div', [
                        chrome.i18n.getMessage('history_searchLabel'),
                        h('input', {
                            ref: 'keywordInput',
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
                        h(
                            'button',
                            {
                                disabled: this.isLoading,
                                onClick: () => this.search()
                            },
                            [chrome.i18n.getMessage('history_searchButton')]
                        )
                    ]),
                    h('div', { class: 'import' }, [
                        h('span', {}, [this.importPercentage === 100 ? '' : this.importPercentage + '% ']),
                        h('input', {
                            type: 'file',
                            onChange: (e) => {
                                let fr = new FileReader();
                                fr.onload = () => {
                                    this.importFile = fr.result;
                                };
                                fr.readAsText(e.target.files[0]);
                            }
                        }),
                        h(
                            'button',
                            {
                                disabled: this.importPercentage !== 100,
                                onclick: () => {
                                    if (this.importFile) {
                                        this.importPercentage = 0;
                                        console.time('import');
                                        chrome.runtime
                                            .sendMessage(null, {
                                                from: 'history',
                                                action: 'import',
                                                params: this.importFile
                                            })
                                            .then(async () => {
                                                console.timeEnd('import');
                                                this.importPercentage = 100;
                                                this.search();
                                            });
                                    }
                                }
                            },
                            [chrome.i18n.getMessage('history_import')]
                        ),
                        h(
                            'button',
                            {
                                disabled: this.importPercentage !== 100,
                                onclick: () => {
                                    chrome.runtime.sendMessage(null, {
                                        from: 'history',
                                        action: 'export'
                                    });
                                }
                            },
                            [chrome.i18n.getMessage('history_export')]
                        )
                    ])
                ]),
                h('div', { class: 'pager' }, [
                    h('div', { class: 'left' }, [
                        h('span', [chrome.i18n.getMessage('history_page', this.page)]),
                        h('span', [' | ']),
                        h('span', [chrome.i18n.getMessage('history_matchMode')]),
                        h(
                            'select',
                            {
                                value: this.type,
                                onChange: (e) => {
                                    this.type = e.target.value;
                                }
                            },
                            [
                                h('option', { value: 'regex' }, [chrome.i18n.getMessage('history_regex')]),
                                h('option', { value: 'include' }, [chrome.i18n.getMessage('history_include')]),
                                h('option', { value: 'keywords' }, [chrome.i18n.getMessage('history_keywords')])
                            ]
                        ),
                        h('span', [' | ']),
                        h('span', [chrome.i18n.getMessage('history_pageCount')]),
                        h('input', {
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
                            [chrome.i18n.getMessage('history_prev')]
                        ),
                        h(
                            'button',
                            {
                                onClick: () => this.search(++this.page)
                            },
                            [chrome.i18n.getMessage('history_next')]
                        )
                    ])
                ]),
                h('div', { class: 'loading', style: { display: this.isLoading ? 'block' : 'none' } }, [
                    h('h3', [chrome.i18n.getMessage('history_loading')])
                ]),
                h(
                    'div',
                    { class: 'list', style: { display: this.isLoading ? 'none' : 'block' } },
                    this.list.map(({ id, lastVisitTime, title, url, domain, dayText }, index) => {
                        return dayText
                            ? h('div', { class: 'day' }, [dayText])
                            : h('div', { key: id, class: 'line' }, [
                                  h('span', { class: 'time' }, [this.localDateFormat(new Date(lastVisitTime)).timeStr]),
                                  h('div', [h('img', { src: isFirefox ? this.icons[index] || this.defaultImage : 'chrome://favicon/' + url })]),
                                  h('span', { class: 'title-wrapper' }, [
                                      h('a', { class: 'title', href: url, title: url, target: '_blank' }, [title ? title.trim() || url : url]),
                                      h('span', { class: 'domain' }, [domain])
                                  ])
                              ]);
                    })
                )
            ]),
            h('aside')
        ];
    }
}).mount('#app');

export default null;
