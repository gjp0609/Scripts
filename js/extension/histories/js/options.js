import db from './compatible.js';

const { createApp, h } = Vue;
createApp({
    el: '#app',
    data() {
        return {
            isLoading: false,
            importPercentage: 100,
            list: [],
            keyword: '',
            pageCount: 20,
            page: 1,
            type: 2,
            importFile: undefined
        };
    },
    mounted() {
        chrome.storage.local.get('pageCount', (val) => {
            if (val || val.pageCount || this.pageCount) {
                this.pageCount = val.pageCount;
                this.search();
            }
        });
    },
    methods: {
        search(page) {
            console.time('search');
            this.isLoading = true;
            if (!page || page <= 0) {
                page = 1;
            }
            this.page = page;
            if (page <= 0) {
                return;
            }
            db.queryList({
                keyword: this.keyword,
                pageCount: this.pageCount,
                page: this.page,
                type: this.type
            }).then((histories) => {
                console.timeEnd('search');
                this.isLoading = false;
                if (histories.length === 0) {
                    --this.page;
                    return;
                }
                this.list = [];
                let lastDay = null;
                for (let history of histories) {
                    let date = new Date(history.lastVisitTime);
                    let day = date.getFullYear() + '年' + date.getMonth() + '月' + date.getDay() + '日 星期';
                    if (lastDay !== day) {
                        lastDay = day;
                        this.list.push({ dayText: this.localDateFormat(date) });
                    }
                    this.list.push(history);
                }
            });
        },
        getDomainFromUrl(url) {
            let a = document.createElement('a');
            a.href = url;
            return a.hostname;
        },
        localDateFormat(date) {
            const weekInText = '日月火水木金土';
            const options = { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' };
            let dayText = date.toLocaleDateString('chinese', options);
            return `${weekInText[date.getDay()]} ${dayText}`;
        }
    },
    props: ['modelValue'],
    emits: ['update:modelValue'],
    render() {
        return [
            h('aside', [h('ul', [h('li', 'Search'), h('li', 'Options')])]),
            h('article', [
                h('div', { class: 'title' }, ['History Search']),
                h('label', { class: 'search' }, [
                    h('div', [
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
                        h(
                            'button',
                            {
                                onClick: () => this.search()
                            },
                            ['Go']
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
                                        db.clearTable().then(() => {
                                            console.time('import');
                                            let arr = this.importFile.split('\r\n');
                                            (async () => {
                                                let buf = [];
                                                // 44w data insert speed:
                                                // bufSize =  500: 106s
                                                // bufSize = 1000: 86s
                                                // bufSize = 2000: 80s
                                                // bufSize = 5000: 90s
                                                let bufSize = 2000;
                                                for (let i = 0; i < arr.length; i++) {
                                                    if ((100.0 * i) / arr.length > this.importPercentage) {
                                                        this.importPercentage++;
                                                    }
                                                    let line = arr[i];
                                                    let split = line.split('\t');
                                                    if (split.length === 4) {
                                                        let [url, lastVisitTime, typedCount, title] = split;
                                                        if (lastVisitTime.indexOf('U') === 0) {
                                                            lastVisitTime = lastVisitTime.substring(1);
                                                        }
                                                        lastVisitTime = parseInt(lastVisitTime);
                                                        buf.push({ url, title, lastVisitTime, typedCount });
                                                        if (buf.length === bufSize) {
                                                            await db.bulkAdd(buf);
                                                            buf = [];
                                                        }
                                                    }
                                                }
                                                if (buf.length > 0) {
                                                    await db.bulkAdd(buf);
                                                }
                                                this.importPercentage = 100;
                                                console.timeEnd('import');
                                                this.search();
                                            })();
                                        });
                                    }
                                }
                            },
                            ['import']
                        ),
                        h(
                            'button',
                            {
                                disabled: this.importPercentage !== 100,
                                onclick: () => {
                                    this.importPercentage = 0;
                                    console.time('export');
                                    db.exportTsv().then((csvContent) => {
                                        this.importPercentage = 50;
                                        csvContent = new Blob([csvContent], { type: 'text/tsv' });
                                        let csvUrl = URL.createObjectURL(csvContent);
                                        let link = document.createElement('a');
                                        link.setAttribute('href', csvUrl);
                                        link.setAttribute('download', 'export.tsv');
                                        document.body.appendChild(link);
                                        link.click();
                                        console.timeEnd('export');
                                        this.importPercentage = 100;
                                    });
                                }
                            },
                            ['export']
                        )
                    ])
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
                h('div', { class: 'loading', style: { display: this.isLoading ? 'block' : 'none' } }, [h('h3', ['Loading'])]),
                h(
                    'div',
                    { class: 'list', style: { display: this.isLoading ? 'none' : 'block' } },
                    this.list.map(({ id, lastVisitTime, title, url, dayText }) => {
                        if (id) {
                            let time = new Date(lastVisitTime);
                            let date = time.toLocaleDateString().replaceAll(/\//g, '-');
                            return h('div', { key: id, class: 'line' }, [
                                h('span', { class: 'time' }, date + ' ' + time.toLocaleTimeString()),
                                h('div', [
                                    h('img', {
                                        src: 'chrome://favicon/' + url
                                    })
                                ]),
                                h('a', { class: 'title', href: url, title: url, target: '_blank' }, title ? title.trim() || url : url),
                                h('span', { class: 'domain' }, this.getDomainFromUrl(url))
                            ]);
                        } else {
                            return h('div', { class: 'day' }, [dayText]);
                        }
                    })
                )
            ]),
            h('aside')
        ];
    }
}).mount('#app');

export default null;
