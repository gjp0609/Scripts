import { aside } from '../../common/js/aside.js';

const { createApp, h } = Vue;
createApp({
    el: '#app',
    data() {
        return {};
    },
    mounted() {},
    methods: {},
    render() {
        return [h('aside', aside('translate')), h('article', [h('div', { class: 'title' }, [chrome.i18n.getMessage('translate_title')]), 'asd']), h('aside')];
    }
}).mount('#app');

export default null;
