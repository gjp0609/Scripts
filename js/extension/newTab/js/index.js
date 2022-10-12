import { aside } from '../../common/js/aside.js';
const { createApp, h } = Vue;
createApp({
    el: '#app',
    data() {
        return {
            url: ''
        };
    },
    mounted() {
        chrome.storage.local.get('newTabUrl', (val) => {
            this.url = val?.newTabUrl;
        });
    },
    methods: {
        setUrl() {
            chrome.storage.local.set({ newTabUrl: this.url });
            chrome.runtime.sendMessage(null, { from: 'newTab', action: 'updateUrl', params: { url: this.url } });
        }
    },
    render() {
        return [
            h('aside', aside('newTab')),
            h('article', [
                h('div', { class: 'title' }, [chrome.i18n.getMessage('newTab_title')]),
                h('div', { class: 'content' }, [
                    h('label', [chrome.i18n.getMessage('newTab_urlLabel')]),
                    h('input', {
                        value: this.url,
                        onInput: (e) => {
                            this.url = e.target.value;
                            this.$emit('input', e.target.value);
                        }
                    }),
                    h('button', { onClick: () => this.setUrl() }, [chrome.i18n.getMessage('newTab_save')])
                ])
            ]),
            h('aside')
        ];
    }
}).mount('#app');

export default null;
